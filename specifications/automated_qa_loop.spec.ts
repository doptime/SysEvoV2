/**
 * Project: Ouroboros (Automated Evolution Loop)
 * Version: 5.0 (Evolutionary Core)
 * Target: Machine Agents
 */

// ========================================================
// SECTION 0: 元数据清单 (The Manifest)
// ========================================================

/**
 * [Manifest] 文件的自我描述
 * 核心逻辑：定义行为契约 -> 客户端验证 -> 参数进化。
 */
export const Meta_Context = {
    project: "Project Ouroboros",
    version: "5.0",
    description: "基于行为契约 (Behavior Contracts) 的参数进化与验证系统。",
    core_formula: "Client_Assertion -> Fail_Report -> Config_Mutation -> Re-Test",
    status: "Active"
};

// ========================================================
// SECTION 1: 数据协议 (Data Protocols)
// ========================================================

/**
 * [Protocol] 行为契约 (The Contract)
 * 定义在 GameConfig 中，指导客户端如何判定“成功”或“失败”。
 */
export interface BehaviorContract {
    id: string;             // e.g., "jump_height_check"
    trigger_event: string;  // e.g., "input_jump_press"
    
    // 简单的逻辑表达式，客户端 JS 直接执行
    // "player.position.y > 2.0 within 1.0s"
    assertion: {
        target: string;     // "player"
        property: string;   // "position.y"
        operator: ">" | "<" | "==";
        value: number;
        time_window: number; // 秒
    };
}

/**
 * [Protocol] 失败报告 (The Feedback)
 * 只有当契约被破坏时，才会生成此数据。
 * 极简原则：只包含“当事对象”。
 */
export interface FailureReport {
    contract_id: string;    // 哪个契约挂了
    
    // 进化所需的最小上下文
    context: {
        current_value: number;  // 实际跳了 1.5米
        expected_value: number; // 期望跳 2.0米
        
        // 当事对象的关键参数 (用于 LLM 决定调整哪个参数)
        // e.g., { "jumpForce": 5, "gravity": 10, "mass": 1 }
        actor_config_snapshot: Record<string, any>;
    };
}

// ========================================================
// SECTION 2: 任务定义 (Task Definitions)
// ========================================================

/**
 * [Project] 进化闭环总览
 * Flow: 
 * 1. Playwright 跑游戏。
 * 2. 客户端 JS 监控 BehaviorContract。
 * 3. 失败 -> 发送 FailureReport。
 * 4. SysEvoV2 读取 Report -> 修改 GameConfig.json -> 重跑。
 */
export function Project_Ouroboros_Evolution() {
    // 依赖链
}

/**
 * [Phase 1] 客户端裁判 (The Client Judge)
 * Goal: 在浏览器内实现极轻量的断言逻辑。
 * Logic: 不Dump全量数据，只在 Update 循环中 Check `if (val < threshold)`.
 */
export function Phase_1_Client_Judge() {
    const _tasks = [Task_Contract_Monitor, Task_Targeted_Reporter];
}

/**
 * [Phase 2] 配置进化 (Config Evolution)
 * Goal: 根据失败差距，调整物理参数。
 * Logic: "跳得不够高(Diff -0.5) -> 增加 jumpForce (+10%) -> 重试"。
 */
export function Phase_2_Config_Evolution() {
    const _tasks = [Task_Parameter_Mutator, Task_Regression_Check];
}

/**
 * [Task] 契约监控器
 * Target: "frontend/src/debug/ContractMonitor.ts"
 * Logic:
 * 1. 解析 JSON 中的 contracts。
 * 2. 监听事件，启动 Timer。
 * 3. 每一帧检查条件。
 */
export function Task_Contract_Monitor() {
    const _schema: BehaviorContract = null;
}

/**
 * [Task] 定向报告器
 * Logic: 
 * 1. 断言失败瞬间，捕获 Actor 的当前 Config。
 * 2. POST /api/evolution/report
 */
export function Task_Targeted_Reporter() {
    const _schema: FailureReport = null;
}

/**
 * [Task] 参数变异器
 * Role: SysEvoV2 (LLM)
 * Prompt Strategy:
 * "当前 jumpForce=5，导致实际高度 1.5 < 目标 2.0。请根据物理常识修改 jumpForce。"
 * Action: 直接修改 `GameConfig.json`。
 */
export function Task_Parameter_Mutator() {}

/**
 * [Task] 回归检查
 * Logic: 确保参数调整后，没有破坏其他通过的契约。
 * (简单的 Pass Rate 统计)
 */
export function Task_Regression_Check() {}

// ========================================================
// SECTION 3: 进度管理 (Progress Tracking)
// ========================================================

/** 正在实施 */
export const Status_Developing = [
    Phase_1_Client_Judge,
    Task_Contract_Monitor,
    Task_Targeted_Reporter
];

/** 待办 */
export const Status_Todo = [
    Phase_2_Config_Evolution,
    Task_Parameter_Mutator,
    Task_Regression_Check
];