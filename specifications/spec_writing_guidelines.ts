/**
 * Project: SysEvoV2 Meta-Specifications
 * Version: 2.0 (Manifest Edition)
 * Target: Developers & AI Agents
 */

// ========================================================
// SECTION 0: 元数据清单 (The Manifest)
// ========================================================

/**
 * [Manifest] 文件的自我描述
 * SysEvoV2 的 L1 筛选器通过索引此变量来理解文件的全局意图。
 * Rule: 每个 Spec 文件必须包含一个导出的 `Meta_Context` 常量。
 */
export const Meta_Context = {
    project: "SysEvoV2 Meta-Specifications",
    version: "2.0",
    target_audience: ["Developers", "AI Agents"],
    description: "定义 SysEvoV2 兼容规格说明书的编写原则与标准模式。",
    core_philosophy: "Code is Context. Exports are Visibility. JSDoc is Skeleton."
};

// ========================================================
// SECTION 1: 核心原则 (Core Principles)
// ========================================================

/**
 * [Master Rule] 规格说明书最高指导原则
 * * 1. 意图代码化 (Codify the Intent):
 * 纯文本注释对 AST 索引器是隐形的。必须将全局意图封装在 `export const Meta_Context` 中。
 * * 2. 导出即索引 (Export as Visibility):
 * Indexer 仅索引 `export` 的元素。私有变量对系统不可见。
 * * 3. JSDoc 即骨架 (JSDoc as Skeleton):
 * L1 筛选器只阅读 JSDoc。关键的 Requirements、Constraints 必须写在函数/接口上方的注释里。
 * * 4. 数组即关系 (Arrays as Relations):
 * 使用 `export const` 数组来建立聚合关系（如进度状态、依赖分组），替代复杂的函数调用链。
 */
export function Guideline_Master_Rule() {
    Principle_Manifest_Pattern();
    Principle_JSDoc_Driven_L1();
    Principle_Loose_Typing();
}

/**
 * [Principle 1] 清单模式 (Manifest Pattern)
 * Rule: 文件头部必须定义并导出 `Meta_Context` 对象。
 * Reason: 解决文件级注释无法被检索的问题，确保 Agent 能理解文件的整体作用域。
 */
export function Principle_Manifest_Pattern() {
    // 参见 SECTION 0 的示例
}

/**
 * [Principle 2] JSDoc 驱动的 L1 筛选
 * Rule: 业务逻辑描述必须位于 JSDoc (`/** ... *\/`) 中，而非函数体内。
 * Reason: 节省 Token，提高 L1 筛选的信噪比。
 */
export function Principle_JSDoc_Driven_L1() {
    /**
     * [Good Example]
     * Goal: 实现用户登录
     * Requirements: 1. OAuth2; 2. JWT;
     */
    function Good_Task() {}
}

/**
 * [Principle 3] 宽松类型与零副作用
 * Rule: 仅需通过 TypeScript 语法检查，无需包含实际运行时逻辑。
 * Technique: 函数体可以为空，或者仅包含对关键类型的引用声明。
 */
export function Principle_Loose_Typing() {
    // 合法写法：仅声明，不赋值，不消耗
    const dependencies: string[] = [];
}

// ========================================================
// SECTION 2: 命名规范 (Naming Conventions)
// ========================================================

/**
 * 标准化命名前缀
 * 目的: 统一 Chunk ID 语义，便于 LLM 进行正则检索和分类。
 */
export function Standard_Naming_Prefixes() {
    const prefixes = [
        "Project_",    // 顶层项目入口
        "Phase_",      // 实施阶段 (时间维度)
        "Component_",  // 架构组件 (空间维度)
        "Task_",       // 具体原子任务
        "Goal_",       // 业务目标
        "Feature_",    // 功能特性
        "Define_",     // 数据定义
        "Status_"      // 状态聚合数组
    ];
}

// ========================================================
// SECTION 3: 编写模板 (Writing Templates)
// ========================================================

/**
 * [Template] 数据协议定义
 * Rule: 使用 `interface` 定义数据交互契约。
 */
export function Template_Data_Protocol() {
    /**
     * 运行时状态快照
     * Usage: 前端探针返回此结构，后端用于上下文分析。
     */
    interface RuntimeStateDump {
        timestamp: number;
        /** 核心场景图数据 */
        scene_graph: Array<{
            id: string;
            position: [number, number, number];
        }>;
    }
}

/**
 * [Template] 任务定义
 * Rule: 使用 `export function` 定义任务，用 JSDoc 描述细节。
 */
export function Template_Task_Definition() {
    /**
     * [Task] 实现前端探针
     * Target: "src/debug/Probe.tsx"
     * Requirements:
     * 1. 遍历 Scene Graph
     * 2. 序列化为 JSON
     */
    function Task_Implement_Probe() {
        // 显式引用依赖的数据协议
        const _schema: Template_Data_Protocol = null;
    }
}

/**
 * [Template] 进度管理
 * Rule: 使用 `export const` 数组聚合任务函数。
 */
export function Template_Progress_Tracking() {
    // export const Status_Done = [Task_A, Task_B];
    // export const Status_Todo = [Task_C];
}

// ========================================================
// SECTION 4: 检查清单 (Compliance Checklist)
// ========================================================

export const Checklist_Compliance = [
    "是否导出了 Meta_Context?",
    "是否使用了 export 关键字暴露所有关键节点?",
    "是否将业务描述写在了 JSDoc 中?",
    "是否使用了 Status_XXX 数组来管理进度?",
    "是否通过引用 interface 建立了数据依赖?"
];