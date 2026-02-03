// src/visual-telemetry/DOMTelemetryRuntime.ts
// [Manifest]
// Role: The Sensing Engine (Phase 1)
// Philosophy: "Code is Context. The runtime is the sole source of visual truth."
// @solves Case_Dynamic_Visuals, Case_Virtual_Telemetry

import { computeVisualWeight, ElementPhysicalState } from './VisualAttentionModel';
import { TelemetryFrame, AggregatedMetric, ElementTelemetry } from './TelemetryPayloadSchema';
import { VirtualChannelManager } from './VirtualChannelManager';

// === 扩展遥测定义 ===

/**
 * [Extended] 包含通用属性槽位的遥测节点
 * @solves Case_Dynamic_Visuals
 */
interface ExtendedElementTelemetry extends ElementTelemetry {
    // 动态属性集合 (Rotation, Opacity, Custom Logic)
    a?: Record<string, AggregatedMetric>;
}

/**
 * [Runtime Context] 运行时状态缓存
 * 用于维护 K 线生成的中间态 (High/Low/Close)
 */
interface RuntimeContext {
    element: HTMLElement;
    // 上一帧的权重 (用于 diff 或快速查表)
    lastWeight: number;
    
    // K 线缓冲区 (OHLC)
    bufferWeight: AggregatedMetric;
    bufferRank: AggregatedMetric;
    
    // 属性监控配置
    watchedAttrs: string[]; 
    bufferAttrs: Record<string, AggregatedMetric>;
}

/**
 * [Protocol] 统一遥测帧
 * 明确区分数据来源，便于后端分层处理
 */
interface UnifiedTelemetryFrame extends TelemetryFrame {
    sources: ('dom' | 'virtual')[];
}

export class DOMTelemetryRuntime {
    private static instance: DOMTelemetryRuntime;
    
    // 核心注册表：只存储活跃的、受监控的节点
    private registry: Map<string, RuntimeContext> = new Map();
    
    // 虚拟信道管理器 (用于合流)
    private virtualChannel: VirtualChannelManager;
    
    // 调度状态
    private isActive: boolean = false;
    private observer: MutationObserver | null = null;
    private rafId: number | null = null;
    
    // 传输配置
    private lastFlushTime: number = 0;
    private readonly FLUSH_INTERVAL_MS = 100; // 10Hz 采样率

    private constructor() {
        this.virtualChannel = VirtualChannelManager.getInstance();
        // 初始化 "衔尾蛇" (Ouroboros) 监听器
        this.observer = new MutationObserver(this.handleMutations);
    }

    static getInstance(): DOMTelemetryRuntime {
        if (!DOMTelemetryRuntime.instance) {
            DOMTelemetryRuntime.instance = new DOMTelemetryRuntime();
        }
        return DOMTelemetryRuntime.instance;
    }

    /**
     * [Lifecycle] 启动感知引擎
     * 1. 执行全量扫描 (Initial State)
     * 2. 挂载 MutationObserver (Dynamic State)
     * 3. 启动 Tick 循环 (Sampling)
     */
    public start() {
        if (this.isActive) return;
        this.isActive = true;

        // 1. 初始全量扫描 (Bootstrapping)
        this.scanAndRegister(document.body);

        // 2. 启动环境感知
        if (this.observer) {
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true, 
                attributeFilter: ['data-vt-id', 'data-vt-watch', 'style', 'class'] // 仅关注可能影响视觉的属性
            });
        }

        // 3. 启动心跳
        this.lastFlushTime = performance.now();
        this.tick();
        
        console.debug(`[Ouroboros] Runtime started. Monitoring ${this.registry.size} elements.`);
    }

    public stop() {
        this.isActive = false;
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    public getVirtualChannel(): VirtualChannelManager {
        return this.virtualChannel;
    }

    // === Mutation Handling (The Ouroboros Loop) ===

    private handleMutations = (mutations: MutationRecord[]) => {
        mutations.forEach(mutation => {
            // 处理节点新增
            mutation.addedNodes.forEach(node => {
                if (node instanceof HTMLElement) {
                    this.scanAndRegister(node);
                }
            });

            // 处理节点移除
            mutation.removedNodes.forEach(node => {
                if (node instanceof HTMLElement) {
                    this.scanAndUnregister(node);
                }
            });

            // 处理属性变更 (动态重配)
            if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
                const el = mutation.target;
                if (el.dataset.vtId) {
                    // 如果 ID 变了或 Watch 列表变了，重新注册以更新上下文
                    this.tryRegister(el); 
                }
            }
        });
    }

    private scanAndRegister(root: HTMLElement) {
        this.tryRegister(root);
        const candidates = root.querySelectorAll<HTMLElement>('[data-vt-id]');
        candidates.forEach(el => this.tryRegister(el));
    }

    private scanAndUnregister(root: HTMLElement) {
        this.tryUnregister(root);
        const candidates = root.querySelectorAll<HTMLElement>('[data-vt-id]');
        candidates.forEach(el => this.tryUnregister(el));
    }

    private tryRegister(el: HTMLElement) {
        const id = el.dataset.vtId;
        if (!id) return;

        // 解析 Watch 列表
        const watchStr = el.dataset.vtWatch || "";
        const watchedAttrs = watchStr ? watchStr.split(',').filter(s => s) : [];

        // 如果已存在，检查是否需要更新配置
        const existing = this.registry.get(id);
        if (existing) {
            // 简单的 diff 检查，如果监控属性变了，更新上下文
            if (existing.watchedAttrs.join(',') !== watchedAttrs.join(',')) {
                existing.watchedAttrs = watchedAttrs;
                // 重新初始化 Buffer
                watchedAttrs.forEach(attr => {
                    if (!existing.bufferAttrs[attr]) existing.bufferAttrs[attr] = this.createEmptyMetric();
                });
            }
            return;
        }

        // 新注册
        const bufferAttrs: Record<string, AggregatedMetric> = {};
        watchedAttrs.forEach(attr => bufferAttrs[attr] = this.createEmptyMetric());

        this.registry.set(id, {
            element: el,
            lastWeight: 0,
            bufferWeight: this.createEmptyMetric(),
            bufferRank: this.createEmptyMetric(),
            watchedAttrs,
            bufferAttrs
        });
    }

    private tryUnregister(el: HTMLElement) {
        const id = el.dataset.vtId;
        if (id && this.registry.has(id)) {
            this.registry.delete(id);
        }
    }

    // === The Heartbeat (Sampling & Aggregation) ===

    private tick = () => {
        if (!this.isActive) return;

        const now = performance.now();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        const snapshot: { id: string; weight: number }[] = [];
        
        // 1. Sampling Phase
        this.registry.forEach((ctx, id) => {
            // [Safety] 惰性清理：防止 MutationObserver 漏网之鱼
            if (!ctx.element.isConnected) {
                this.registry.delete(id);
                return;
            }

            // 物理采样 (DOM Read)
            const rect = ctx.element.getBoundingClientRect();
            const style = window.getComputedStyle(ctx.element);
            
            // 解析基础属性
            const opacity = parseFloat(style.opacity || '1');
            const zIndex = parseInt(style.zIndex || '0');

            // 构建物理状态模型
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

            // 计算视觉权重 (Attention Model)
            const weight = computeVisualWeight(state);
            ctx.lastWeight = weight;
            snapshot.push({ id, weight });

            // 扩展属性采样 (@solves Case_Dynamic_Visuals)
            ctx.watchedAttrs.forEach(attr => {
                let val = 0;
                switch (attr) {
                    case 'opacity': val = opacity; break;
                    case 'z-index': val = zIndex; break;
                    case 'x': val = rect.x; break;
                    case 'y': val = rect.y; break;
                    case 'width': val = rect.width; break;
                    case 'height': val = rect.height; break;
                    case 'rotation': val = this.parseRotation(style.transform); break;
                    case 'scale': val = this.parseScale(style.transform); break;
                    default: break; // 自定义属性需通过 VirtualChannel 推送
                }
                this.updateMetric(ctx.bufferAttrs[attr], val);
            });
        });

        // 2. Ranking Phase (Relative Order)
        // 只有活跃的元素参与排序，分母纯净
        snapshot.sort((a, b) => b.weight - a.weight);

        // 3. Aggregation Phase
        snapshot.forEach((item, index) => {
            const rank = index + 1;
            const ctx = this.registry.get(item.id);
            if (ctx) {
                this.updateMetric(ctx.bufferWeight, item.weight);
                this.updateMetric(ctx.bufferRank, rank);
            }
        });

        // 4. Transmission Phase
        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flushUnifiedTelemetry(now);
            this.lastFlushTime = now;
        }

        this.rafId = requestAnimationFrame(this.tick);
    }

    /**
     * [Core] 统一传输：合并 DOM Visuals + Virtual Signals
     */
    private flushUnifiedTelemetry(timestamp: number) {
        const payload: UnifiedTelemetryFrame = {
            ts: Math.floor(timestamp),
            dur: this.FLUSH_INTERVAL_MS,
            sources: [],
            data: {}
        };

        let hasData = false;

        // A. 提取 DOM 数据
        this.registry.forEach((ctx, id) => {
            // 只有当窗口内有数据产生时才上报 (Spare K-Line)
            if (ctx.bufferWeight.o !== -1) {
                const elemData: ExtendedElementTelemetry = {
                    w: { ...ctx.bufferWeight },
                    r: { ...ctx.bufferRank }
                };

                // 附加观察属性
                if (ctx.watchedAttrs.length > 0) {
                    elemData.a = {};
                    ctx.watchedAttrs.forEach(attr => {
                        elemData.a![attr] = { ...ctx.bufferAttrs[attr] };
                        // Reset attr buffer
                        ctx.bufferAttrs[attr] = this.createEmptyMetric();
                    });
                }

                payload.data[id] = elemData;
                
                // Reset core buffer
                ctx.bufferWeight = this.createEmptyMetric();
                ctx.bufferRank = this.createEmptyMetric();
                
                hasData = true;
            }
        });
        if (hasData) payload.sources.push('dom');

        // B. 提取 Virtual Channel 数据
        const virtualData = this.virtualChannel.harvest();
        if (Object.keys(virtualData).length > 0) {
            payload.sources.push('virtual');
            hasData = true;
            
            // Merge Strategy: Deep Merge
            for (const [targetId, metrics] of Object.entries(virtualData)) {
                if (payload.data[targetId]) {
                    // Hybrid Node: 既有 DOM 表现又有逻辑数据
                    const existing = payload.data[targetId] as ExtendedElementTelemetry;
                    existing.a = { ...(existing.a || {}), ...metrics };
                } else {
                    // Pure Virtual Node
                    payload.data[targetId] = { a: metrics } as ExtendedElementTelemetry;
                }
            }
        }

        // C. 通过隧道发送
        if (hasData) {
            const jsonPayload = JSON.stringify(payload);
            const win = window as any;
            if (win.__OUROBOROS_TUNNEL__) {
                win.__OUROBOROS_TUNNEL__(jsonPayload);
            } else if (win.telemetryTunnel) {
                win.telemetryTunnel(jsonPayload);
            }
        }
    }

    // === Helpers ===

    // OHLC 更新逻辑
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

    /**
     * 解析 CSS Matrix 获取旋转角度 (2D)
     * transform: matrix(a, b, c, d, tx, ty)
     * rotation = atan2(b, a)
     */
    private parseRotation(transform: string): number {
        if (!transform || transform === 'none') return 0;
        try {
            const values = transform.split('(')[1].split(')')[0].split(',');
            const a = parseFloat(values[0]);
            const b = parseFloat(values[1]);
            const angleRad = Math.atan2(b, a);
            return Math.round(angleRad * (180 / Math.PI)); // Returns degrees
        } catch (e) {
            return 0;
        }
    }

    /**
     * 解析 CSS Matrix 获取缩放比例 (近似值)
     * scale = sqrt(a*a + b*b)
     */
    private parseScale(transform: string): number {
        if (!transform || transform === 'none') return 1;
        try {
            const values = transform.split('(')[1].split(')')[0].split(',');
            const a = parseFloat(values[0]);
            const b = parseFloat(values[1]);
            return Math.sqrt(a * a + b * b);
        } catch (e) {
            return 1;
        }
    }
}