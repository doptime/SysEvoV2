// src/visual-telemetry/diagnosis/TopologyChecker.ts
// @solves 静态层级正确性验证、Rank 位序契约

import { AggregatedMetric } from '../TelemetryPayloadSchema';

// === 契约定义 ===

/**
 * 位序契约 (Rank Topology Contract)
 * 定义元素间的视觉层级关系约束
 */
export interface RankContract {
    id: string;
    name: string;
    
    // 期望的位序（从高到低）
    // 例: ["modal", "header", "content"] 表示 modal 应该始终在最前
    expectedOrder: string[];
    
    // 容差配置
    tolerance: {
        // 允许违反的最大连续帧数
        frames: number;
        // Rank 值允许的偏差（例如允许相邻元素交换）
        rankMargin: number;
    };
    
    // 契约类型
    type: ContractType;
    
    // 可选：仅在特定条件下激活
    activeWhen?: {
        // 某元素可见时激活
        elementVisible?: string;
        // 某属性满足条件时激活
        condition?: string;
    };
}

type ContractType = 
    | 'STRICT_ORDER'      // 严格顺序：必须完全匹配
    | 'PARTIAL_ORDER'     // 部分顺序：只要求相对关系
    | 'TOP_N'             // 前 N 位：只验证前几位
    | 'NEVER_BELOW';      // 永不低于：某元素不能低于指定位置

/**
 * 关系约束 (更细粒度的控制)
 */
export interface RelationConstraint {
    id: string;
    // A 必须在 B 之前 (Rank 更小)
    subject: string;
    relation: 'ABOVE' | 'BELOW' | 'ADJACENT' | 'SAME_RANK';
    target: string;
    // 容差
    tolerance: { frames: number };
}

// === 检查结果 ===

export interface TopologyViolation {
    contractId: string;
    timestamp: number;
    frameIndex: number;
    
    expected: string[];
    actual: string[];
    
    // 具体违反描述
    violations: Array<{
        element: string;
        expectedRank: number;
        actualRank: number;
        severity: 'minor' | 'major' | 'critical';
    }>;
}

export interface TopologyReport {
    checkedAt: number;
    totalFrames: number;
    contracts: ContractResult[];
    relations: RelationResult[];
    
    summary: {
        totalViolations: number;
        criticalCount: number;
        stability: number; // 0-1, 稳定帧占比
    };
}

interface ContractResult {
    contractId: string;
    contractName: string;
    passed: boolean;
    violationCount: number;
    violations: TopologyViolation[];
    // 统计
    stats: {
        compliantFrames: number;
        totalFrames: number;
        maxConsecutiveViolation: number;
    };
}

interface RelationResult {
    constraintId: string;
    passed: boolean;
    violationFrames: number[];
}

// === 遥测快照 (复用) ===

interface TelemetrySnapshot {
    ts: number;
    data: Record<string, {
        w?: AggregatedMetric;
        r?: AggregatedMetric;
        a?: Record<string, AggregatedMetric>;
    }>;
}

// === 主检查器 ===

export class TopologyChecker {
    private contracts: Map<string, RankContract> = new Map();
    private relations: RelationConstraint[] = [];
    private frames: TelemetrySnapshot[] = [];

    /**
     * 注册位序契约
     */
    registerContract(contract: RankContract): this {
        this.contracts.set(contract.id, contract);
        return this;
    }

    /**
     * 批量注册契约
     */
    registerContracts(contracts: RankContract[]): this {
        contracts.forEach(c => this.registerContract(c));
        return this;
    }

    /**
     * 注册关系约束
     */
    registerRelation(constraint: RelationConstraint): this {
        this.relations.push(constraint);
        return this;
    }

    /**
     * 导入遥测帧
     */
    importFrames(frames: TelemetrySnapshot[]): this {
        this.frames = frames;
        return this;
    }

    /**
     * 追加单帧
     */
    addFrame(frame: TelemetrySnapshot): this {
        this.frames.push(frame);
        return this;
    }

    /**
     * 执行完整检查
     */
    check(): TopologyReport {
        const contractResults: ContractResult[] = [];
        const relationResults: RelationResult[] = [];
        
        let totalViolations = 0;
        let criticalCount = 0;
        let stableFrames = 0;

        // 检查每个契约
        for (const contract of this.contracts.values()) {
            const result = this.checkContract(contract);
            contractResults.push(result);
            
            totalViolations += result.violationCount;
            criticalCount += result.violations.filter(
                v => v.violations.some(vv => vv.severity === 'critical')
            ).length;
            stableFrames += result.stats.compliantFrames;
        }

        // 检查关系约束
        for (const relation of this.relations) {
            const result = this.checkRelation(relation);
            relationResults.push(result);
            totalViolations += result.violationFrames.length;
        }

        const totalCheckedFrames = this.contracts.size > 0 
            ? this.frames.length * this.contracts.size 
            : this.frames.length;

        return {
            checkedAt: Date.now(),
            totalFrames: this.frames.length,
            contracts: contractResults,
            relations: relationResults,
            summary: {
                totalViolations,
                criticalCount,
                stability: totalCheckedFrames > 0 ? stableFrames / totalCheckedFrames : 1
            }
        };
    }

    /**
     * 实时检查单帧 (用于流式监控)
     */
    checkFrame(frame: TelemetrySnapshot): TopologyViolation[] {
        const violations: TopologyViolation[] = [];
        
        for (const contract of this.contracts.values()) {
            if (!this.isContractActive(contract, frame)) continue;
            
            const frameViolation = this.checkFrameAgainstContract(frame, contract, 0);
            if (frameViolation) {
                violations.push(frameViolation);
            }
        }
        
        return violations;
    }

    // === 契约检查 ===

    private checkContract(contract: RankContract): ContractResult {
        const violations: TopologyViolation[] = [];
        let compliantFrames = 0;
        let currentViolationStreak = 0;
        let maxConsecutiveViolation = 0;

        for (let i = 0; i < this.frames.length; i++) {
            const frame = this.frames[i];
            
            // 检查契约是否激活
            if (!this.isContractActive(contract, frame)) {
                compliantFrames++;
                currentViolationStreak = 0;
                continue;
            }

            const violation = this.checkFrameAgainstContract(frame, contract, i);
            
            if (violation) {
                currentViolationStreak++;
                maxConsecutiveViolation = Math.max(maxConsecutiveViolation, currentViolationStreak);
                
                // 只有超过容差才记录
                if (currentViolationStreak > contract.tolerance.frames) {
                    violations.push(violation);
                }
            } else {
                compliantFrames++;
                currentViolationStreak = 0;
            }
        }

        return {
            contractId: contract.id,
            contractName: contract.name,
            passed: violations.length === 0,
            violationCount: violations.length,
            violations,
            stats: {
                compliantFrames,
                totalFrames: this.frames.length,
                maxConsecutiveViolation
            }
        };
    }

    private checkFrameAgainstContract(
        frame: TelemetrySnapshot, 
        contract: RankContract,
        frameIndex: number
    ): TopologyViolation | null {
        // 提取当前帧的 Rank 数据
        const rankMap = this.extractRankMap(frame);
        
        // 构建实际顺序
        const actualOrder = contract.expectedOrder
            .filter(id => rankMap.has(id))
            .sort((a, b) => (rankMap.get(a) || 999) - (rankMap.get(b) || 999));

        // 根据契约类型检查
        const violationDetails = this.compareOrder(
            contract.expectedOrder.filter(id => rankMap.has(id)),
            actualOrder,
            rankMap,
            contract
        );

        if (violationDetails.length === 0) return null;

        return {
            contractId: contract.id,
            timestamp: frame.ts,
            frameIndex,
            expected: contract.expectedOrder,
            actual: actualOrder,
            violations: violationDetails
        };
    }

    private compareOrder(
        expected: string[],
        actual: string[],
        rankMap: Map<string, number>,
        contract: RankContract
    ): Array<{ element: string; expectedRank: number; actualRank: number; severity: 'minor' | 'major' | 'critical' }> {
        const violations: Array<{ element: string; expectedRank: number; actualRank: number; severity: 'minor' | 'major' | 'critical' }> = [];

        switch (contract.type) {
            case 'STRICT_ORDER':
                for (let i = 0; i < expected.length; i++) {
                    const actualIdx = actual.indexOf(expected[i]);
                    if (actualIdx !== i) {
                        const diff = Math.abs(actualIdx - i);
                        violations.push({
                            element: expected[i],
                            expectedRank: i + 1,
                            actualRank: actualIdx + 1,
                            severity: diff > 2 ? 'critical' : diff > 1 ? 'major' : 'minor'
                        });
                    }
                }
                break;

            case 'PARTIAL_ORDER':
                // 只检查相对顺序
                for (let i = 0; i < expected.length - 1; i++) {
                    const curr = expected[i];
                    const next = expected[i + 1];
                    const currRank = rankMap.get(curr) || 999;
                    const nextRank = rankMap.get(next) || 999;
                    
                    if (currRank > nextRank + contract.tolerance.rankMargin) {
                        violations.push({
                            element: curr,
                            expectedRank: i + 1,
                            actualRank: actual.indexOf(curr) + 1,
                            severity: 'major'
                        });
                    }
                }
                break;

            case 'TOP_N':
                // 只检查前 N 位
                const n = Math.min(3, expected.length);
                for (let i = 0; i < n; i++) {
                    if (actual[i] !== expected[i]) {
                        violations.push({
                            element: expected[i],
                            expectedRank: i + 1,
                            actualRank: actual.indexOf(expected[i]) + 1,
                            severity: i === 0 ? 'critical' : 'major'
                        });
                    }
                }
                break;

            case 'NEVER_BELOW':
                // 检查元素不能低于期望位置
                for (let i = 0; i < expected.length; i++) {
                    const actualIdx = actual.indexOf(expected[i]);
                    if (actualIdx > i + contract.tolerance.rankMargin) {
                        violations.push({
                            element: expected[i],
                            expectedRank: i + 1,
                            actualRank: actualIdx + 1,
                            severity: 'critical'
                        });
                    }
                }
                break;
        }

        return violations;
    }

    // === 关系约束检查 ===

    private checkRelation(constraint: RelationConstraint): RelationResult {
        const violationFrames: number[] = [];
        let consecutiveViolations = 0;

        for (let i = 0; i < this.frames.length; i++) {
            const rankMap = this.extractRankMap(this.frames[i]);
            const subjectRank = rankMap.get(constraint.subject);
            const targetRank = rankMap.get(constraint.target);

            if (subjectRank === undefined || targetRank === undefined) continue;

            let violated = false;
            switch (constraint.relation) {
                case 'ABOVE':
                    violated = subjectRank >= targetRank;
                    break;
                case 'BELOW':
                    violated = subjectRank <= targetRank;
                    break;
                case 'ADJACENT':
                    violated = Math.abs(subjectRank - targetRank) > 1;
                    break;
                case 'SAME_RANK':
                    violated = subjectRank !== targetRank;
                    break;
            }

            if (violated) {
                consecutiveViolations++;
                if (consecutiveViolations > constraint.tolerance.frames) {
                    violationFrames.push(i);
                }
            } else {
                consecutiveViolations = 0;
            }
        }

        return {
            constraintId: constraint.id,
            passed: violationFrames.length === 0,
            violationFrames
        };
    }

    // === 工具方法 ===

    private extractRankMap(frame: TelemetrySnapshot): Map<string, number> {
        const map = new Map<string, number>();
        
        for (const [id, data] of Object.entries(frame.data)) {
            if (data.r && data.r.c !== -1) {
                // 使用 Close 值作为当前 Rank
                map.set(id, data.r.c);
            }
        }
        
        return map;
    }

    private isContractActive(contract: RankContract, frame: TelemetrySnapshot): boolean {
        if (!contract.activeWhen) return true;
        
        if (contract.activeWhen.elementVisible) {
            const data = frame.data[contract.activeWhen.elementVisible];
            // 元素存在且有权重数据
            if (!data || !data.w || data.w.c <= 0) return false;
        }
        
        return true;
    }

    /**
     * 清空数据
     */
    clear(): this {
        this.frames = [];
        return this;
    }

    /**
     * 移除契约
     */
    removeContract(id: string): this {
        this.contracts.delete(id);
        return this;
    }
}

// === 便捷工厂 ===

export const topology = {
    create: () => new TopologyChecker(),
    
    /**
     * 快速创建常用契约
     */
    contracts: {
        /** Modal 始终在最顶层 */
        modalOnTop: (modalId: string, ...backgroundIds: string[]): RankContract => ({
            id: `modal_top_${modalId}`,
            name: 'Modal Always On Top',
            expectedOrder: [modalId, ...backgroundIds],
            tolerance: { frames: 2, rankMargin: 0 },
            type: 'NEVER_BELOW',
            activeWhen: { elementVisible: modalId }
        }),

        /** 导航栏固定顺序 */
        navOrder: (ids: string[]): RankContract => ({
            id: 'nav_order',
            name: 'Navigation Order',
            expectedOrder: ids,
            tolerance: { frames: 5, rankMargin: 1 },
            type: 'PARTIAL_ORDER'
        }),

        /** 焦点元素必须可见 (Top 3) */
        focusVisible: (focusId: string, ...otherIds: string[]): RankContract => ({
            id: `focus_visible_${focusId}`,
            name: 'Focus Element Visible',
            expectedOrder: [focusId, ...otherIds],
            tolerance: { frames: 3, rankMargin: 2 },
            type: 'TOP_N'
        })
    }
};


// 好的，现在实现 `TopologyChecker`，用于验证 Rank 位序契约和 UI 层级稳定性。---

// ## 契约类型说明

// | 类型 | 用途 | 示例场景 |
// |------|------|---------|
// | `STRICT_ORDER` | 完全匹配顺序 | 固定布局的仪表盘 |
// | `PARTIAL_ORDER` | 只验证相对关系 | 可拖拽排序的列表 |
// | `TOP_N` | 只验证前几位 | 确保关键元素可见 |
// | `NEVER_BELOW` | 元素不能低于某位置 | Modal 必须在最上层 |

// ---

// ## 使用示例

// ```typescript
// import { TopologyChecker, topology } from './TopologyChecker';

// // === 场景 1: 验证 Modal 层级 ===

// const checker = topology.create()
//     .registerContract(
//         topology.contracts.modalOnTop('dialog/confirm', 'page/header', 'page/content')
//     )
//     .registerContract({
//         id: 'tooltip_visibility',
//         name: 'Tooltip Must Be Visible',
//         expectedOrder: ['tooltip/active', 'form/input', 'form/label'],
//         tolerance: { frames: 1, rankMargin: 0 },
//         type: 'TOP_N',
//         activeWhen: { elementVisible: 'tooltip/active' }
//     });

// // 导入遥测数据
// checker.importFrames(collectedFrames);

// // 执行检查
// const report = checker.check();

// console.log(`Stability: ${(report.summary.stability * 100).toFixed(1)}%`);
// console.log(`Violations: ${report.summary.totalViolations}`);

// // === 场景 2: 游戏 HUD 层级验证 ===

// const gameChecker = new TopologyChecker()
//     .registerContract({
//         id: 'hud_layers',
//         name: 'Game HUD Layer Order',
//         expectedOrder: [
//             'hud/pause_menu',
//             'hud/notifications', 
//             'hud/health_bar',
//             'hud/minimap',
//             'game/player',
//             'game/enemies',
//             'game/background'
//         ],
//         tolerance: { frames: 3, rankMargin: 1 },
//         type: 'PARTIAL_ORDER'
//     })
//     // 关系约束：暂停菜单必须在玩家之上
//     .registerRelation({
//         id: 'pause_above_player',
//         subject: 'hud/pause_menu',
//         relation: 'ABOVE',
//         target: 'game/player',
//         tolerance: { frames: 0 } // 零容忍
//     });

// // === 场景 3: 实时流式检查 ===

// // 在遥测回调中实时检查
// (window as any).__OUROBOROS_TUNNEL__ = (jsonPayload: string) => {
//     const frame = JSON.parse(jsonPayload);
    
//     // 实时检查
//     const violations = checker.checkFrame(frame);
    
//     if (violations.length > 0) {
//         console.warn('⚠️ Topology violation detected:', violations);
//         // 可以触发告警或自动修复逻辑
//     }
// };

// // === 场景 4: 结合 Timeline 执行器 ===

// async function runTopologyTest() {
//     const checker = topology.create()
//         .registerContract(topology.contracts.modalOnTop('modal/purchase', 'shop/items'));
    
//     // 监听遥测
//     const frames: any[] = [];
//     (window as any).__OUROBOROS_TUNNEL__ = (json: string) => {
//         frames.push(JSON.parse(json));
//     };

//     // 执行测试剧本
//     await choreography.execute({
//         op: "EXECUTE_CHOREOGRAPHY",
//         scenario_id: "modal_test",
//         strategy: "mechanical",
//         timeline: [
//             { offset_ms: 0, action: "CLICK", params: { target: "shop/buy_btn" }, marker: "OPEN_MODAL" },
//             { offset_ms: 500, action: "WAIT", params: { timeout: 1000 }, marker: "MODAL_VISIBLE" },
//             { offset_ms: 1500, action: "CLICK", params: { target: "modal/close" }, marker: "CLOSE_MODAL" }
//         ]
//     });

//     // 验证
//     checker.importFrames(frames);
//     const report = checker.check();
    
//     if (!report.contracts[0].passed) {
//         console.error('❌ Modal was obscured during test!');
//         console.log('Violations:', report.contracts[0].violations);
//     }
    
//     return report;
// }
// ```

// ---

// ## 检查报告示例

// ```json
// {
//   "checkedAt": 1704067200000,
//   "totalFrames": 150,
//   "contracts": [
//     {
//       "contractId": "modal_top_dialog/confirm",
//       "contractName": "Modal Always On Top",
//       "passed": false,
//       "violationCount": 2,
//       "violations": [
//         {
//           "contractId": "modal_top_dialog/confirm",
//           "timestamp": 1704067201500,
//           "frameIndex": 45,
//           "expected": ["dialog/confirm", "page/header", "page/content"],
//           "actual": ["page/header", "dialog/confirm", "page/content"],
//           "violations": [
//             {
//               "element": "dialog/confirm",
//               "expectedRank": 1,
//               "actualRank": 2,
//               "severity": "critical"
//             }
//           ]
//         }
//       ],
//       "stats": {
//         "compliantFrames": 148,
//         "totalFrames": 150,
//         "maxConsecutiveViolation": 3
//       }
//     }
//   ],
//   "relations": [
//     {
//       "constraintId": "pause_above_player",
//       "passed": true,
//       "violationFrames": []
//     }
//   ],
//   "summary": {
//     "totalViolations": 2,
//     "criticalCount": 1,
//     "stability": 0.987
//   }
// }
// ```

// ---

// ## 完整系统架构

// ```
// ┌─────────────────────────────────────────────────────────────────────────┐
// │                           VIZTEL SYSTEM                                  │
// ├─────────────────────────────────────────────────────────────────────────┤
// │                                                                          │
// │  ┌─────────────── Phase 1: SENSING ───────────────┐                     │
// │  │                                                 │                     │
// │  │  DOMTelemetryRuntime     VirtualChannelManager │                     │
// │  │         │                        │              │                     │
// │  │         └────────┬───────────────┘              │                     │
// │  │                  ▼                              │                     │
// │  │         Unified Telemetry Stream               │                     │
// │  │                                                 │                     │
// │  │  React Hooks:                                   │                     │
// │  │  • useTrack()        • useSignalBinding()      │                     │
// │  │  • useSignalBindings()  • useHybridTelemetry() │                     │
// │  └─────────────────────────┬───────────────────────┘                     │
// │                            │                                             │
// │  ┌─────────────── Phase 2: ORCHESTRATION ─────────┐                     │
// │  │                            │                    │                     │
// │  │  TimelineExecutor ◄────────┘                   │                     │
// │  │    • ATP Protocol Parser                        │                     │
// │  │    • Human-like / Mechanical Execution          │                     │
// │  │    • Marker Injection                           │                     │
// │  │    • Network Mock (Side-effect Isolation)       │                     │
// │  └─────────────────────────┬───────────────────────┘                     │
// │                            │                                             │
// │  ┌─────────────── Phase 3: DIAGNOSIS ─────────────┐                     │
// │  │                            │                    │                     │
// │  │  MarkerAlignmentAnalyzer ◄─┘                   │                     │
// │  │    • Input/Output Correlation                   │                     │
// │  │    • Variance Analysis                          │                     │
// │  │    • Anomaly Detection (NO_RESPONSE, CHAOTIC)   │                     │
// │  │                                                 │                     │
// │  │  TopologyChecker                                │                     │
// │  │    • Rank Contract Validation                   │                     │
// │  │    • Layer Order Verification                   │                     │
// │  │    • Real-time Violation Detection              │                     │
// │  └─────────────────────────────────────────────────┘                     │
// │                                                                          │
// └─────────────────────────────────────────────────────────────────────────┘
// ```

// ---

// ## 下一步建议

// Phase 1-3 核心功能已完成：

// | Phase | 任务 | 状态 |
// |-------|------|------|
// | 1 | DOM K 线采集 | ✅ |
// | 1 | Virtual Channel | ✅ |
// | 1 | Signal Binding Hooks | ✅ |
// | 2 | Timeline Executor | ✅ |
// | 2 | Network Mock | ✅ |
// | 3 | Marker Alignment | ✅ |
// | 3 | Topology Checker | ✅ |

// 推荐选项：

// 1. **统一导出入口 `index.ts`** — 整合所有模块，提供清晰的公共 API
// 2. **更新后端 DTO** — 支持 `sources` 字段和诊断结果存储
// 3. **编写集成测试示例** — 完整的端到端测试流程

// 继续创建统一导出入口吗？