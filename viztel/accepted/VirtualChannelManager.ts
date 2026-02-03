// src/visual-telemetry/VirtualChannelManager.ts
// [Manifest]
// Role: The Universal Signal Socket
// Philosophy: "Logic is Signal. All signals can be aggregated into K-Lines."
// @solves Case_Virtual_Telemetry, Case_Logic_State_Divergence

import { AggregatedMetric } from './TelemetryPayloadSchema';

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
 * 单例模式，作为全局事件总线存在，解耦生产者（业务代码）与消费者（遥测运行时）。
 */
export class VirtualChannelManager {
    private static instance: VirtualChannelManager;
    
    // Registry: Key = "targetId:metricKey" (复合键，O(1) 存取)
    private signals: Map<string, VirtualSignalContext> = new Map();
    
    // 配置
    private readonly FLUSH_INTERVAL_MS = 100;
    private lastFlushTime: number = 0;
    private isActive: boolean = false;
    private rafId: number | null = null; // 仅在 Standalone 模式下使用

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
     * * @param targetId 对象ID (e.g., "game/player")
     * @param metricKey 指标名 (e.g., "health", "velocity")
     * @param value 当前瞬时值
     */
    public pushMetric(targetId: string, metricKey: string, value: number): void {
        // 使用复合键避免嵌套 Map 的开销
        const compositeKey = `${targetId}:${metricKey}`;
        
        let ctx = this.signals.get(compositeKey);
        if (!ctx) {
            ctx = {
                buffer: this.createEmptyMetric(),
                lastUpdateTime: 0
            };
            this.signals.set(compositeKey, ctx);
        }
        
        // 实时聚合 OHLC
        this.updateMetric(ctx.buffer, value);
        ctx.lastUpdateTime = performance.now();
    }

    /**
     * [Socket] 批量推送
     * 用于一次性上报实体的所有状态
     */
    public pushBatch(targetId: string, metrics: Record<string, number>): void {
        for (const [key, value] of Object.entries(metrics)) {
            this.pushMetric(targetId, key, value);
        }
    }

    // === Integration API (For Runtime) ===

    /**
     * [Harvest] 收割当前周期的聚合数据
     * 由 DOMTelemetryRuntime 在每一帧末尾调用，确保 Logic 数据与 DOM 数据同帧传输。
     * 调用后会重置缓冲区。
     * * @returns 结构化数据: { "game/player": { "health": { o,h,l,c }, ... } }
     */
    public harvest(): Record<string, Record<string, AggregatedMetric>> {
        const result: Record<string, Record<string, AggregatedMetric>> = {};
        const now = performance.now();
        
        // 遍历所有活跃信号
        this.signals.forEach((ctx, compositeKey) => {
            // 只收割有数据的信号 (Spare K-Line)
            if (ctx.buffer.o === -1) return;
            
            const [targetId, metricKey] = this.parseCompositeKey(compositeKey);
            
            if (!result[targetId]) {
                result[targetId] = {};
            }
            
            // 导出快照
            result[targetId][metricKey] = { ...ctx.buffer };
            
            // 重置缓冲区 (Reset for next frame)
            ctx.buffer = this.createEmptyMetric();
        });
        
        // [Optional] 周期性清理陈旧信号 (每 100 次 harvest 检查一次，或基于时间)
        // 这里为了性能暂不主动调用，依赖外部或 prune 策略
        
        return result;
    }

    /**
     * [Maintenance] 清理陈旧信号
     * 移除长时间未更新的 Metric，释放内存。
     * 建议在场景切换或空闲时调用。
     * * @param timeoutMs 判定陈旧的阈值 (默认 10秒)
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
        
        if (removedCount > 0) {
            console.debug(`[Ouroboros] Pruned ${removedCount} stale virtual signals.`);
        }
        return removedCount;
    }

    // === Standalone Mode (Optional) ===
    
    /**
     * 仅在无 DOM 环境（如纯 Worker 或 Node.js）下使用。
     * 在浏览器环境中，通常跟随 DOMTelemetryRuntime 的心跳。
     */
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

        const payload = {
            ts: Math.floor(timestamp),
            dur: this.FLUSH_INTERVAL_MS,
            sources: ['virtual'],
            data: {} as any
        };

        // 格式化为 ExtendedElementTelemetry 结构 (仅含 'a' 字段)
        for (const [targetId, metrics] of Object.entries(harvested)) {
            payload.data[targetId] = { a: metrics };
        }

        const jsonPayload = JSON.stringify(payload);
        const win = window as any;
        if (win.__OUROBOROS_TUNNEL__) {
            win.__OUROBOROS_TUNNEL__(jsonPayload);
        } else if (win.telemetryTunnel) {
            win.telemetryTunnel(jsonPayload);
        }
    }

    // === Helpers ===

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

    // 解析复合键 "id:key" -> [id, key]
    // 假设 id 中不包含 ':'，或者我们只取最后一个 ':' 作为分隔符
    private parseCompositeKey(key: string): [string, string] {
        const lastIdx = key.lastIndexOf(':');
        if (lastIdx === -1) return [key, 'value']; // Fallback
        return [key.substring(0, lastIdx), key.substring(lastIdx + 1)];
    }
}

// === Exports ===
export const virtualChannel = VirtualChannelManager.getInstance();