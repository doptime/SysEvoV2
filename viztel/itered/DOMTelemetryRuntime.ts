// src/visual-telemetry/DOMTelemetryRuntime.ts
// Version: Unified Stream (DOM + Virtual Channel)

import { computeVisualWeight, ElementPhysicalState } from './VisualAttentionModel';
import { TelemetryFrame, AggregatedMetric, ElementTelemetry } from './TelemetryPayloadSchema';
import { VirtualChannelManager } from './VirtualChannelManager';

interface ExtendedElementTelemetry extends ElementTelemetry {
    a?: Record<string, AggregatedMetric>;
}

interface RuntimeContext {
    element: HTMLElement;
    currentWeight: number;
    bufferWeight: AggregatedMetric;
    bufferRank: AggregatedMetric;
    watchedAttrs: string[];
    bufferAttrs: Record<string, AggregatedMetric>;
}

/**
 * 统一遥测帧结构
 * 扩展 TelemetryFrame 以支持来源标记
 */
interface UnifiedTelemetryFrame extends TelemetryFrame {
    // 数据来源标记：用于后端区分处理逻辑
    sources: ('dom' | 'virtual')[];
}

export class DOMTelemetryRuntime {
    private static instance: DOMTelemetryRuntime;
    
    private registry: Map<string, RuntimeContext> = new Map();
    private isActive: boolean = false;
    private lastFlushTime: number = 0;
    private readonly FLUSH_INTERVAL_MS = 100;
    
    // [New] 虚拟信道引用
    private virtualChannel: VirtualChannelManager;

    private constructor() {
        // 获取 VirtualChannelManager 单例
        this.virtualChannel = VirtualChannelManager.getInstance();
    }

    static getInstance(): DOMTelemetryRuntime {
        if (!DOMTelemetryRuntime.instance) {
            DOMTelemetryRuntime.instance = new DOMTelemetryRuntime();
        }
        return DOMTelemetryRuntime.instance;
    }

    public registerActiveElements() {
        const nodes = document.querySelectorAll<HTMLElement>('[data-vt-id]');
        nodes.forEach(el => {
            const id = el.dataset.vtId;
            if (id && !this.registry.has(id)) {
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

    /**
     * [New] 获取虚拟信道管理器，供外部直接推送数据
     */
    public getVirtualChannel(): VirtualChannelManager {
        return this.virtualChannel;
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

            ctx.watchedAttrs.forEach(attr => {
                let val = 0;
                switch (attr) {
                    case 'opacity': val = opacity; break;
                    case 'z-index': val = zIndex; break;
                    case 'x': val = rect.x; break;
                    case 'y': val = rect.y; break;
                    case 'width': val = rect.width; break;
                    case 'height': val = rect.height; break;
                    default: break;
                }
                this.updateMetric(ctx.bufferAttrs[attr], val);
            });
        });

        snapshot.sort((a, b) => b.weight - a.weight);

        snapshot.forEach((item, index) => {
            const rank = index + 1;
            const ctx = this.registry.get(item.id)!;
            this.updateMetric(ctx.bufferWeight, item.weight);
            this.updateMetric(ctx.bufferRank, rank);
        });

        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flushUnifiedTelemetry(now);
            this.lastFlushTime = now;
        }

        requestAnimationFrame(this.tick);
    }

    /**
     * [Modified] 统一传输：合并 DOM + Virtual Channel 数据
     */
    private flushUnifiedTelemetry(timestamp: number) {
        const payload: UnifiedTelemetryFrame = {
            ts: Math.floor(timestamp),
            dur: this.FLUSH_INTERVAL_MS,
            sources: [],
            data: {}
        };

        let hasData = false;

        // === Part 1: 收集 DOM 遥测数据 ===
        this.registry.forEach((ctx, id) => {
            if (ctx.bufferWeight.o !== -1) {
                const elemData: ExtendedElementTelemetry = {
                    w: { ...ctx.bufferWeight },
                    r: { ...ctx.bufferRank }
                };

                if (ctx.watchedAttrs.length > 0) {
                    elemData.a = {};
                    ctx.watchedAttrs.forEach(attr => {
                        elemData.a![attr] = { ...ctx.bufferAttrs[attr] };
                        ctx.bufferAttrs[attr] = this.createEmptyMetric();
                    });
                }

                payload.data[id] = elemData;
                ctx.bufferWeight = this.createEmptyMetric();
                ctx.bufferRank = this.createEmptyMetric();
                hasData = true;
            }
        });

        if (hasData) {
            payload.sources.push('dom');
        }

        // === Part 2: 收集 Virtual Channel 数据 ===
        const virtualData = this.virtualChannel.harvest();
        
        for (const [targetId, metrics] of Object.entries(virtualData)) {
            // 合并策略：如果 ID 已存在（DOM 元素也有该 ID），追加到 'a' 字段
            // 如果不存在，创建新条目（仅含 'a' 字段，无 w/r）
            if (payload.data[targetId]) {
                // 已有 DOM 数据，合并属性
                const existing = payload.data[targetId] as ExtendedElementTelemetry;
                existing.a = { ...(existing.a || {}), ...metrics };
            } else {
                // 纯虚拟数据，无 Weight/Rank
                payload.data[targetId] = { a: metrics } as ExtendedElementTelemetry;
            }
            hasData = true;
        }

        if (Object.keys(virtualData).length > 0) {
            payload.sources.push('virtual');
        }

        // === Part 3: 传输 ===
        if (hasData) {
            const jsonPayload = JSON.stringify(payload);

            if ((window as any).__OUROBOROS_TUNNEL__) {
                (window as any).__OUROBOROS_TUNNEL__(jsonPayload);
            } else if ((window as any).telemetryTunnel) {
                (window as any).telemetryTunnel(jsonPayload);
            }
        }
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
}

// === 便捷导出：统一入口 ===
export const telemetry = {
    start: () => DOMTelemetryRuntime.getInstance().start(),
    stop: () => DOMTelemetryRuntime.getInstance().stop(),
    scan: () => DOMTelemetryRuntime.getInstance().registerActiveElements(),
    push: (id: string, key: string, val: number) => 
        DOMTelemetryRuntime.getInstance().getVirtualChannel().pushMetric(id, key, val),
    pushBatch: (id: string, metrics: Record<string, number>) => 
        DOMTelemetryRuntime.getInstance().getVirtualChannel().pushBatch(id, metrics)
};

// example usage:

// json{
//   "ts": 1704067200000,
//   "dur": 100,
//   "sources": ["dom", "virtual"],
//   "data": {
//     "game/player": {
//       "w": { "o": 5000, "h": 5200, "l": 4800, "c": 5100 },
//       "r": { "o": 1, "h": 2, "l": 1, "c": 1 },
//       "a": {
//         "opacity": { "o": 1, "h": 1, "l": 0.8, "c": 0.9 }
//       }
//     },
//     "ship/engine": {
//       "a": {
//         "thrust": { "o": 0.5, "h": 0.92, "l": 0.3, "c": 0.85 },
//         "fuel": { "o": 100, "h": 100, "l": 97, "c": 98 }
//       }
//     }
//   }
// }

// import { telemetry } from './DOMTelemetryRuntime';

// // 初始化
// telemetry.scan();  // 扫描 DOM 元素
// telemetry.start(); // 启动采集循环

// // 游戏循环中推送虚拟数据
// function gameLoop() {
//     telemetry.pushBatch('ship/engine', {
//         thrust: engine.thrust,
//         fuel: engine.fuel,
//         temperature: engine.temp
//     });
//     requestAnimationFrame(gameLoop);
// }