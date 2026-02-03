// src/visual-telemetry/react/useSignalBinding.ts
// [Manifest]
// Role: The React Bridge for Logic Sensing
// Philosophy: "Bind the invisible state to the visible stream."
// @solves Case_Logic_State_Divergence

import { useEffect, useRef, useMemo, useContext, createContext } from 'react';
import { VirtualChannelManager } from '../VirtualChannelManager';
// 假设 TelemetryScopeContext 在 toolkit 中定义，若无则在此 fallback 定义以解耦
import { TelemetryScopeContext } from './toolkit'; 

// === Types ===

export interface SignalBindingOptions {
    /** * 采样策略
     * - 'onChange': 仅值变化时上报 (默认，适合离散状态)
     * - 'everyFrame': 每一帧都上报 (适合连续物理量，如速度、坐标)
     */
    strategy?: 'onChange' | 'everyFrame';
    
    /**
     * 波动阈值
     * 只有变化量 > threshold 时才上报，用于过滤浮点数抖动
     * @default 0
     */
    threshold?: number;
    
    /**
     * 数据转换器
     * e.g., 将 Vector3 转为 length
     */
    transform?: (val: any) => number;
}

// === Hooks ===

/**
 * [Hook] 单信号绑定
 * 将 React State 桥接到 Virtual Channel
 * * @example
 * useSignalBinding('game_score', score, { threshold: 10 });
 */
export function useSignalBinding(
    localId: string, 
    value: number, 
    options?: SignalBindingOptions
): void {
    const scope = useContext(TelemetryScopeContext);
    const fullId = resolveId(scope, localId);
    
    // 保持 ref 以便在 effect 中比较，避免闭包陷阱
    const prevRef = useRef<number | null>(null);
    const optsRef = useRef(options);
    optsRef.current = options;

    useEffect(() => {
        const channel = VirtualChannelManager.getInstance();
        const opts = optsRef.current;
        const strategy = opts?.strategy || 'onChange';
        const threshold = opts?.threshold || 0;
        
        // 核心上报逻辑
        const report = (val: number) => {
             // 默认 metricKey 为 'value'，如果需要更细粒度推荐使用 useSignalBindings
            channel.pushMetric(fullId, 'value', val);
        };

        if (strategy === 'everyFrame') {
            report(value);
        } else {
            const prev = prevRef.current;
            if (prev === null || Math.abs(value - prev) > threshold) {
                report(value);
                prevRef.current = value;
            }
        }
    }, [fullId, value]); // 依赖 value 触发更新
}

/**
 * [Hook] 批量信号绑定 (实体模式)
 * 适合一次性上报对象的多个属性
 * * @example
 * useSignalBindings('player', { hp: 100, mp: 50 });
 */
export function useSignalBindings(
    localId: string,
    signals: Record<string, number | { value: number, threshold?: number }>
): void {
    const scope = useContext(TelemetryScopeContext);
    const fullId = resolveId(scope, localId);
    
    // 存储上一次上报的值，用于 diff
    const cacheRef = useRef<Record<string, number>>({});

    useEffect(() => {
        const channel = VirtualChannelManager.getInstance();
        const cache = cacheRef.current;
        
        for (const [key, config] of Object.entries(signals)) {
            const { val, thres } = typeof config === 'number' 
                ? { val: config, thres: 0 } 
                : { val: config.value, thres: config.threshold || 0 };

            const prev = cache[key];
            
            // Diff Check
            if (prev === undefined || Math.abs(val - prev) > thres) {
                channel.pushMetric(fullId, key, val);
                cache[key] = val;
            }
        }
    }, [fullId, signals]); // 注意：signals 对象引用变化会触发，调用方需注意 memo
}

/**
 * [Hook] 混合遥测 (The Hybrid Solution)
 * 同时返回 DOM 属性（用于物理监控）和 Bind 函数（用于逻辑监控）。
 * 完美解决 "UI显示" 与 "逻辑数值" 分离的问题。
 * * @returns { domProps, bindSignal }
 */
export function useHybridTelemetry(
    localId: string,
    domOptions?: {
        watch?: string[]; // e.g. ['opacity', 'rotation']
        boost?: 'low' | 'high' | 'critical';
    }
) {
    const scope = useContext(TelemetryScopeContext);
    const fullId = resolveId(scope, localId);
    
    // 1. 生成 DOM 属性 (不变部分)
    const domProps = useMemo(() => {
        const props: Record<string, string> = {
            'data-vt-id': fullId
        };
        if (domOptions?.watch?.length) {
            props['data-vt-watch'] = domOptions.watch.join(',');
        }
        if (domOptions?.boost) {
            props['data-vt-boost'] = domOptions.boost;
        }
        return props;
    }, [fullId, JSON.stringify(domOptions)]); // 简单序列化比较配置

    // 2. 生成逻辑绑定函数 (Imperative API)
    // 使用 ref 缓存状态，允许在回调或渲染循环中直接调用
    const channelRef = useRef(VirtualChannelManager.getInstance());
    const lastValuesRef = useRef<Record<string, number>>({});

    const bindSignal = (key: string, value: number, threshold: number = 0) => {
        const prev = lastValuesRef.current[key];
        if (prev === undefined || Math.abs(value - prev) > threshold) {
            channelRef.current.pushMetric(fullId, key, value);
            lastValuesRef.current[key] = value;
        }
    };

    return { domProps, bindSignal };
}

/**
 * [Hook] 高频引用 (For Loop / Canvas)
 * 返回一个 Proxy Ref，赋值即上报。
 * * @example
 * const thrust = useSignalRef('engine', 'thrust');
 * useFrame(() => { thrust.current = engine.val; });
 */
export function useSignalRef(
    localId: string, 
    metricKey: string,
    threshold: number = 0
): { current: number } {
    const scope = useContext(TelemetryScopeContext);
    const fullId = resolveId(scope, localId);
    
    const internalValue = useRef(0);
    const lastPushed = useRef(0);
    const channel = VirtualChannelManager.getInstance();

    // 创建 Proxy 对象模拟 Ref 行为
    return useMemo(() => ({
        get current() { return internalValue.current; },
        set current(val: number) {
            internalValue.current = val;
            if (Math.abs(val - lastPushed.current) > threshold) {
                channel.pushMetric(fullId, metricKey, val);
                lastPushed.current = val;
            }
        }
    }), [fullId, metricKey, threshold]);
}

// === Helpers ===

function resolveId(scope: string, localId: string): string {
    return scope ? `${scope}/${localId}` : localId;
}