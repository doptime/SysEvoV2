/**
 * Project: Automated QA Loop (Ouroboros)
 * Version: 1.0
 * Context: 利用 Minimax 128k 上下文阅读 3D 运行时状态，实现无人值守的游戏迭代。
 */

// ========================================================
// SECTION 1: 数据协议 (Data Protocols)
// Indexer 识别为 Type Chunk，用于指导 LLM 理解 JSON 数据
// ========================================================

/**
 * 前端探针必须返回的标准 JSON 格式。
 * 后端 BugFixer 将以此解析上下文。
 */
export interface RuntimeStateDump {
    meta: {
        timestamp: number;
        level_id: string;
        resolution: string;
    };
    /** 核心数据，替代截图。包含所有 Gameplay 物体状态 */
    scene_graph: Array<{
        name: string;
        type: 'RigidBody' | 'Mesh' | 'Group';
        position: [number, number, number];
        rotation: [number, number, number];
        physics?: {
            velocity: [number, number, number];
            mass: number;
            is_sleeping: boolean;
        };
    }>;
    logic_state: {
        is_game_over: boolean;
        score: number;
    };
}

// ========================================================
// SECTION 2: 任务定义 (Task Definitions)
// Indexer 识别为 Function Chunk，JSDoc 作为 L1 筛选骨架
// ========================================================

/**
 * [Phase 1] 实施手动触发的反馈机制。
 * Goal: 跑通 "Dump -> Fix" 的数据链路，不依赖自动化脚本。
 * Action: 在前端增加 'Report Bug' 按钮，人工触发数据上报。
 */
export function Phase_1_Manual_Feedback_Loop() {
    Task_Frontend_State_Probe();
    Task_Backend_Bug_Workflow();
}

/**
 * [Phase 2] 实施基于 Playwright 的自动化测试。
 * Goal: 引入 E2E 测试脚本，在 CI/CD 中自动发现 Bug。
 */
export function Phase_2_Automated_Verification() {
    Task_Playwright_Bridge();
    Task_CI_Integration();
}

/**
 * [Task] 前端状态探针组件
 * Target: "frontend/src/components/debug/GameStateDumper.tsx"
 * Requirements:
 * 1. 使用 useThree() 获取 Scene Graph
 * 2. 使用 useRapier() 获取物理状态
 * 3. 实现 window.__OUROBOROS_DUMP__()
 */
export function Task_Frontend_State_Probe() {
    // 显式引用数据协议，建立依赖
    const schema: RuntimeStateDump = null;
    const constraints = [
        "Release 模式下必须禁用",
        "忽略 Mesh Geometry 数据"
    ];
}

/**
 * [Task] 后端 Bug 修复工作流
 * Target: "backend/workflow/bug_fixer.go"
 * Requirements:
 * 1. 入口 FixBug(report, dumpJSON)
 * 2. L1 搜索 Intent="Fix Player bug"
 * 3. 注入 <RuntimeEvidence>
 */
export function Task_Backend_Bug_Workflow() {
    const schema: RuntimeStateDump = null;
}

/**
 * [Task] Playwright 自动化脚本
 * Target: "e2e/tests/game_loop.spec.ts"
 */
export function Task_Playwright_Bridge() {
    const actions = ["Monkey Testing", "Check Console Errors"];
}

/**
 * [Task] CI 集成
 * Goal: Nightly Build & Auto-Issue
 */
export function Task_CI_Integration() {}

// ========================================================
// SECTION 3: 进度管理 (Progress Tracking)
// 使用数组聚合，简洁明了，无编译副作用
// ========================================================

// 已完成或稳定的模块
export const Status_Done = [];

// 正在开发中的模块
export const Status_Developing = [
    Phase_1_Manual_Feedback_Loop,
    Task_Frontend_State_Probe,
    Task_Backend_Bug_Workflow
];

// 待办模块
export const Status_Todo = [
    Phase_2_Automated_Verification,
    Task_Playwright_Bridge,
    Task_CI_Integration
];