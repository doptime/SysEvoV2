// src/visual-telemetry/react/contexts.ts
// [Manifest]
// Role: Shared Context Definitions
// @solves Case_Circular_Import

import { createContext } from 'react';

/**
 * [Context] 遥测作用域上下文
 * 用于存储当前的 ID 路径前缀 (e.g. "Game/Player/HUD")
 * 提取此文件以解决 toolkit.tsx 和 useSignalBinding.ts 的循环引用问题
 */
export const TelemetryScopeContext = createContext<string>('');