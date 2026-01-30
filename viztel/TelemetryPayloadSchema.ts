// src/ouroboros/TelemetryPayloadSchema.ts

// OHLC (Open, High, Low, Close) 聚合数据结构
export interface AggregatedMetric {
    o: number; // Open
    h: number; // High
    l: number; // Low
    c: number; // Close
}

// 单个被监测元素的遥测数据
export interface ElementTelemetry {
    w: AggregatedMetric; // Weight (绝对权重)
    r: AggregatedMetric; // Rank (相对位序)
}

// 发送给 Golang 的最终 Payload
export interface TelemetryFrame {
    ts: number;         // Timestamp (ms)
    dur: number;        // Duration of this frame (ms)
    data: Record<string, ElementTelemetry>; // Key: data-ouro-id
}