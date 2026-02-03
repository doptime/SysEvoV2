/**
 * Project: SysEvoV2 Meta-Specifications
 * Version: Standardized (Current)
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
    version: "2.4",
    target_audience: ["Developers", "AI Agents"],
    // [Invariant] 恒定愿景：无论实现路径如何颠覆，此字段定义了项目存在的根本理由 (The Why)。
    invariant_vision: "建立一套标准化的元规格体系，确保 AI 与人类在快速迭代中保持认知格式塔的完整性。",
    // [Description] 描述：去除时间维度的描述，陈述系统当前的固有属性。
    description: "定义 SysEvoV2 兼容规格说明书的编写原则，确立以演进案例为锚点、以副作用控制为边界的系统迭代范式。",
    core_philosophy: "Code is Context. Diff is Risk. Intent is Permanent."
};

// ========================================================
// SECTION 1: 核心原则 (Core Principles)
// ========================================================

/**
 * [Master Rule] 规格说明书最高指导原则
 * * 1. 意图代码化 (Codify the Intent):
 * 全局意图封装在 `Meta_Context` 中。
 * * 2. 导出即索引 (Export as Visibility):
 * Indexer 仅索引 `export` 的元素。
 * * 3. JSDoc 即骨架 (JSDoc as Skeleton):
 * 关键 Requirements 必须写在注释里。
 * * 4. 引用即完整 (Reference as Integrity):
 * 所有的 Task 函数必须被某个 Status 数组引用，严禁“孤儿任务”。
 * * 5. 优化即案例 (Optimization as Case Study):
 * 任何系统级的重构或优化，必须首先定义它所解决的 Case。拒绝没有 Case 支撑的“凭空设计”。
 * * 6. 迭代即手术 (Iteration as Surgery):
 * 修改必须遵循最小化原则，保留意图注释，严防结构性副作用。
 */
export function Guideline_Master_Rule() {
    Principle_Manifest_Pattern();
    Principle_JSDoc_Driven_L1();
    Principle_Referential_Integrity();
    Principle_Anchored_Optimization();
    Principle_SideEffect_Control();
}

/**
 * [Principle 1] 清单模式 (Manifest Pattern)
 * Rule: 文件头部必须定义并导出 `Meta_Context` 对象，且必须包含 `invariant_vision`。
 */
export function Principle_Manifest_Pattern() {
    // 参见 SECTION 0
}

/**
 * [Principle 2] JSDoc 驱动的 L1 筛选
 * Rule: 业务逻辑描述必须位于 JSDoc 中。
 */
export function Principle_JSDoc_Driven_L1() {
    /**
     * [Example]
     * Goal: 登录
     */
    function Good_Task() {}
}

/**
 * [Principle 3] 引用完整性 (Referential Integrity)
 * Rule: “不引用即不存在”。
 * 1. 每一个定义的 `Task_` 函数，**必须** 至少出现在一个 `Status_` 聚合数组中。
 * 2. 如果任务被废弃，应移入 `Status_Deprecated` 或直接删除函数。
 * Reason: 保证 AST 依赖图与项目进度视图的一致性。
 */
export function Principle_Referential_Integrity() {
    // Anti-Pattern: 定义了 Task_A 但没有任何 Status 数组包含它。
}

/**
 * [Principle 4] 锚定优化 (Anchored Optimization)
 * Rule: 所有的优化措施（Solution Map）必须锚定在具体的 Case 上。
 * 1. 增量式记录：不要修改旧的 Case，而是追加新的 Case。
 * 2. 历史不可变：已解决的 Case 是系统的“判例法”，它们解释了系统为何演变成现在的样子。
 * 3. 严禁随意删除 Case，除非该业务领域彻底消亡。
 */
export function Principle_Anchored_Optimization() {
    // 参见 SECTION 5
}

/**
 * [Principle 5] 副作用控制与最小化修改 (Side-Effect Control)
 * Rule: 迭代必须是“外科手术式”的，而非“爆破式”的。
 * * 1. 修改最小化 (Diff Minimization): 
 * - 优先采用 **增量扩展** (Append) 而非 **结构重写** (Rewrite)。
 * - 对于未变更的部分，显式标记 `[Retained]` 以告知 Reviewer 和 AI 保持现状。
 * * 2. 意图驻留 (Intent Persistence):
 * - **严禁删除** 解释“为什么这么做”的注释，即使该功能被暂时降级。
 * - 字段的注释往往包含了对未来的规划（如 `entropy` 字段），删除它们等于丢失了系统的长期记忆。
 * * 3. 结构兼容性 (Structural Compatibility):
 * - 避免为了“代码洁癖”而删除看似无用但承载兼容性的字段。
 * - 所有的删除操作必须有明确的 Case 证明该字段是有害的，否则一律保留。
 */
export function Principle_SideEffect_Control() {
    /**
     * [Anti-Pattern] 错误的洁癖
     * 删除 `entropy` 字段，理由是“当前版本好像没用到”。
     * Consequence: 下个版本要加回注意力调度时，不得不重新修改协议，破坏了接口稳定性。
     */
    
    /**
     * [Best Practice] 意图保留
     */
    interface ExampleProtocol {
        // [Retained] 虽然 v2.0 暂时只用简单轮询，但保留熵值以支持未来的 AI 调度
        entropy: number; 
    }
}

// ========================================================
// SECTION 2: 命名规范 (Naming Conventions)
// ========================================================

/**
 * 标准化命名前缀
 */
export function Standard_Naming_Prefixes() {
    const prefixes = [
        "Project_",    // 顶层项目
        "Phase_",      // 阶段
        "Component_",  // 组件
        "Task_",       // 任务
        "Goal_",       // 目标
        "Feature_",    // 特性
        "Define_",     // 数据定义
        "Status_",     // 状态数组
        "Case_",       // 演进案例
        // 迭代标记 (通常用于注释或 JSDoc)
        "Tag_Retained", // [Retained] 明确表示保留
        "Tag_Modified", // [Modified] 明确表示修改
        "Tag_New"       // [New] 明确表示新增
    ];
}

// ========================================================
// SECTION 3: 编写模板 (Writing Templates)
// ========================================================

/**
 * [Template] 数据协议定义
 */
export function Template_Data_Protocol() {
    interface RuntimeStateDump {
        timestamp: number;
    }
}

/**
 * [Template] 任务定义
 */
export function Template_Task_Definition() {
    /**
     * [Task] 实现功能
     * @solves Case_Login_Timeout // 显式链接到 Case
     */
    function Task_Implement_Feature() {
        const _schema: Template_Data_Protocol = null;
    }
}

/**
 * [Template] 进度管理
 */
export function Template_Progress_Tracking() {
    // 必须包含所有定义的 Task
    // export const Status_Todo = [Task_Implement_Feature];
}

/**
 * [Template] 迭代式更新模板
 * 用于展示如何以最小化修改的方式进行版本升级。
 */
export function Template_Iterative_Update() {
    
    /**
     * [Define] 数据协议 (v2.0)
     * Base: v1.0
     */
    interface Define_Data_Protocol_v2 {
        // [Retained] 核心 ID 保持不变，确保数据库兼容
        uid: string;
        
        // [Modified] 精度提升：从 int 变为 float
        value: number; 
        
        // [New] @solves Case_Time_Travel
        timestamp_ns: number;
    }
}

// ========================================================
// SECTION 5: 演进案例库 (Evolutionary Case Registry)
// ========================================================

/**
 * [Template] 演进案例 (Evolution Case)
 * 用于记录驱动系统演进的真实用户场景、Corner Cases 或技术债。
 * 这是一个只增不减的“判例库”。
 */
export function Template_Evolution_Case() {
    
    /**
     * [Structure] 案例标准结构
     */
    const Case_Structure_Definition = {
        id: "Case_Name_Identifier",
        type: "User_Scenario" || "Corner_Case" || "Performance_Bottleneck",
        // 用户故事：具体发生了什么？
        user_story: "用户在弱网环境下快速点击提交按钮，导致重复订单。",
        // 根本原因：为什么现有系统无法处理？
        root_cause: "前端防抖仅在 UI 层，API 层缺乏幂等性检查。",
        // 解决方案映射：指向具体的 Tasks 或 Protocols
        solution_map: [
            "Protocol_Idempotency_Token", // 指向协议
            "Task_API_Deduplication"      // 指向任务
        ],
        // 状态：解决与否
        status: "Resolved"
    };

    /**
     * [Example] 实际案例
     */
    const Case_2026_Ghost_Click = {
        type: "Corner_Case",
        user_story: "自动化测试中，脚本点击速度过快(1ms)，React 状态未更新即触发二次点击，导致断言失败。",
        solution_map: ["Task_Inject_Human_Delay"]
    };
}

// ========================================================
// SECTION 6: 检查清单 (Compliance Checklist)
// ========================================================

export const Checklist_Compliance = [
    "1. Manifest: 是否导出了 Meta_Context?",
    "2. Gestalt: 是否定义了 invariant_vision 来锚定核心问题?",
    "3. Case-Driven: 所有的重大重构是否有对应的 Case_ 支撑?",
    "4. Minimization: 修改是否遵循了最小化原则？(Diff check)",
    "5. Intent: 是否保留了原有的设计意图注释？(No silence deletion)",
    "6. Side-Effects: 删除字段前是否评估了潜在的结构性副作用？",
    "7. Visibility: 是否使用了 export 关键字?",
    "8. Integrity: 所有 Task 是否都已归档入 Status 数组?"
];