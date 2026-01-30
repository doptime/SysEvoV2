// src/ouroboros/DOMTelemetryRuntime.ts
import { computeVisualWeight, ElementPhysicalState } from './VisualAttentionModel';
import { TelemetryFrame, AggregatedMetric, ElementTelemetry } from './TelemetryPayloadSchema';

// 扩展 ElementTelemetry 以支持属性 K 线 (对应后端 DTO 的 Attrs map)
interface ExtendedElementTelemetry extends ElementTelemetry {
    a?: Record<string, AggregatedMetric>;
}

interface RuntimeContext {
    element: HTMLElement;
    currentWeight: number;
    // 缓存当前周期的聚合数据
    bufferWeight: AggregatedMetric;
    bufferRank: AggregatedMetric;
    
    // [New] 动态属性监控
    watchedAttrs: string[]; 
    bufferAttrs: Record<string, AggregatedMetric>;
}

export class DOMTelemetryRuntime {
    private static instance: DOMTelemetryRuntime;
    
    // 注册表：Key 为 data-vt-id (更新为 VisualTelemetry 标准)
    private registry: Map<string, RuntimeContext> = new Map();
    
    private isActive: boolean = false;
    private lastFlushTime: number = 0;
    private readonly FLUSH_INTERVAL_MS = 100;

    static getInstance(): DOMTelemetryRuntime {
        if (!DOMTelemetryRuntime.instance) {
            DOMTelemetryRuntime.instance = new DOMTelemetryRuntime();
        }
        return DOMTelemetryRuntime.instance;
    }

    /**
     * 扫描 DOM 并注册带有 data-vt-id 的元素
     */
    public registerActiveElements() {
        // [Update] 使用标准 data-vt-id
        const nodes = document.querySelectorAll<HTMLElement>('[data-vt-id]');
        nodes.forEach(el => {
            const id = el.dataset.vtId; // coding convention: data-vt-id -> dataset.vtId
            if (id && !this.registry.has(id)) {
                
                // [New] 解析需要监控的额外属性
                const watchStr = el.dataset.vtWatch || "";
                const watchedAttrs = watchStr ? watchStr.split(',').filter(s => s) : [];
                const bufferAttrs: Record<string, AggregatedMetric> = {};
                watchedAttrs.forEach(attr => bufferAttrs[attr] = this.createEmptyMetric());

                this.registry.set(id, {
                    element: el,
                    currentWeight: 0,
                    bufferWeight: this.createEmptyMetric(),
                    bufferRank: this.createEmptyMetric(),
                    watchedAttrs,
                    bufferAttrs
                });
            }
        });
    }

    public start() {
        if (this.isActive) return;
        this.isActive = true;
        this.lastFlushTime = performance.now();
        this.tick();
    }

    public stop() {
        this.isActive = false;
    }

    private tick = () => {
        if (!this.isActive) return;

        const now = performance.now();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        const snapshot: { id: string; weight: number }[] = [];
        
        this.registry.forEach((ctx, id) => {
            const rect = ctx.element.getBoundingClientRect();
            const style = window.getComputedStyle(ctx.element);
            
            // 1. 基础物理状态采样
            const opacity = parseFloat(style.opacity || '1');
            const zIndex = parseInt(style.zIndex || '0');

            const state: ElementPhysicalState = {
                width: rect.width,
                height: rect.height,
                x: rect.x,
                y: rect.y,
                opacity,
                zIndex,
                viewportW,
                viewportH
            };

            const weight = computeVisualWeight(state);
            ctx.currentWeight = weight;
            snapshot.push({ id, weight });

            // [New] 2. 额外属性采样 (Opacity, Scale, etc.)
            ctx.watchedAttrs.forEach(attr => {
                let val = 0;
                // 简单的属性提取逻辑
                switch (attr) {
                    case 'opacity': val = opacity; break;
                    case 'z-index': val = zIndex; break;
                    case 'x': val = rect.x; break;
                    case 'y': val = rect.y; break;
                    case 'width': val = rect.width; break;
                    case 'height': val = rect.height; break;
                    // scale/rotation 解析较复杂，此处暂略，可视需求增加 matrix 解析
                    default: break; 
                }
                this.updateMetric(ctx.bufferAttrs[attr], val);
            });
        });

        // 3. 排序：确定全局位序
        snapshot.sort((a, b) => b.weight - a.weight);

        // 4. 聚合：更新 Rank 和 Weight 缓冲区
        snapshot.forEach((item, index) => {
            const rank = index + 1;
            const ctx = this.registry.get(item.id)!;
            
            this.updateMetric(ctx.bufferWeight, item.weight);
            this.updateMetric(ctx.bufferRank, rank);
        });

        // 5. 传输
        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flushTelemetry(now);
            this.lastFlushTime = now;
        }

        requestAnimationFrame(this.tick);
    }

    private updateMetric(metric: AggregatedMetric, value: number) {
        if (metric.o === -1) {
            metric.o = value;
            metric.h = value;
            metric.l = value;
            metric.c = value;
        } else {
            metric.c = value;
            if (value > metric.h) metric.h = value;
            if (value < metric.l) metric.l = value;
        }
    }

    private createEmptyMetric(): AggregatedMetric {
        return { o: -1, h: -1, l: -1, c: -1 };
    }

    private flushTelemetry(timestamp: number) {
        // 使用 Extended 类型以包含 'a' (attrs)
        const payload: TelemetryFrame & { data: Record<string, ExtendedElementTelemetry> } = {
            ts: Math.floor(timestamp),
            dur: this.FLUSH_INTERVAL_MS,
            data: {}
        };

        let hasData = false;

        this.registry.forEach((ctx, id) => {
            if (ctx.bufferWeight.o !== -1) {
                // 构造 Payload
                const elemData: ExtendedElementTelemetry = {
                    w: { ...ctx.bufferWeight },
                    r: { ...ctx.bufferRank }
                };

                // [New] 如果有监控属性，打包进 'a' 字段
                if (ctx.watchedAttrs.length > 0) {
                    elemData.a = {};
                    ctx.watchedAttrs.forEach(attr => {
                        elemData.a![attr] = { ...ctx.bufferAttrs[attr] };
                        // 重置属性缓冲区
                        ctx.bufferAttrs[attr] = this.createEmptyMetric();
                    });
                }

                payload.data[id] = elemData;
                
                // 重置基础缓冲区
                ctx.bufferWeight = this.createEmptyMetric();
                ctx.bufferRank = this.createEmptyMetric();
                hasData = true;
            }
        });

        if (hasData) {
            const jsonPayload = JSON.stringify(payload);

            // [Update] 双模发送机制 (Dual Mode)
            // 1. 优先：自动化测试隧道 (Playwright/Puppeteer 注入)
            if ((window as any).__OUROBOROS_TUNNEL__) {
                (window as any).__OUROBOROS_TUNNEL__(jsonPayload);
            } 
            // 2. 其次：已存在的 RUM 隧道 (Project Ouroboros 原始设计)
            else if ((window as any).telemetryTunnel) {
                (window as any).telemetryTunnel(jsonPayload);
            }
            // 3. (可选) 这里可以添加真实用户 Fetch 逻辑
        }
    }
}
