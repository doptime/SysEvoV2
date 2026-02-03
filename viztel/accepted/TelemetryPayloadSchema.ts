// src/visual-telemetry/TelemetryPayloadSchema.ts
// [Manifest]
// Role: Data Protocol Definition
// Philosophy: "The Shape of Truth. Universal K-Lines for all signals."

// === 基础 K 线单元 (Universal K-Line) ===

export interface AggregatedMetric {
    o: number; // Open
    h: number; // High
    l: number; // Low
    c: number; // Close
    
    // [Evolution: Sedimentation]
    // 即使当前版本未使用，保留字段槽位以兼容 SysEvoV1 的历史数据或未来的熵计算
    cnt?: number; // Sample Count
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
    a?: Record<string, AggregatedMetric>;
}

// === 传输帧 (The Frame) ===

/**
 * [Modified] 统一遥测帧
 * 支持多源合流 (DOM + Virtual)
 */
export interface TelemetryFrame {
    ts: number;         // Timestamp (ms)
    dur: number;        // Duration (ms)
    
    // [New] 数据来源标记
    // 用于后端区分处理逻辑 (e.g. "dom" 需要做热力图渲染，"virtual" 需要做数值分析)
    sources?: ('dom' | 'virtual')[];
    
    // Payload
    data: Record<string, ElementTelemetry>; // Key: data-vt-id
}