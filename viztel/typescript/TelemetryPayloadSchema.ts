// src/visual-telemetry/TelemetryPayloadSchema.ts
// [Manifest]
// Role: Data Protocol Definition
// Philosophy: "The Shape of Truth. Universal K-Lines for all signals."

// === 基础 K 线单元 (Universal K-Line) ===

export interface AggregatedMetric {
    /** Open: 初始值 */
    o: number | null;
    /** High: 最大值 */
    h: number | null; 
    /** Low: 最小值 */
    l: number | null; 
    /** Close: 结束值 */
    c: number | null; 
    cnt?: number;
}

// === 元素遥测数据 (The Node) ===

/**
 * [Modified] 扩展后的元素遥测结构
 * @solves Case_Dynamic_Visuals, Case_Virtual_Telemetry
 */
export interface ElementTelemetry {
    // 1. Visual Weight (DOM 物理属性)
    // 仅 DOM 元素存在此字段
    w?: AggregatedMetric; 
    
    // 2. Rank (注意力位序)
    // 仅 DOM 元素存在此字段
    r?: AggregatedMetric;
    
    // 3. Attributes & Signals (通用插座)
    // 包含: 
    // - UI Physics: rotation, scale, opacity
    // - Virtual Logic: score, health, velocity
    // - Audio: energy_rms, peak_level
    a?: Record<string, AggregatedMetric>;
}

// === 传输帧 (The Frame) ===

/**
 * [Modified] 统一遥测帧
 * 支持多源合流 (DOM + Virtual + Audio)
 */
export interface TelemetryFrame {
    ts: number;         // Timestamp (ms)
    sid?: string;       // Scenario ID (Session Context)
    
    // 数据源标记，帮助后端快速路由
    sources: ('dom' | 'virtual' | 'audio')[]; 
    
    // 拍平的节点映射: ID -> Data
    data: Record<string, ElementTelemetry>;
}