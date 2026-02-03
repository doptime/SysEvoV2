// src/visual-telemetry/diagnosis/MarkerAlignmentAnalyzer.ts
// @solves Case_Input_Output_Correlation
// 分析 Marker 区间内 Input/Output 相关性，检测"无响应死锁"

import { AggregatedMetric } from '../TelemetryPayloadSchema';

// === 数据结构 ===

/**
 * 单帧遥测快照 (从传输 Payload 解析)
 */
export interface TelemetrySnapshot {
    ts: number;
    data: Record<string, {
        w?: AggregatedMetric;
        r?: AggregatedMetric;
        a?: Record<string, AggregatedMetric>;
    }>;
}

/**
 * Marker 事件
 */
export interface MarkerEvent {
    name: string;
    timestamp: number;
    meta?: Record<string, any>;
}

/**
 * 区间分析配置
 */
export interface AnalysisConfig {
    // Input 信号选择器 (默认: __cursor__, __input__)
    inputSignals?: string[];
    // Output 信号选择器 (默认: 所有非 __ 前缀的信号)
    outputSignals?: string[];
    // 相关性阈值：低于此值视为异常
    correlationThreshold?: number;
    // 输入方差阈值：高于此值才认为有有效输入
    inputVarianceThreshold?: number;
    // 输出方差阈值：低于此值视为无响应
    outputVarianceThreshold?: number;
}

/**
 * 区间分析结果
 */
export interface IntervalAnalysis {
    startMarker: string;
    endMarker: string;
    startTime: number;
    endTime: number;
    duration: number;
    
    // 统计量
    inputVariance: number;
    outputVariance: number;
    correlation: number;
    
    // 诊断结论
    diagnosis: DiagnosisType;
    confidence: number;
    details: string;
}

type DiagnosisType = 
    | 'HEALTHY'           // 正常：输入输出相关
    | 'NO_RESPONSE'       // 无响应：有输入但无输出变化
    | 'AUTONOMOUS'        // 自主变化：无输入但有输出（动画等）
    | 'CHAOTIC'           // 混沌：输入输出不相关
    | 'IDLE'              // 空闲：无输入无输出
    | 'INSUFFICIENT_DATA';// 数据不足

/**
 * 完整诊断报告
 */
export interface DiagnosisReport {
    scenarioId: string;
    analyzedAt: number;
    totalFrames: number;
    intervals: IntervalAnalysis[];
    
    // 汇总
    summary: {
        healthyCount: number;
        anomalyCount: number;
        overallHealth: number; // 0-1
    };
    
    // 告警
    alerts: Alert[];
}

interface Alert {
    severity: 'warning' | 'critical';
    interval: string;
    message: string;
}

// === 核心分析器 ===

export class MarkerAlignmentAnalyzer {
    private frames: TelemetrySnapshot[] = [];
    private markers: MarkerEvent[] = [];
    private config: Required<AnalysisConfig>;

    constructor(config?: AnalysisConfig) {
        this.config = {
            inputSignals: config?.inputSignals || ['__cursor__', '__input__'],
            outputSignals: config?.outputSignals || [], // 空 = 自动检测
            correlationThreshold: config?.correlationThreshold ?? 0.3,
            inputVarianceThreshold: config?.inputVarianceThreshold ?? 0.01,
            outputVarianceThreshold: config?.outputVarianceThreshold ?? 0.001
        };
    }

    /**
     * 接收遥测帧 (实时流式接入)
     */
    ingestFrame(frame: TelemetrySnapshot): void {
        this.frames.push(frame);
        
        // 检测 Marker
        if (frame.data['__markers__']?.a) {
            for (const [name, metric] of Object.entries(frame.data['__markers__'].a)) {
                if (metric.c > 0) {
                    this.markers.push({ name, timestamp: metric.c });
                }
            }
        }
    }

    /**
     * 批量导入帧数据
     */
    importFrames(frames: TelemetrySnapshot[]): void {
        frames.forEach(f => this.ingestFrame(f));
    }

    /**
     * 手动注册 Marker
     */
    registerMarker(name: string, timestamp: number, meta?: Record<string, any>): void {
        this.markers.push({ name, timestamp, meta });
        this.markers.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * 执行完整诊断
     */
    analyze(scenarioId: string): DiagnosisReport {
        const intervals: IntervalAnalysis[] = [];
        const alerts: Alert[] = [];

        // 按时间排序 Marker
        const sortedMarkers = [...this.markers].sort((a, b) => a.timestamp - b.timestamp);

        // 分析相邻 Marker 对之间的区间
        for (let i = 0; i < sortedMarkers.length - 1; i++) {
            const start = sortedMarkers[i];
            const end = sortedMarkers[i + 1];
            
            const analysis = this.analyzeInterval(start, end);
            intervals.push(analysis);

            // 生成告警
            if (analysis.diagnosis === 'NO_RESPONSE') {
                alerts.push({
                    severity: 'critical',
                    interval: `${start.name} → ${end.name}`,
                    message: `检测到无响应：输入方差 ${analysis.inputVariance.toFixed(4)} 但输出方差仅 ${analysis.outputVariance.toFixed(6)}`
                });
            } else if (analysis.diagnosis === 'CHAOTIC') {
                alerts.push({
                    severity: 'warning',
                    interval: `${start.name} → ${end.name}`,
                    message: `输入输出相关性异常低 (${analysis.correlation.toFixed(3)})，可能存在逻辑错误`
                });
            }
        }

        // 计算汇总
        const healthyCount = intervals.filter(i => i.diagnosis === 'HEALTHY' || i.diagnosis === 'AUTONOMOUS').length;
        const anomalyCount = intervals.filter(i => i.diagnosis === 'NO_RESPONSE' || i.diagnosis === 'CHAOTIC').length;

        return {
            scenarioId,
            analyzedAt: Date.now(),
            totalFrames: this.frames.length,
            intervals,
            summary: {
                healthyCount,
                anomalyCount,
                overallHealth: intervals.length > 0 ? healthyCount / intervals.length : 1
            },
            alerts
        };
    }

    /**
     * 分析单个 Marker 区间
     */
    private analyzeInterval(start: MarkerEvent, end: MarkerEvent): IntervalAnalysis {
        // 提取区间内的帧
        const intervalFrames = this.frames.filter(
            f => f.ts >= start.timestamp && f.ts <= end.timestamp
        );

        if (intervalFrames.length < 3) {
            return {
                startMarker: start.name,
                endMarker: end.name,
                startTime: start.timestamp,
                endTime: end.timestamp,
                duration: end.timestamp - start.timestamp,
                inputVariance: 0,
                outputVariance: 0,
                correlation: 0,
                diagnosis: 'INSUFFICIENT_DATA',
                confidence: 0,
                details: `仅 ${intervalFrames.length} 帧，数据不足`
            };
        }

        // 提取 Input 时间序列
        const inputSeries = this.extractSignalSeries(intervalFrames, this.config.inputSignals);
        
        // 提取 Output 时间序列
        const outputSignals = this.config.outputSignals.length > 0
            ? this.config.outputSignals
            : this.detectOutputSignals(intervalFrames);
        const outputSeries = this.extractSignalSeries(intervalFrames, outputSignals);

        // 计算方差
        const inputVariance = this.computeVariance(inputSeries);
        const outputVariance = this.computeVariance(outputSeries);

        // 计算相关性
        const correlation = this.computeCorrelation(inputSeries, outputSeries);

        // 诊断
        const { diagnosis, confidence, details } = this.diagnose(
            inputVariance, 
            outputVariance, 
            correlation
        );

        return {
            startMarker: start.name,
            endMarker: end.name,
            startTime: start.timestamp,
            endTime: end.timestamp,
            duration: end.timestamp - start.timestamp,
            inputVariance,
            outputVariance,
            correlation,
            diagnosis,
            confidence,
            details
        };
    }

    /**
     * 提取信号时间序列 (归一化为单一数组)
     */
    private extractSignalSeries(frames: TelemetrySnapshot[], signals: string[]): number[] {
        const series: number[] = [];

        for (const frame of frames) {
            let frameValue = 0;
            let count = 0;

            for (const signalId of signals) {
                const data = frame.data[signalId];
                if (!data) continue;

                // 聚合 Weight
                if (data.w && data.w.c !== -1) {
                    frameValue += this.metricDelta(data.w);
                    count++;
                }

                // 聚合属性
                if (data.a) {
                    for (const metric of Object.values(data.a)) {
                        if (metric.c !== -1) {
                            frameValue += this.metricDelta(metric);
                            count++;
                        }
                    }
                }
            }

            series.push(count > 0 ? frameValue / count : 0);
        }

        return series;
    }

    /**
     * 自动检测 Output 信号 (排除系统信号)
     */
    private detectOutputSignals(frames: TelemetrySnapshot[]): string[] {
        const signals = new Set<string>();
        
        for (const frame of frames) {
            for (const key of Object.keys(frame.data)) {
                // 排除双下划线开头的系统信号
                if (!key.startsWith('__')) {
                    signals.add(key);
                }
            }
        }

        return Array.from(signals);
    }

    /**
     * 计算 K 线的变化幅度
     */
    private metricDelta(m: AggregatedMetric): number {
        if (m.o === -1) return 0;
        return Math.abs(m.h - m.l) + Math.abs(m.c - m.o);
    }

    /**
     * 计算方差
     */
    private computeVariance(series: number[]): number {
        if (series.length < 2) return 0;
        
        const mean = series.reduce((a, b) => a + b, 0) / series.length;
        const squaredDiffs = series.map(x => (x - mean) ** 2);
        return squaredDiffs.reduce((a, b) => a + b, 0) / series.length;
    }

    /**
     * 计算 Pearson 相关系数
     */
    private computeCorrelation(seriesA: number[], seriesB: number[]): number {
        const n = Math.min(seriesA.length, seriesB.length);
        if (n < 3) return 0;

        const meanA = seriesA.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const meanB = seriesB.slice(0, n).reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let denomA = 0;
        let denomB = 0;

        for (let i = 0; i < n; i++) {
            const diffA = seriesA[i] - meanA;
            const diffB = seriesB[i] - meanB;
            numerator += diffA * diffB;
            denomA += diffA * diffA;
            denomB += diffB * diffB;
        }

        const denom = Math.sqrt(denomA * denomB);
        return denom === 0 ? 0 : numerator / denom;
    }

    /**
     * 诊断逻辑
     */
    private diagnose(
        inputVar: number, 
        outputVar: number, 
        corr: number
    ): { diagnosis: DiagnosisType; confidence: number; details: string } {
        const hasInput = inputVar > this.config.inputVarianceThreshold;
        const hasOutput = outputVar > this.config.outputVarianceThreshold;
        const isCorrelated = Math.abs(corr) > this.config.correlationThreshold;

        // 决策树
        if (!hasInput && !hasOutput) {
            return {
                diagnosis: 'IDLE',
                confidence: 0.9,
                details: '区间内无明显输入输出活动'
            };
        }

        if (hasInput && !hasOutput) {
            return {
                diagnosis: 'NO_RESPONSE',
                confidence: 0.95,
                details: `输入活跃 (var=${inputVar.toFixed(4)}) 但输出静止 (var=${outputVar.toFixed(6)})`
            };
        }

        if (!hasInput && hasOutput) {
            return {
                diagnosis: 'AUTONOMOUS',
                confidence: 0.85,
                details: `输出自主变化 (var=${outputVar.toFixed(4)})，可能是动画或定时器`
            };
        }

        // 都有活动，检查相关性
        if (isCorrelated) {
            return {
                diagnosis: 'HEALTHY',
                confidence: Math.min(0.95, 0.5 + Math.abs(corr) * 0.5),
                details: `输入输出正常相关 (r=${corr.toFixed(3)})`
            };
        } else {
            return {
                diagnosis: 'CHAOTIC',
                confidence: 0.7,
                details: `输入输出均活跃但不相关 (r=${corr.toFixed(3)})，可能存在逻辑断层`
            };
        }
    }

    /**
     * 清空数据
     */
    clear(): void {
        this.frames = [];
        this.markers = [];
    }

    /**
     * 获取统计信息
     */
    getStats(): { frameCount: number; markerCount: number; timeSpan: number } {
        const timestamps = this.frames.map(f => f.ts);
        return {
            frameCount: this.frames.length,
            markerCount: this.markers.length,
            timeSpan: timestamps.length > 0 
                ? Math.max(...timestamps) - Math.min(...timestamps) 
                : 0
        };
    }
}

// === 便捷导出 ===

export const diagnosis = {
    create: (config?: AnalysisConfig) => new MarkerAlignmentAnalyzer(config),
    
    /**
     * 快速分析：一次性导入并分析
     */
    quick: (scenarioId: string, frames: TelemetrySnapshot[], markers: MarkerEvent[]) => {
        const analyzer = new MarkerAlignmentAnalyzer();
        analyzer.importFrames(frames);
        markers.forEach(m => analyzer.registerMarker(m.name, m.timestamp, m.meta));
        return analyzer.analyze(scenarioId);
    }
};





// 好的，现在实现 Phase 3 的核心：`MarkerAlignmentAnalyzer`，用于检测 Input/Output 相关性异常。---

// ## 诊断类型说明

// | 诊断结果 | 含义 | 典型场景 |
// |---------|------|---------|
// | `HEALTHY` | 输入输出正常相关 | 拖拽时元素跟随移动 |
// | `NO_RESPONSE` | 有输入但无输出 | **死锁/Bug** - 疯狂点击但 UI 不响应 |
// | `AUTONOMOUS` | 无输入但有输出 | 正常动画、定时器更新 |
// | `CHAOTIC` | 输入输出都活跃但不相关 | 逻辑错误、状态不同步 |
// | `IDLE` | 无活动 | 等待用户操作 |

// ---

// ## 使用示例

// ```typescript
// import { MarkerAlignmentAnalyzer, diagnosis } from './MarkerAlignmentAnalyzer';
// import { choreography } from '../orchestration/TimelineExecutor';

// // === 方式 1: 与 TimelineExecutor 集成 ===

// async function runDiagnosedTest() {
//     const analyzer = new MarkerAlignmentAnalyzer({
//         correlationThreshold: 0.25,
//         inputVarianceThreshold: 0.005
//     });

//     // 监听遥测流
//     (window as any).__OUROBOROS_TUNNEL__ = (jsonPayload: string) => {
//         const frame = JSON.parse(jsonPayload);
//         analyzer.ingestFrame(frame);
//     };

//     // 执行测试剧本
//     await choreography.execute({
//         op: "EXECUTE_CHOREOGRAPHY",
//         scenario_id: "drag_responsiveness_test",
//         strategy: "human_like",
//         timeline: [
//             { offset_ms: 0, action: "WAIT", params: { timeout: 200 }, marker: "READY" },
//             { offset_ms: 200, action: "DRAG", params: { 
//                 target: "game/slider", 
//                 endX: 500, endY: 200, 
//                 duration: 1000 
//             }, marker: "DRAG_START" },
//             { offset_ms: 1300, action: "WAIT", params: { timeout: 200 }, marker: "DRAG_END" },
//             { offset_ms: 1500, action: "CLICK", params: { target: "game/reset" }, marker: "RESET" },
//             { offset_ms: 2000, action: "WAIT", params: { timeout: 100 }, marker: "COMPLETE" }
//         ]
//     });

//     // 生成诊断报告
//     const report = analyzer.analyze("drag_responsiveness_test");
    
//     console.log('=== Diagnosis Report ===');
//     console.log(`Overall Health: ${(report.summary.overallHealth * 100).toFixed(1)}%`);
//     console.log(`Anomalies: ${report.summary.anomalyCount}`);
    
//     // 输出每个区间的分析
//     for (const interval of report.intervals) {
//         console.log(`\n[${interval.startMarker} → ${interval.endMarker}]`);
//         console.log(`  Diagnosis: ${interval.diagnosis}`);
//         console.log(`  Input Var: ${interval.inputVariance.toFixed(4)}`);
//         console.log(`  Output Var: ${interval.outputVariance.toFixed(4)}`);
//         console.log(`  Correlation: ${interval.correlation.toFixed(3)}`);
//         console.log(`  ${interval.details}`);
//     }

//     // 检查告警
//     if (report.alerts.length > 0) {
//         console.log('\n⚠️ ALERTS:');
//         for (const alert of report.alerts) {
//             console.log(`  [${alert.severity.toUpperCase()}] ${alert.interval}: ${alert.message}`);
//         }
//     }

//     return report;
// }

// // === 方式 2: 快速分析已收集的数据 ===

// const report = diagnosis.quick(
//     "replay_analysis",
//     collectedFrames,  // 之前收集的遥测帧
//     [
//         { name: "START", timestamp: 1000 },
//         { name: "ACTION_1", timestamp: 2000 },
//         { name: "ACTION_2", timestamp: 3500 },
//         { name: "END", timestamp: 5000 }
//     ]
// );

// // === 方式 3: 检测特定模式 ===

// function detectDeadlock(report: DiagnosisReport): boolean {
//     return report.intervals.some(i => i.diagnosis === 'NO_RESPONSE');
// }

// function detectLogicDesync(report: DiagnosisReport): boolean {
//     return report.intervals.some(i => 
//         i.diagnosis === 'CHAOTIC' && i.confidence > 0.6
//     );
// }
// ```

// ---

// ## 诊断报告示例

// ```json
// {
//   "scenarioId": "drag_responsiveness_test",
//   "analyzedAt": 1704067200000,
//   "totalFrames": 150,
//   "intervals": [
//     {
//       "startMarker": "READY",
//       "endMarker": "DRAG_START",
//       "duration": 200,
//       "inputVariance": 0.0002,
//       "outputVariance": 0.0001,
//       "correlation": 0.12,
//       "diagnosis": "IDLE",
//       "confidence": 0.9,
//       "details": "区间内无明显输入输出活动"
//     },
//     {
//       "startMarker": "DRAG_START",
//       "endMarker": "DRAG_END",
//       "duration": 1100,
//       "inputVariance": 0.8234,
//       "outputVariance": 0.7891,
//       "correlation": 0.92,
//       "diagnosis": "HEALTHY",
//       "confidence": 0.96,
//       "details": "输入输出正常相关 (r=0.920)"
//     },
//     {
//       "startMarker": "RESET",
//       "endMarker": "COMPLETE",
//       "duration": 500,
//       "inputVariance": 0.0521,
//       "outputVariance": 0.0003,
//       "correlation": 0.08,
//       "diagnosis": "NO_RESPONSE",
//       "confidence": 0.95,
//       "details": "输入活跃 (var=0.0521) 但输出静止 (var=0.000300)"
//     }
//   ],
//   "summary": {
//     "healthyCount": 2,
//     "anomalyCount": 1,
//     "overallHealth": 0.67
//   },
//   "alerts": [
//     {
//       "severity": "critical",
//       "interval": "RESET → COMPLETE",
//       "message": "检测到无响应：输入方差 0.0521 但输出方差仅 0.000300"
//     }
//   ]
// }
// ```

// ---

// ## 系统架构总览

// ```
// ┌─────────────────────────────────────────────────────────────────────┐
// │                        Phase 1: 感知层                               │
// ├─────────────────────────────────────────────────────────────────────┤
// │  DOMTelemetryRuntime ◄──── DOM 元素 (data-vt-id)                    │
// │          │                                                          │
// │          ├──────────────►  合流传输                                  │
// │          │                    ▲                                     │
// │  VirtualChannelManager ◄──── useSignalBinding / pushMetric          │
// └─────────────────────────────────┬───────────────────────────────────┘
//                                   │
//                                   ▼
// ┌─────────────────────────────────────────────────────────────────────┐
// │                        Phase 2: 编排层                               │
// ├─────────────────────────────────────────────────────────────────────┤
// │  TimelineExecutor                                                   │
// │    - 解析 ATP 协议                                                   │
// │    - human_like / mechanical 执行策略                                │
// │    - Marker 双写到遥测流                                             │
// │    - Network Mock 副作用隔离                                         │
// └─────────────────────────────────┬───────────────────────────────────┘
//                                   │
//                                   ▼
// ┌─────────────────────────────────────────────────────────────────────┐
// │                        Phase 3: 诊断层                               │
// ├─────────────────────────────────────────────────────────────────────┤
// │  MarkerAlignmentAnalyzer                                            │
// │    - 提取 Marker 区间                                                │
// │    - 计算 Input/Output 方差                                          │
// │    - Pearson 相关性分析                                              │
// │    - 自动诊断: HEALTHY / NO_RESPONSE / CHAOTIC / ...                │
// └─────────────────────────────────────────────────────────────────────┘
// ```

// ---

// ## 下一步建议

// Phase 3 诊断层核心已完成：

// | 任务 | 状态 |
// |------|------|
// | Marker Alignment Analyzer | ✅ 完成 |
// | Topology Checker | ⏳ 待实现 |

// 推荐选项：

// 1. **`Task_Topology_Checker`** — 验证 Rank 位序契约（静态层级正确性）
// 2. **统一导出入口** — 创建 `index.ts` 整合所有模块
// 3. **后端 DTO 更新** — 支持新的 Payload 结构

// 继续实现 Topology Checker 吗？