// src/ouroboros/TelemetryPayloadSchema.ts

// [Retained] OHLC 聚合数据结构 (保持 v16.0 核心)
export interface AggregatedMetric {
    o: number; // Open
    h: number; // High
    l: number; // Low
    c: number; // Close
}

// [Modified] 单个被监测元素的遥测数据
export interface ElementTelemetry {
    w: AggregatedMetric; // Weight (绝对权重)
    r: AggregatedMetric; // Rank (相对位序)
    
    // [New] 扩展属性集合 (Universal Socket Payload)
    // @solves Case_Dynamic_Visuals (rotation, opacity)
    // @solves Case_Logic_State_Divergence (score, custom logic)
    // Key: "rotation", "opacity", "score", "thrust"
    a?: Record<string, AggregatedMetric>;
}

// [Retained] 发送给 Golang 的最终 Payload
export interface TelemetryFrame {
    ts: number;         // Timestamp (ms)
    dur: number;        // Duration (ms)
    data: Record<string, ElementTelemetry>; // Key: data-vt-id
}