// src/visual-telemetry/react/useSignalBinding.ts
// @solves Case_Logic_State_Divergence
// 将 React 状态自动绑定到遥测流，确保"显示值"与"逻辑值"同步上报

import { useEffect, useRef, useContext, createContext, useMemo } from 'react';
import { VirtualChannelManager } from '../VirtualChannelManager';

// === 复用 toolkit.tsx 的 Scope Context ===
const TelemetryScopeContext = createContext<string>("");
export { TelemetryScopeContext };

// === 类型定义 ===

/**
 * 信号绑定配置
 */
interface SignalBindingOptions {
    /** 
     * 采样策略
     * - 'onChange': 仅在值变化时推送（默认）
     * - 'everyFrame': 每帧都推送，适合高频动画
     */
    strategy?: 'onChange' | 'everyFrame';
    
    /**
     * 变化阈值：值变化超过此阈值才触发推送
     * 用于过滤浮点数微小波动
     */
    threshold?: number;
    
    /**
     * 值转换器：将复杂类型转换为数值
     * @example (vec3) => vec3.length()
     */
    transform?: (value: any) => number;
}

/**
 * 批量信号定义
 */
type SignalMap = Record<string, number | { value: number; options?: SignalBindingOptions }>;

// === 核心 Hook ===

/**
 * useSignalBinding
 * 
 * 将单个状态值绑定到遥测流。
 * 
 * @param localId 局部标识符（会自动拼接 Scope 前缀）
 * @param metricKey 指标名称
 * @param value 当前值
 * @param options 配置项
 * 
 * @example
 * function AngleDisplay({ angle }: { angle: number }) {
 *     // 自动上报 angle 值到 "protractor/display:angle"
 *     useSignalBinding('display', 'angle', angle);
 *     return <div>{angle}°</div>;
 * }
 */
export function useSignalBinding(
    localId: string,
    metricKey: string,
    value: number,
    options?: SignalBindingOptions
): void {
    const scope = useContext(TelemetryScopeContext);
    const fullId = scope ? `${scope}/${localId}` : localId;
    
    const prevValueRef = useRef<number | null>(null);
    const strategy = options?.strategy ?? 'onChange';
    const threshold = options?.threshold ?? 0;
    const transform = options?.transform;
    
    useEffect(() => {
        const channel = VirtualChannelManager.getInstance();
        const actualValue = transform ? transform(value) : value;
        
        if (strategy === 'everyFrame') {
            // 每帧推送模式：直接推送
            channel.pushMetric(fullId, metricKey, actualValue);
        } else {
            // onChange 模式：检查变化
            const prev = prevValueRef.current;
            if (prev === null || Math.abs(actualValue - prev) > threshold) {
                channel.pushMetric(fullId, metricKey, actualValue);
                prevValueRef.current = actualValue;
            }
        }
    }, [fullId, metricKey, value, strategy, threshold, transform]);
}

/**
 * useSignalBindings
 * 
 * 批量绑定多个状态值。适合游戏实体等有多个属性的场景。
 * 
 * @param localId 局部标识符
 * @param signals 信号映射表
 * 
 * @example
 * function Ship({ ship }: { ship: ShipState }) {
 *     useSignalBindings('ship', {
 *         health: ship.health,
 *         fuel: ship.fuel,
 *         speed: { value: ship.velocity.length(), options: { threshold: 0.1 } }
 *     });
 *     return <div>...</div>;
 * }
 */
export function useSignalBindings(localId: string, signals: SignalMap): void {
    const scope = useContext(TelemetryScopeContext);
    const fullId = scope ? `${scope}/${localId}` : localId;
    
    const prevValuesRef = useRef<Record<string, number>>({});
    
    useEffect(() => {
        const channel = VirtualChannelManager.getInstance();
        const prevValues = prevValuesRef.current;
        
        for (const [key, config] of Object.entries(signals)) {
            const { value, threshold } = typeof config === 'number'
                ? { value: config, threshold: 0 }
                : { value: config.value, threshold: config.options?.threshold ?? 0 };
            
            const prev = prevValues[key];
            if (prev === undefined || Math.abs(value - prev) > threshold) {
                channel.pushMetric(fullId, key, value);
                prevValues[key] = value;
            }
        }
    }, [fullId, signals]);
}

/**
 * useSignalRef
 * 
 * 返回一个可变 ref，写入时自动推送到遥测流。
 * 适合命令式代码（如 Three.js 渲染循环）。
 * 
 * @example
 * function GameCanvas() {
 *     const thrustRef = useSignalRef('engine', 'thrust');
 *     
 *     useFrame(() => {
 *         thrustRef.current = engine.thrust; // 自动推送
 *     });
 * }
 */
export function useSignalRef(
    localId: string,
    metricKey: string,
    options?: SignalBindingOptions
): React.MutableRefObject<number> {
    const scope = useContext(TelemetryScopeContext);
    const fullId = scope ? `${scope}/${localId}` : localId;
    
    const threshold = options?.threshold ?? 0;
    const internalRef = useRef<number>(0);
    const lastPushedRef = useRef<number>(0);
    
    // 创建一个代理 ref，拦截 set 操作
    const proxyRef = useMemo(() => ({
        get current() {
            return internalRef.current;
        },
        set current(val: number) {
            internalRef.current = val;
            
            if (Math.abs(val - lastPushedRef.current) > threshold) {
                VirtualChannelManager.getInstance().pushMetric(fullId, metricKey, val);
                lastPushedRef.current = val;
            }
        }
    }), [fullId, metricKey, threshold]);
    
    return proxyRef as React.MutableRefObject<number>;
}

// === 高级：与 DOM 遥测混合 ===

/**
 * useHybridTelemetry
 * 
 * 同时返回 DOM 属性和信号绑定函数。
 * 用于需要同时监控视觉权重和逻辑状态的元素。
 * 
 * @example
 * function ScoreCard({ score }: { score: number }) {
 *     const { domProps, bindSignal } = useHybridTelemetry('score_card');
 *     
 *     bindSignal('value', score);
 *     
 *     return <div {...domProps}>{score}</div>;
 * }
 */
export function useHybridTelemetry(localId: string, domOptions?: {
    watch?: string[];
    boost?: 'low' | 'high' | 'critical';
}) {
    const scope = useContext(TelemetryScopeContext);
    const fullId = scope ? `${scope}/${localId}` : localId;
    
    const signalCache = useRef<Record<string, number>>({});
    
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
    }, [fullId, domOptions?.watch, domOptions?.boost]);
    
    const bindSignal = useMemo(() => {
        return (key: string, value: number, threshold = 0) => {
            const prev = signalCache.current[key];
            if (prev === undefined || Math.abs(value - prev) > threshold) {
                VirtualChannelManager.getInstance().pushMetric(fullId, key, value);
                signalCache.current[key] = value;
            }
        };
    }, [fullId]);
    
    return { domProps, bindSignal };
}


// example usage:

// import { TelemetryScope } from './toolkit';
// import { 
//     useSignalBinding, 
//     useSignalBindings, 
//     useSignalRef,
//     useHybridTelemetry 
// } from './useSignalBinding';

// // === 场景 1: 量角器游戏 (解决 Case_Logic_State_Divergence) ===
// function Protractor({ logicAngle }: { logicAngle: number }) {
//     // 视觉显示可能是 60°，但逻辑值是 59.7°
//     // 现在两者都会被上报，后端可以检测偏差
//     useSignalBinding('meter', 'logic_angle', logicAngle);
    
//     return (
//         <div 
//             data-vt-id="protractor/meter" 
//             data-vt-watch="rotation"
//             style={{ transform: `rotate(${logicAngle}deg)` }}
//         >
//             {Math.round(logicAngle)}°
//         </div>
//     );
// }

// // === 场景 2: 飞船实体 (批量绑定) ===
// function ShipHUD({ ship }: { ship: ShipState }) {
//     useSignalBindings('stats', {
//         health: ship.health,
//         fuel: ship.fuel,
//         speed: { 
//             value: Math.sqrt(ship.vx ** 2 + ship.vy ** 2), 
//             options: { threshold: 0.5 } 
//         }
//     });
    
//     return <div>HP: {ship.health} | Fuel: {ship.fuel}</div>;
// }

// // === 场景 3: Three.js 渲染循环 (命令式) ===
// function GameCanvas() {
//     const thrustRef = useSignalRef('engine', 'thrust');
//     const altitudeRef = useSignalRef('flight', 'altitude', { threshold: 1 });
    
//     useFrame(() => {
//         thrustRef.current = engine.currentThrust;
//         altitudeRef.current = ship.position.y;
//     });
    
//     return <Canvas>...</Canvas>;
// }

// // === 场景 4: 分数卡片 (DOM + 逻辑混合) ===
// function ScoreCard({ score, combo }: { score: number; combo: number }) {
//     const { domProps, bindSignal } = useHybridTelemetry('card', {
//         watch: ['opacity', 'scale'],
//         boost: 'high'
//     });
    
//     // 每次渲染时绑定逻辑值
//     bindSignal('score', score);
//     bindSignal('combo', combo);
    
//     return (
//         <div {...domProps} className="score-card">
//             <span>{score}</span>
//             <span>x{combo}</span>
//         </div>
//     );
// }

// // === 完整页面组合 ===
// function GamePage() {
//     return (
//         <TelemetryScope name="game">
//             <TelemetryScope name="hud">
//                 <ShipHUD ship={shipState} />
//                 <ScoreCard score={score} combo={combo} />
//             </TelemetryScope>
//             <Protractor logicAngle={currentAngle} />
//         </TelemetryScope>
//     );
// }
// // 生成的 ID: "game/hud/stats", "game/hud/card", "game/protractor/meter"
// ```

// ---

// ## 数据流架构
// ```
// ┌─────────────────────────────────────────────────────────────┐
// │                      React Components                        │
// ├──────────────────┬──────────────────┬───────────────────────┤
// │  useSignalBinding │ useSignalBindings │   useHybridTelemetry │
// │  (单值)           │ (批量)            │   (DOM + 逻辑)        │
// └────────┬─────────┴────────┬─────────┴───────────┬───────────┘
//          │                  │                     │
//          ▼                  ▼                     ▼
// ┌─────────────────────────────────────────────────────────────┐
// │               VirtualChannelManager.pushMetric()            │
// └─────────────────────────────┬───────────────────────────────┘
//                               │
//                               ▼
// ┌─────────────────────────────────────────────────────────────┐
// │          DOMTelemetryRuntime.flushUnifiedTelemetry()        │
// │                    (DOM + Virtual 合流)                      │
// └─────────────────────────────┬───────────────────────────────┘
//                               │
//                               ▼
//                      __OUROBOROS_TUNNEL__