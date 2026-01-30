// Path: src/visual-telemetry/react/toolkit.tsx

import React, { createContext, useContext, useMemo } from 'react';

// =============================================================================
// 1. 类型定义 (Type Definitions)
// =============================================================================

/**
 * 视觉遥测配置选项
 * 用于微调特定元素的监测行为
 */
export interface TelemetryOptions {
    /**
     * 显式指定需要高频监测的视觉属性。
     * 默认情况下，系统仅监测位置和大小。
     * 如果你有动画（如淡入淡出、旋转），请在此声明。
     */
    watch?: ('opacity' | 'scale' | 'rotation' | 'z-index')[];

    /**
     * 人为修正权重 (Weight Boost)
     * 用于那些物理尺寸很小，但业务逻辑上极重要的按钮（如关闭广告的 'X'）。
     * - low: x0.5 (降低关注度)
     * - high: x1.5 (提升关注度)
     * - critical: x2.0 (强制最高优先级)
     */
    boost?: 'low' | 'high' | 'critical';
}

/**
 * 生成的 DOM 属性接口
 * 用于 React 的 Props Spreading
 */
export interface TelemetryProps {
    'data-vt-id': string;
    'data-vt-watch'?: string;
    'data-vt-boost'?: string;
}

// =============================================================================
// 2. 核心工具函数 (Core Utilities)
// =============================================================================

/**
 * 构造遥测属性对象
 * @param id 唯一标识符，建议使用路径格式 "scope/feature/element"
 * @param options 配置项
 * @returns 包含 data-vt-* 的属性对象
 */
export function track(id: string, options?: TelemetryOptions): TelemetryProps {
    const props: TelemetryProps = {
        'data-vt-id': id,
    };

    if (options?.watch && options.watch.length > 0) {
        props['data-vt-watch'] = options.watch.join(',');
    }

    if (options?.boost) {
        props['data-vt-boost'] = options.boost;
    }

    return props;
}

// =============================================================================
// 3. 作用域系统 (Scope System)
// =============================================================================

// 上下文：存储当前的路径前缀
const TelemetryScopeContext = createContext<string>("");

/**
 * 遥测作用域组件 (TelemetryScope)
 * 用于为子组件自动附加 ID 前缀，避免重复书写长路径。
 * * @example
 * <TelemetryScope name="main_menu">
 * <Button {...useTrack('start')} />  -> ID: "main_menu/start"
 * </TelemetryScope>
 */
export const TelemetryScope: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
    const parentScope = useContext(TelemetryScopeContext);
    
    // 自动处理路径拼接，遵循 '/' 分隔符标准
    const currentScope = useMemo(() => {
        // 如果 parentScope 为空，直接使用 name；否则拼接
        return parentScope ? `${parentScope}/${name}` : name;
    }, [parentScope, name]);
    
    return (
        <TelemetryScopeContext.Provider value={currentScope}>
            {children}
        </TelemetryScopeContext.Provider>
    );
};

// =============================================================================
// 4. React Hooks
// =============================================================================

/**
 * 自动感知作用域的埋点 Hook
 * 推荐在 React 组件内部使用此 Hook，而不是直接使用 track() 函数。
 * * @param localId 当前组件内的局部 ID (例如 "submit_btn")
 * @param options 配置项
 */
export const useTrack = (localId: string, options?: TelemetryOptions): TelemetryProps => {
    const scope = useContext(TelemetryScopeContext);
    
    // 组合最终的完整 ID
    const fullId = scope ? `${scope}/${localId}` : localId;
    
    return useMemo(() => track(fullId, options), [fullId, JSON.stringify(options)]);
};