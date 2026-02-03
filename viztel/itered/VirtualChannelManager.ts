// src/visual-telemetry/VirtualChannelManager.ts
// @solves Case_Virtual_Telemetry, Case_Logic_State_Divergence

import { AggregatedMetric } from './TelemetryPayloadSchema';

/**
 * 虚拟信号的缓冲上下文
 * 与 DOMTelemetryRuntime 的 RuntimeContext 对齐
 */
interface VirtualSignalContext {
    buffer: AggregatedMetric;
    lastPushTime: number;
}

/**
 * VirtualChannelManager
 * 
 * 职责：接收非 DOM 来源的遥测数据（游戏逻辑、后端状态、物理引擎等），
 * 统一转换为 K 线格式，与 DOM 遥测数据合流传输。
 * 
 * @example
 * // 游戏循环中推送推力数据
 * VirtualChannelManager.getInstance().pushMetric('ship/engine', 'thrust', 0.85);
 * 
 * // React 组件中推送分数
 * VirtualChannelManager.getInstance().pushMetric('game/score', 'value', score);
 */
export class VirtualChannelManager {
    private static instance: VirtualChannelManager;
    
    // Registry: Key = "targetId:metricKey" (复合键)
    private signals: Map<string, VirtualSignalContext> = new Map();
    
    // 配置：与 DOMTelemetryRuntime 保持一致
    private readonly FLUSH_INTERVAL_MS = 100;
    private lastFlushTime: number = 0;
    private isActive: boolean = false;
    private rafId: number | null = null;

    static getInstance(): VirtualChannelManager {
        if (!VirtualChannelManager.instance) {
            VirtualChannelManager.instance = new VirtualChannelManager();
        }
        return VirtualChannelManager.instance;
    }

    /**
     * 核心 API：推送虚拟信号
     * @param targetId 目标标识符 (如 "ship/engine", "game/player")
     * @param metricKey 指标名称 (如 "thrust", "health", "score")
     * @param value 当前值
     */
    public pushMetric(targetId: string, metricKey: string, value: number): void {
        const compositeKey = `${targetId}:${metricKey}`;
        
        let ctx = this.signals.get(compositeKey);
        if (!ctx) {
            ctx = {
                buffer: this.createEmptyMetric(),
                lastPushTime: performance.now()
            };
            this.signals.set(compositeKey, ctx);
        }
        
        this.updateMetric(ctx.buffer, value);
        ctx.lastPushTime = performance.now();
    }

    /**
     * 批量推送：适用于游戏循环等高频场景
     * @param targetId 目标标识符
     * @param metrics 键值对集合
     */
    public pushBatch(targetId: string, metrics: Record<string, number>): void {
        for (const [key, value] of Object.entries(metrics)) {
            this.pushMetric(targetId, key, value);
        }
    }

    /**
     * 启动虚拟信道的独立 Flush 循环
     * 注意：如果 DOMTelemetryRuntime 已启动，建议使用 attachTo() 共享循环
     */
    public start(): void {
        if (this.isActive) return;
        this.isActive = true;
        this.lastFlushTime = performance.now();
        this.tick();
    }

    public stop(): void {
        this.isActive = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 获取当前周期的聚合数据并重置缓冲区
     * 供 DOMTelemetryRuntime 调用，实现合流传输
     */
    public harvest(): Record<string, Record<string, AggregatedMetric>> {
        const result: Record<string, Record<string, AggregatedMetric>> = {};
        
        this.signals.forEach((ctx, compositeKey) => {
            if (ctx.buffer.o === -1) return; // 无数据
            
            const [targetId, metricKey] = this.parseCompositeKey(compositeKey);
            
            if (!result[targetId]) {
                result[targetId] = {};
            }
            result[targetId][metricKey] = { ...ctx.buffer };
            
            // Reset buffer
            ctx.buffer = this.createEmptyMetric();
        });
        
        return result;
    }

    /**
     * 清理长时间无更新的信号（可选的内存优化）
     * @param staleThresholdMs 超时阈值，默认 30 秒
     */
    public pruneStaleSignals(staleThresholdMs: number = 30000): number {
        const now = performance.now();
        let pruned = 0;
        
        this.signals.forEach((ctx, key) => {
            if (now - ctx.lastPushTime > staleThresholdMs) {
                this.signals.delete(key);
                pruned++;
            }
        });
        
        return pruned;
    }

    // === Private Methods ===

    private tick = (): void => {
        if (!this.isActive) return;
        
        const now = performance.now();
        
        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flush(now);
            this.lastFlushTime = now;
        }
        
        this.rafId = requestAnimationFrame(this.tick);
    };

    private flush(timestamp: number): void {
        const harvested = this.harvest();
        
        if (Object.keys(harvested).length === 0) return;
        
        // 构造与 DOMTelemetryRuntime 兼容的 Payload 格式
        const payload = {
            ts: Math.floor(timestamp),
            dur: this.FLUSH_INTERVAL_MS,
            source: 'virtual', // 标记数据来源
            data: {} as Record<string, { a: Record<string, AggregatedMetric> }>
        };
        
        for (const [targetId, metrics] of Object.entries(harvested)) {
            payload.data[targetId] = { a: metrics };
        }
        
        const jsonPayload = JSON.stringify(payload);
        
        // 复用 DOMTelemetryRuntime 的双模发送机制
        if ((window as any).__OUROBOROS_TUNNEL__) {
            (window as any).__OUROBOROS_TUNNEL__(jsonPayload);
        } else if ((window as any).telemetryTunnel) {
            (window as any).telemetryTunnel(jsonPayload);
        }
    }

    private updateMetric(metric: AggregatedMetric, value: number): void {
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

    private parseCompositeKey(key: string): [string, string] {
        const idx = key.lastIndexOf(':');
        return [key.substring(0, idx), key.substring(idx + 1)];
    }
}

// === 便捷导出 ===
export const pushMetric = (id: string, key: string, val: number) => 
    VirtualChannelManager.getInstance().pushMetric(id, key, val);

export const pushBatch = (id: string, metrics: Record<string, number>) => 
    VirtualChannelManager.getInstance().pushBatch(id, metrics);


//example usage:
// typescript// 1. 游戏循环中推送物理数据
// function gameLoop() {
//     const thrust = engine.getThrust();
//     const velocity = ship.velocity.length();
    
//     pushBatch('ship/physics', {
//         thrust,
//         velocity,
//         fuel: engine.fuel
//     });
    
//     requestAnimationFrame(gameLoop);
// }

// // 2. React 组件中推送逻辑状态
// function ScoreDisplay({ score }: { score: number }) {
//     useEffect(() => {
//         pushMetric('game/score', 'value', score);
//     }, [score]);
    
//     return <div>{score}</div>;
// }