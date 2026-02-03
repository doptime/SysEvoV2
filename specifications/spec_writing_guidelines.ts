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
    version: "Standardized (Current)",
    target_audience: ["Developers", "AI Agents"],
    // [Invariant] 恒定愿景：无论实现路径如何颠覆，此字段定义了项目存在的根本理由 (The Why)。
    invariant_vision: "建立一套标准化的元规格体系，确保 AI 与人类在快速迭代中保持认知格式塔的完整性。",
    // [Description] 描述：陈述系统当前的固有属性。
    description: "定义 SysEvoV2 兼容规格说明书的编写原则，确立以演进案例为锚点、以演进物理学为边界的系统迭代范式。",
    // [Philosophy] 核心哲学：结构即均衡，修改即微扰。
    core_philosophy: "Code is Context. Diff is Risk. Intent is Permanent. Structure is Equilibrium."
};

// ========================================================
// SECTION 1: 核心原则 (Core Principles)
// ========================================================

/**
 * [Master Rule] 规格说明书最高指导原则
 * * 1. 意图代码化 (Codify the Intent): 全局意图封装在 `Meta_Context` 中。
 * * 2. 导出即索引 (Export as Visibility): Indexer 仅索引 `export` 的元素。
 * * 3. JSDoc 即骨架 (JSDoc as Skeleton): 关键 Requirements 必须写在注释里。
 * * 4. 引用即完整 (Reference as Integrity): 严禁“孤儿任务”。
 * * 5. 优化即案例 (Optimization as Case Study): 拒绝没有 Case 支撑的“凭空设计”。
 * * 6. 演进物理学 (Evolutionary Physics): 系统的演进应遵循“最小作用量原理”。
 * * 7. 治理传递性 (Transitive Governance): 所有子项目必须显式继承演进策略。
 */
export function Guideline_Master_Rule() {
    Principle_Manifest_Pattern();
    Principle_JSDoc_Driven_L1();
    Principle_Referential_Integrity();
    Principle_Anchored_Optimization();
    Principle_Evolutionary_Physics();
    Principle_Transitive_Governance();
}

/**
 * [Principle 1] 清单模式 (Manifest Pattern)
 * Rule: 文件头部必须定义并导出 `Meta_Context` 对象，且必须包含 `invariant_vision`。
 */
export function Principle_Manifest_Pattern() {
    /**
     * [Why]
     * AI Agent 需要在不读取全文的情况下，通过 AST 快速抓取 `Meta_Context` 
     * 来判断该文件是否属于当前任务的上下文。
     * `invariant_vision` 提供了对抗长期迭代漂移的锚点。
     */
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
    function Good_Task() {
        // bad: 逻辑写在函数体里，L1 索引器看不见
        // good: 逻辑写在 JSDoc @solves 标签里
    }
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
    // 这会导致 Task_A 成为“幽灵代码”，开发者以为在做，但项目视图里没有。
}

/**
 * [Principle 4] 锚定优化 (Anchored Optimization)
 * Rule: 所有的优化措施（Solution Map）必须锚定在具体的 Case 上。
 * 1. 增量式记录：不要修改旧的 Case，而是追加新的 Case。
 * 2. 历史不可变：已解决的 Case 是系统的“判例法”。
 */
export function Principle_Anchored_Optimization() {
    // 参见 SECTION 5 的 Template_Evolution_Case
}

/**
 * [Principle 5] 演进物理学 (Evolutionary Physics)
 * Definition: 一套关于“修改”的物理法则，旨在维护系统的熵值稳定。
 * * * * Rule 1: 最小作用量 (Principle of Least Action)
 * - 修改应是对现有结构的“微扰”而非“重构”。
 * - 操作优先级：Append (追加) > Extend (扩展) > Deprecate (弃用) >>> Delete (删除)。
 * - 凡是可以通过“追加新接口”解决的问题，绝不修改“旧接口”。
 * * * * Rule 2: 意图驻留 (Intent Residency)
 * - 代码定义了“怎么做”，注释必须定义“为什么”。
 * - 严禁删除看似无用但包含设计意图的字段（Chesterton's Fence）。
 * - 如果必须删除，必须保留该字段的尸体（注释化）并附带 Case ID，作为历史路标。
 * * * * Rule 3: 结构均衡导向 (Equilibrium Orientation)
 * - 每一次修改都应被视为向“最终形态”的一次收敛。
 * - 所有的临时补丁（Ad-hoc）必须被标记为不稳定，并在下一次均衡周期中被标准协议吸收。
 */
export function Principle_Evolutionary_Physics() {
    /**
     * [Anti-Pattern] 破坏均衡
     * 为了代码整洁，删除了 `entropy` 字段，理由是“当前版本没用到”。
     * 后果：未来需要恢复注意力机制时，不得不破坏 API 签名。
     */
    
    /**
     * [Best Practice] 意图驻留
     * // [Retained] 保留此字段以兼容 v16.0 算法
     * entropy: number;
     */
}

/**
 * [Principle 6] 治理传递性 (Transitive Governance)
 * Rule: 原则必须显式传递到每一个叶子节点。
 * 1. 显式继承 (Explicit Inheritance):
 * 每个 Spec 的 `Meta_Context` 必须包含 `evolution_governance` 字段。
 * 2. 策略绑定 (Policy Binding):
 * 必须声明该项目采用 "Sedimentary" (沉积式) 还是 "Experimental" (实验性) 演进策略。
 * 对于生产级项目 (Standardized)，必须采用沉积式。
 * 3. 意图链 (Chain of Intent):
 * 项目中的 Case 必须能够追溯到 Guideline 中的原则。
 */
export function Principle_Transitive_Governance() {
    /**
     * [Compliance Requirement]
     * Meta_Context.evolution_governance = {
     * strategy: "Sedimentary",
     * physics: "Principle of Least Action",
     * intent_residency: "Strict"
     * }
     */
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
        "Protocol_",   // 协议定义
        "Define_",     // 数据定义
        "Status_",     // 状态数组
        "Case_",       // 演进案例
        // 意图标记 (用于 JSDoc)
        "Tag_Retained", // [Retained] 明确保留
        "Tag_Invariant" // [Invariant] 永恒不变
    ];
}

// ========================================================
// SECTION 3: 编写模板 (Writing Templates)
// ========================================================

/**
 * [Template] 协议演进模板
 * 展示如何应用演进物理学进行修改。
 */
export function Template_Protocol_Evolution() {
    
    /**
     * [Protocol] 核心数据结构
     * Base Version: 1.0
     */
    interface Define_Data_Protocol {
        // [Invariant] 核心标识符，系统的锚点
        uid: string;
        
        // [Retained] 原有的整型值。
        // 虽然 v2.0 推荐使用 float_val，但保留此字段以避免破坏数据库 schema。
        int_val: number; 
        
        // [New] @solves Case_Precision_Loss
        // 引入浮点数以支持更高精度的物理模拟。
        float_val: number;
    }
}

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

// ========================================================
// SECTION 5: 演进案例库 (Evolutionary Case Registry)
// ========================================================

/**
 * [Template] 演进案例 (Evolution Case)
 * 系统的判例库，只增不减。
 */
export function Template_Evolution_Case() {
    
    const Case_Structure_Definition = {
        id: "Case_Identifier",
        type: "User_Scenario" || "Architecture_Gap",
        // 用户故事：具体发生了什么？(The Context)
        user_story: "用户快速点击导致重复提交。",
        // 根本原因：为什么现有系统无法处理？
        root_cause: "缺乏幂等性检查。",
        // 解决方案映射：指向具体的 Tasks 或 Protocols
        solution_map: ["Protocol_Idempotency"],
        status: "Resolved"
    };
}

// ========================================================
// SECTION 6: 检查清单 (Compliance Checklist)
// ========================================================

export const Checklist_Compliance = [
    "1. Manifest: 是否导出了 Meta_Context 且包含 core_philosophy?",
    "2. Governance: 是否在 Meta_Context 中显式定义了 `evolution_governance`?",
    "3. Equilibrium: 修改是否破坏了现有的结构均衡?",
    "4. Case-Driven: 所有的变更是否有 Case_ 支撑?",
    "5. Least Action: 是否采用了最小作用量的方式（优先追加而非删除）?",
    "6. Intent Residency: 是否保留了被废弃字段的意图注释?",
    "7. Integrity: 所有 Task 是否都已归档?",
    "8. Visibility: 是否使用了 export 关键字?"
];