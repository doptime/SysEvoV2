// src/visual-telemetry/VirtualChannelManager.ts
// [Manifest]
// Role: The Universal Signal Socket
// Philosophy: "Logic is Signal. All signals can be aggregated into K-Lines."
// @solves Case_Virtual_Telemetry, Case_Logic_State_Divergence, Case_No_Delivery_Guarantee

import { AggregatedMetric, TelemetryFrame } from './TelemetryPayloadSchema';

/**
 * [Context] 虚拟信号的运行时缓冲
 * 维护单个信号维度的 OHLC 状态
 */
interface VirtualSignalContext {
    buffer: AggregatedMetric;
    lastUpdateTime: number; // 用于判定 Stale 信号
}

/**
 * [Manager] 虚拟信道管理器
 * 支持单例模式，也支持实例化以满足并行测试需求。
 */
export class VirtualChannelManager {
    private static instance: VirtualChannelManager;
    
    // Registry: Key = "targetId:metricKey" (复合键，O(1) 存取)
    private signals: Map<string, VirtualSignalContext> = new Map();
    
    // 传输缓冲 (Delivery Guarantee)
    private pendingFrames: string[] = []; 
    private readonly MAX_PENDING = 200;

    // 配置
    private readonly FLUSH_INTERVAL_MS = 100;
    private lastFlushTime: number = 0;
    private isActive: boolean = false;
    private rafId: number | null = null; // 仅在 Standalone 模式下使用

    // @fix Case_Singleton_Parallelism: 允许公开构造函数
    constructor() {}

    static getInstance(): VirtualChannelManager {
        if (!VirtualChannelManager.instance) {
            VirtualChannelManager.instance = new VirtualChannelManager();
        }
        return VirtualChannelManager.instance;
    }

    // === Public API (The Socket) ===

    /**
     * [Socket] 推送原子指标
     * O(1) 操作，适合高频调用 (如 requestAnimationFrame 内部)
     * @param targetId 对象ID (e.g., "game/player")
     * @param metricKey 指标名 (e.g., "health", "velocity")
     * @param value 当前瞬时值
     */
    public pushMetric(targetId: string, metricKey: string, value: number): void {
        const compositeKey = `${targetId}:${metricKey}`;
        
        let ctx = this.signals.get(compositeKey);
        if (!ctx) {
            ctx = {
                buffer: this.createEmptyMetric(),
                lastUpdateTime: 0
            };
            this.signals.set(compositeKey, ctx);
        }
        
        this.updateMetric(ctx.buffer, value);
        ctx.lastUpdateTime = performance.now();
    }

    /**
     * [Socket] 推送已聚合指标 (Audio/Physics Bypass)
     * @fix Case_Audio_Double_Aggregation: 允许直接传入 OHLC，避免二次聚合丢失极值
     */
    public pushAggregated(targetId: string, metricKey: string, metric: AggregatedMetric): void {
        if (metric.o === null) return;
        const compositeKey = `${targetId}:${metricKey}`;
        
        let ctx = this.signals.get(compositeKey);
        if (!ctx || ctx.buffer.o === null) {
            this.signals.set(compositeKey, {
                buffer: { ...metric },
                lastUpdateTime: performance.now()
            });
        } else {
            const b = ctx.buffer;
            b.h = Math.max(b.h!, metric.h!);
            b.l = Math.min(b.l!, metric.l!);
            b.c = metric.c;
            ctx.lastUpdateTime = performance.now();
        }
    }

    /**
     * [Socket] 批量推送
     */
    public pushBatch(targetId: string, metrics: Record<string, number>): void {
        for (const [key, value] of Object.entries(metrics)) {
            this.pushMetric(targetId, key, value);
        }
    }

    // === Integration API (For Runtime) ===

    /**
     * [Harvest] 收割当前周期的聚合数据
     */
    public harvest(): Record<string, Record<string, AggregatedMetric>> {
        const result: Record<string, Record<string, AggregatedMetric>> = {};
        
        this.signals.forEach((ctx, compositeKey) => {
            // @fix Case_Sentinel_Pollution: 检查 null 而非 -1
            if (ctx.buffer.o === null) return;
            
            const [targetId, metricKey] = this.parseCompositeKey(compositeKey);
            if (!result[targetId]) result[targetId] = {};
            
            result[targetId][metricKey] = { ...ctx.buffer };
            ctx.buffer = this.createEmptyMetric();
        });
        
        return result;
    }

    /**
     * [Maintenance] 清理陈旧信号
     */
    public pruneStaleSignals(timeoutMs: number = 10000): number {
        const now = performance.now();
        let removedCount = 0;
        this.signals.forEach((ctx, key) => {
            if (now - ctx.lastUpdateTime > timeoutMs) {
                this.signals.delete(key);
                removedCount++;
            }
        });
        return removedCount;
    }

    // === Standalone Mode ===
    
    public startStandalone() {
        if (this.isActive) return;
        this.isActive = true;
        this.lastFlushTime = performance.now();
        this.tick();
    }

    public stopStandalone() {
        this.isActive = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private tick = () => {
        if (!this.isActive) return;
        const now = performance.now();
        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flushStandalone(now);
            this.lastFlushTime = now;
        }
        this.rafId = requestAnimationFrame(this.tick);
    }

    private flushStandalone(timestamp: number) {
        const harvested = this.harvest();
        if (Object.keys(harvested).length === 0) return;

        const payload: TelemetryFrame = {
            ts: Math.floor(timestamp),
            sources: ['virtual'],
            data: {} as any
        };

        for (const [targetId, metrics] of Object.entries(harvested)) {
            payload.data[targetId] = { a: metrics };
        }

        this.send(JSON.stringify(payload));
    }

    // === Transport (Robust) ===

    /**
     * [Send] 带有缓冲机制的发送
     * @fix Case_No_Delivery_Guarantee
     */
    private send(payloadStr: string) {
        const win = window as any;
        const tunnel = win.__OUROBOROS_TUNNEL__ || win.telemetryTunnel;

        if (tunnel) {
            // 1. 优先清空历史积压
            while (this.pendingFrames.length > 0) {
                const pending = this.pendingFrames.shift();
                if (pending) tunnel(pending);
            }
            // 2. 发送当前帧
            tunnel(payloadStr);
        } else {
            // 3. 隧道未就绪，存入环形缓冲区
            if (this.pendingFrames.length >= this.MAX_PENDING) {
                this.pendingFrames.shift(); // 丢弃最老数据
            }
            this.pendingFrames.push(payloadStr);
        }
    }

    // === Helpers ===

    private updateMetric(metric: AggregatedMetric, value: number) {
        // @fix Case_Sentinel_Pollution: 第一次赋值时同时初始化 OHLC，避免后续 Math.min 报错
        if (metric.o === null) {
            metric.o = metric.h = metric.l = metric.c = value;
        } else {
            metric.c = value;
            if (value > metric.h!) metric.h = value;
            if (value < metric.l!) metric.l = value;
        }
    }

    private createEmptyMetric(): AggregatedMetric {
        return { o: null, h: null, l: null, c: null };
    }

    private parseCompositeKey(key: string): [string, string] {
        const lastIdx = key.lastIndexOf(':');
        if (lastIdx === -1) return [key, 'value'];
        return [key.substring(0, lastIdx), key.substring(lastIdx + 1)];
    }
}

export const virtualChannel = VirtualChannelManager.getInstance();