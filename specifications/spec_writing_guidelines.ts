/**
 * Project: SysEvoV2 Meta-Specifications
 * Version: 1.0 (TS-Spec Edition)
 * Target: Developers & AI Agents
 * Context: 定义如何编写 SysEvoV2 兼容的 TypeScript 规格说明书。
 */

// ========================================================
// SECTION 1: 核心原则 (Core Principles)
// ========================================================

/**
 * [Master Rule] 规格说明书最高指导原则
 * * Core Philosophy: "Types are Contracts, Exports are Context."
 * 1. TS 即文档 (TS as Docs): 文件必须是合法的 TypeScript，但不需要包含实际逻辑实现。
 * 2. JSDoc 即骨架 (JSDoc as Skeleton): L1 筛选器高度依赖 JSDoc。关键描述必须写在注释里。
 * 3. 导出即可见 (Export as Visibility): 只有 `export` 的元素才会被 Indexer 索引。
 * 4. 数组即关系 (Arrays as Relations): 使用 `export const` 数组来建立聚合关系（如进度、分组）。
 */
export function Guideline_Master_Rule() {
    Principle_JSDoc_Driven_L1();
    Principle_Loose_Typing();
    Principle_Array_Aggregation();
}

/**
 * [Principle 1] JSDoc 驱动的 L1 筛选
 * * Rule: 所有业务目标、需求列表、约束条件，必须写在函数/接口上方的 JSDoc (`/** ... *\/`) 中。
 * Reason: Analyzer.js 提取 Skeleton 时，会优先提取 JSDoc。
 * Anti-Pattern: 把关键逻辑写在函数体内的局部变量里（虽然 TS 允许，但不如 JSDoc 清晰）。
 */
export function Principle_JSDoc_Driven_L1() {
    /**
     * Good Example:
     * [Task] 实现登录功能
     * Requirements: 1. 支持 OAuth; 2. 支持 Email;
     */
    function Good_Task() {}
}

/**
 * [Principle 2] 宽松类型与零副作用
 * * Rule: 不需要为了过编译而写伪代码实现。
 * Benefit: TS 的静态分析允许我们定义空函数或仅声明变量，而无需像 Go 那样显式消耗它们。
 * Technique: 使用 `export function` 定义任务，函数体可以为空，或者仅包含对关键数据类型的引用。
 */
export function Principle_Loose_Typing() {
    // 只需要声明，不需要 _ = ...
    const dependencies = ["Task A", "Task B"];
}

/**
 * [Principle 3] 数组聚合模式
 * * Rule: 使用 `export const` 数组来替代 Go 中的函数调用链。
 * Usage: 用于定义 Project -> Phase -> Task 的层级，或定义 Status (Todo/Done)。
 * Benefit: 这种结构对 AST 分析器来说是扁平且易读的。
 */
export function Principle_Array_Aggregation() {
    // 参见 SECTION 3 的示例
}

// ========================================================
// SECTION 2: 命名规范 (Naming Conventions)
// ========================================================

/**
 * 标准化命名前缀
 * 目的: 统一 Chunk ID 语义，便于 LLM 正则检索。
 */
export function Standard_Naming_Prefixes() {
    const prefixes = [
        "Project_",    // 顶层项目入口
        "Phase_",      // 实施阶段
        "Component_",  // 架构组件
        "Task_",       // 具体原子任务
        "Goal_",       // 业务目标
        "Feature_",    // 功能特性
        "Status_"      // 状态聚合数组
    ];
}

// ========================================================
// SECTION 3: 接口定义检查清单 (Interface Checklist)
// ========================================================

/**
 * 数据协议定义指南
 * * Rule: 使用 `interface` 而非 `type` (更易扩展)。
 * Tips:
 * 1. 字段名应清晰自释。
 * 2. 使用 JSDoc 描述字段含义，而非 Go 的 tag (`json:"..."`).
 * 3. 利用 TS 的联合类型 (Union Types) 来限制枚举值。
 */
export function Checklist_Interface_Definition() {
    interface ExampleData {
        /** Unix 时间戳 */
        timestamp: number;
        /** 严格限制状态值 */
        status: 'PENDING' | 'SUCCESS' | 'FAILED';
        /** 可选字段 */
        details?: string;
    }
}

// ========================================================
// SECTION 4: 推荐模板 (Recommended Template)
// ========================================================

/**
 * 标准 Spec 文件结构模板
 */
export function Template_Spec_File_Structure() {
    // 1. Data Protocols (Interfaces)
    // export interface MyData {}

    // 2. Task Definitions (Functions)
    // export function Task_Do_Something() {}

    // 3. Progress Tracking (Const Arrays)
    // export const Status_Todo = [Task_Do_Something];
}