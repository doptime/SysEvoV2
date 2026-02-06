// src/visual-telemetry/react/useSignalBinding.ts
// [Manifest]
// Role: The React Bridge for Logic Sensing
// Philosophy: "Bind the invisible state to the visible stream."
// @solves Case_Logic_State_Divergence, Case_React_Render_Noise

import { useEffect, useRef, useMemo, useContext } from 'react';
import { VirtualChannelManager } from '../VirtualChannelManager';
// 假设 TelemetryScopeContext 在 toolkit 中定义
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
 * @example
 * useSignalBinding('game_score', score, { threshold: 10 });
 */
export function useSignalBinding(
    localId: string, 
    value: number, 
    options?: SignalBindingOptions
): void {
    const scope = useContext(TelemetryScopeContext);
    const fullId = useMemo(() => resolveId(scope, localId), [scope, localId]);
    
    const prevRef = useRef<number | null>(null);
    // 使用 Ref 捕获 options 避免其引用变化触发 Effect
    const optsRef = useRef(options);
    optsRef.current = options;

    useEffect(() => {
        const channel = VirtualChannelManager.getInstance();
        const opts = optsRef.current;
        const strategy = opts?.strategy || 'onChange';
        const threshold = opts?.threshold || 0;
        const finalValue = opts?.transform ? opts.transform(value) : value;
        
        const report = (val: number) => {
            channel.pushMetric(fullId, 'value', val);
        };

        if (strategy === 'everyFrame') {
            report(finalValue);
        } else {
            const prev = prevRef.current;
            // @fix Case_Sentinel_Pollution: 显式检查 null，确保首帧必传
            if (prev === null || Math.abs(finalValue - prev) > threshold) {
                report(finalValue);
                prevRef.current = finalValue;
            }
        }
    }, [fullId, value]); 
}

/**
 * [Hook] 批量信号绑定 (实体模式)
 * 适合一次性上报对象的多个属性
 * @example
 * useSignalBindings('player', { hp: 100, mp: 50 });
 */
export function useSignalBindings(
    localId: string,
    signals: Record<string, number | { value: number, threshold?: number }>
): void {
    const scope = useContext(TelemetryScopeContext);
    const fullId = useMemo(() => resolveId(scope, localId), [scope, localId]);
    const cacheRef = useRef<Record<string, number>>({});

    // @fix Case_React_Render_Noise: 即使 signals 是字面量，也通过内部 diff 屏蔽无效更新
    useEffect(() => {
        const channel = VirtualChannelManager.getInstance();
        const cache = cacheRef.current;
        
        for (const [key, config] of Object.entries(signals)) {
            const { val, thres } = typeof config === 'number' 
                ? { val: config, thres: 0 } 
                : { val: config.value, thres: config.threshold || 0 };

            const prev = cache[key];
            if (prev === undefined || Math.abs(val - prev) > thres) {
                channel.pushMetric(fullId, key, val);
                cache[key] = val;
            }
        }
    }, [fullId, signals]); 
}

/**
 * [Hook] 混合遥测 (The Hybrid Solution)
 * 同时返回 DOM 属性（用于物理监控）和 Bind 函数（用于逻辑监控）。
 * @returns { domProps, bindSignal }
 */
export function useHybridTelemetry(
    localId: string,
    domOptions?: {
        watch?: string[];
        boost?: 'low' | 'high' | 'critical';
    }
) {
    const scope = useContext(TelemetryScopeContext);
    const fullId = useMemo(() => resolveId(scope, localId), [scope, localId]);
    
    // 稳定性优化：避免因为对象字面量导致的 domProps 刷新
    const memoizedWatch = useMemo(() => domOptions?.watch?.join(','), [domOptions?.watch]);

    const domProps = useMemo(() => {
        const props: Record<string, string> = { 'data-vt-id': fullId };
        if (memoizedWatch) props['data-vt-watch'] = memoizedWatch;
        if (domOptions?.boost) props['data-vt-boost'] = domOptions.boost;
        return props;
    }, [fullId, memoizedWatch, domOptions?.boost]);

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
 * @example
 * const thrust = useSignalRef('engine', 'thrust');
 * useFrame(() => { thrust.current = engine.val; });
 */
export function useSignalRef(
    localId: string, 
    metricKey: string,
    threshold: number = 0
): { current: number } {
    const scope = useContext(TelemetryScopeContext);
    const fullId = useMemo(() => resolveId(scope, localId), [scope, localId]);
    
    const internalValue = useRef(0);
    const lastPushed = useRef<number | null>(null); // 使用 null 适配去哨兵化逻辑
    const channel = VirtualChannelManager.getInstance();

    return useMemo(() => ({
        get current() { return internalValue.current; },
        set current(val: number) {
            internalValue.current = val;
            // 只有当存在有效变化时才穿透到 VirtualChannel
            if (lastPushed.current === null || Math.abs(val - lastPushed.current) > threshold) {
                channel.pushMetric(fullId, metricKey, val);
                lastPushed.current = val;
            }
        }
    }), [fullId, metricKey, threshold]);
}

// === Helpers ===

function resolveId(scope: string | null, localId: string): string {
    return scope ? `${scope}/${localId}` : localId;
}