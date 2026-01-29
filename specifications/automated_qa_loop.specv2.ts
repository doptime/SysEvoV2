/**
 * Project: Automated QA Loop (Ouroboros)
 * Version: 2.0 (Manifest Edition)
 * Target: Developers & AI Agents
 */

// ========================================================
// SECTION 0: 元数据清单 (The Manifest)
// ========================================================

/**
 * [Manifest] 文件的自我描述
 * SysEvoV2 通过此对象理解本文件的作用域与核心愿景。
 */
export const Meta_Context = {
    project: "Project Ouroboros (Automated QA Loop)",
    version: "2.0",
    description: "利用 Minimax 128k 上下文阅读 3D 运行时状态，实现无人值守的游戏迭代闭环。",
    core_formula: "R3F_State_Dump + Playwright_Driver -> SysEvoV2_Brain = Self-Healing Game",
    status: "Developing"
};

// ========================================================
// SECTION 1: 数据协议 (Data Protocols)
// ========================================================

/**
 * [Protocol] 运行时状态快照
 * Protocol Usage:
 * 1. 前端: 实现 window.__OUROBOROS_DUMP__() 返回此结构。
 * 2. 后端: BugFixer 将此 JSON 作为 "Runtime Evidence" 注入 Prompt。
 */
export interface RuntimeStateDump {
    /** 环境元数据 (Timestamp, Resolution, LevelID) */
    meta: {
        timestamp: number;
        level_id: string;
        resolution: string;
    };

    /** * 核心场景图数据 (State over Pixels)
     * 必须包含所有 Gameplay 相关的物体状态 (Position, Velocity, Components)。
     */
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

    /** 游戏逻辑变量 (Score, GameOver) */
    logic_state: {
        is_game_over: boolean;
        score: number;
    };
}

// ========================================================
// SECTION 2: 任务定义 (Task Definitions)
// ========================================================

/**
 * [Project] 自动化 QA 闭环总览
 * Goal: 构建连接 Runtime 与 Devtime 的自动化高速公路。
 */
export function Project_Automated_QA_Loop() {
    // 依赖关系由下方的 Status 数组管理
}

/**
 * [Phase 1] 手动反馈闭环 (Human-in-the-loop)
 * Goal: 跑通 "Dump -> Fix" 的数据链路，不依赖自动化脚本。
 * Action: 在前端增加 'Report Bug' 按钮，人工触发数据上报。
 */
export function Phase_1_Manual_Feedback_Loop() {
    // 聚合任务引用
    const _tasks = [Task_Frontend_State_Probe, Task_Backend_Bug_Workflow];
}

/**
 * [Phase 2] 自动化验证 (Machine-driven)
 * Goal: 引入 E2E 测试脚本，在 CI/CD 中自动发现 Bug。
 */
export function Phase_2_Automated_Verification() {
    const _tasks = [Task_Playwright_Bridge, Task_CI_Integration];
}

/**
 * [Task] 前端状态探针组件
 * Target: "frontend/src/components/debug/GameStateDumper.tsx"
 * Requirements:
 * 1. 使用 useThree() 获取 Scene Graph。
 * 2. 使用 useRapier() 获取物理世界状态。
 * 3. 实现 window.__OUROBOROS_DUMP__()。
 * Constraints:
 * - Release 模式下必须禁用。
 * - 忽略 Mesh Geometry 数据。
 */
export function Task_Frontend_State_Probe() {
    // 显式依赖数据协议
    const _schema: RuntimeStateDump = null;
}

/**
 * [Task] 后端 Bug 修复工作流
 * Target: "backend/workflow/bug_fixer.go"
 * Requirements:
 * 1. 入口 FixBug(report, dumpJSON)。
 * 2. L1 搜索 Intent="Fix Player bug"。
 * 3. 注入 <RuntimeEvidence>。
 */
export function Task_Backend_Bug_Workflow() {
    const _schema: RuntimeStateDump = null;
}

/**
 * [Task] Playwright 自动化脚本
 * Target: "e2e/tests/game_loop.spec.ts"
 * Requirements:
 * 1. 启动游戏并注入配置。
 * 2. Monkey Testing (随机输入)。
 * 3. 错误时调用 Dump 接口。
 */
export function Task_Playwright_Bridge() {}

/**
 * [Task] CI 集成
 * Goal: Nightly Build & Auto-Issue
 */
export function Task_CI_Integration() {}

// ========================================================
// SECTION 3: 进度管理 (Progress Tracking)
// ========================================================

/** 已完成或稳定的模块 */
export const Status_Done = [
    // 暂时为空
];

/** 正在开发中的模块 (High Priority) */
export const Status_Developing = [
    Phase_1_Manual_Feedback_Loop,
    Task_Frontend_State_Probe,
    Task_Backend_Bug_Workflow
];

/** 待办模块 (Backlog) */
export const Status_Todo = [
    Phase_2_Automated_Verification,
    Task_Playwright_Bridge,
    Task_CI_Integration
];