// src/visual-telemetry/react/toolkit.tsx
// [Manifest]
// Role: React Integration Layer
// Philosophy: "Declarative bindings for Imperative runtime."

import React, { createContext, useContext, useMemo } from 'react';
export { TelemetryScopeContext } from './useSignalBinding';
import { TelemetryScopeContext } from './useSignalBinding';

// === Types ===

export interface TelemetryOptions {
    /** 显式监控的 CSS 属性 (Visual Physics) */
    watch?: ('opacity' | 'scale' | 'rotation' | 'z-index' | 'x' | 'y')[];
    
    /** 权重人为修正 (Attention Boost) */
    boost?: 'low' | 'high' | 'critical';
}

export interface TelemetryProps {
    'data-vt-id': string;
    'data-vt-watch'?: string;
    'data-vt-boost'?: string;
}

// === Scope System ===

/**
 * [Component] 遥测作用域
 * 自动拼接 ID 路径，构建层级化的命名空间
 */
export const TelemetryScope: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
    const parentScope = useContext(TelemetryScopeContext);
    const currentScope = useMemo(() => parentScope ? `${parentScope}/${name}` : name, [parentScope, name]);
    
    return (
        <TelemetryScopeContext.Provider value={currentScope}>
            {children}
        </TelemetryScopeContext.Provider>
    );
};

// === DOM Helpers ===

/**
 * [Helper] 生成 DOM 绑定属性
 * 配合 DOMTelemetryRuntime 的 MutationObserver 使用
 */
export function track(id: string, options?: TelemetryOptions): TelemetryProps {
    const props: TelemetryProps = {
        'data-vt-id': id,
    };
    if (options?.watch?.length) {
        props['data-vt-watch'] = options.watch.join(',');
    }
    if (options?.boost) {
        props['data-vt-boost'] = options.boost;
    }
    return props;
}

/**
 * [Hook] 自动感知作用域的 track
 */
export const useTrack = (localId: string, options?: TelemetryOptions): TelemetryProps => {
    const scope = useContext(TelemetryScopeContext);
    const fullId = scope ? `${scope}/${localId}` : localId;
    return useMemo(() => track(fullId, options), [fullId, JSON.stringify(options)]);
};

// === Re-exports for Convenience ===
// 统一导出所有 React 相关 Hook
export { 
    useSignalBinding, 
    useSignalBindings, 
    useSignalRef, 
    useHybridTelemetry 
} from './useSignalBinding';