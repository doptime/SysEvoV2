/**
 * Project: VisualTelemetry (Project Ouroboros)
 * Version: Standardized (Current)
 * Target: Industry Standard Specification
 * Philosophy: 
 * 1. Perception: Universal K-Lines for Any Signal (Visual/Logic/Virtual).
 * 2. Action: Choreography as Code (Time-aligned, Mock-enabled).
 * 3. Diagnosis: Correlation of Variance (Input vs Output).
 * 4. Evolution: Sedimentation over Refactoring (Structure is Equilibrium).
 */

// ========================================================
// SECTION 0: 元数据清单 (The Manifest)
// ========================================================

/**
 * [Manifest]
 * VisualTelemetry 自动化演进系统标准定义。
 */
export const Meta_Context = {
    project: "Project VisualTelemetry",
    version: "Standardized (Current)",
    target_audience: ["Developers", "AI Agents"],
    // [Invariant] 恒定愿景
    invariant_vision: "构建连接 3D 运行时与开发时的自动化闭环，将不可观测的物理手感转化为可度量、可验证的工程指标。",
    description: "定义基于通用 K 线插座、时间轴动作编排与相关性诊断的自动化演进系统。确立了以全维感知为基础、动作编排为手段、相关性验证为核心的闭环架构。",
    core_architecture: {
        sensing: "Universal Signal Socket (Visual + Logic + Virtual)",
        acting: "Action Timeline Protocol (ATP)",
        verification: "Marker-Aligned Correlation & Rank Topology"
    },
    // [GOVERNANCE] 治理传递性声明 (Transitive Governance)
    // 显式承诺本项目遵循 SysEvoV2 的演进物理学原则。
    // 任何对此文件的修改，必须通过此治理策略的审查。
    evolution_governance: {
        // 策略: 沉积式 (只增不减，分层累积)
        strategy: "Sedimentary Accumulation",
        // 物理法则: 最小作用量 (优先追加接口，严禁重构核心)
        physics: "Principle of Least Action",
        // 意图管理: 严格驻留 (删除字段必须保留注释尸体)
        intent_residency: "Strict",
        // 终极目标: 结构均衡 (Structure is Equilibrium)
        equilibrium_target: "Universal Input/Output Correlation"
    }
};

// ========================================================
// SECTION 5: 演进案例库 (Evolutionary Case Registry)
// ========================================================

/**
 * [Registry] 系统的判例库。
 * 这些案例是系统结构存在的根本理由。任何修改必须锚定于此。
 */
export const Registry_Evolution_Cases = {
    Case_Dynamic_Visuals: {
        id: "Case_Dynamic_Visuals",
        type: "User_Scenario",
        user_story: "自动化测试未能捕捉按钮旋转(Rotation)动效的错误，因为早期版本仅监控 AABB 包围盒。",
        // [Proof of Governance] 解决方案采用扩展而非重写，符合最小作用量
        solution_map: ["Define_Physical_State_Extended", "Task_Attribute_Active_Bind"]
    },
    Case_Virtual_Telemetry: {
        id: "Case_Virtual_Telemetry",
        type: "Architecture_Gap",
        user_story: "飞行器引擎推力是纯后端逻辑数据，无法通过 DOM 监控接入。",
        solution_map: ["Task_Virtual_Channel_Push"]
    },
    Case_Logic_State_Divergence: {
        id: "Case_Logic_State_Divergence",
        type: "Logic_Bug",
        user_story: "量角器游戏视觉显示60度，但内部逻辑判定为59度，导致误判。",
        solution_map: ["Task_Signal_Binding_Hook"]
    },
    Case_Adhoc_Instrumentation: {
        id: "Case_Adhoc_Instrumentation",
        type: "Ops_Bottleneck",
        user_story: "LLM 诊断时需要临时监控未埋点的变量。",
        solution_map: ["Protocol_Dynamic_Directive"]
    },
    Case_Input_Output_Correlation: {
        id: "Case_Input_Output_Correlation",
        type: "Diagnosis_Failure",
        user_story: "输入剧烈变化（疯狂拖拽）但输出纹丝不动，系统未能识别这种‘无响应’死锁。",
        solution_map: ["Protocol_Action_Timeline", "Task_Marker_Alignment"]
    },
    Case_SideEffect_Isolation: {
        id: "Case_SideEffect_Isolation",
        type: "Testing_Constraint",
        user_story: "需要调试‘支付成功’后的动画，但不能产生真实订单。",
        solution_map: ["Protocol_Action_Timeline (Network Mock)"]
    }
};

// ========================================================
// SECTION 1: 核心指标定义 (Metric Standards)
// ========================================================

/**
 * [Standard] 原子指标集
 * 包含物理、性能、UI 及逻辑信号的全集。
 */
export const Atomic_Metric_Set = {
    // 物理层 (Spatial Physics)
    // [Intent] 保留基础物理属性以兼容 v16.0 之前的算法
    spatial: ["aabb_volume", "velocity_magnitude", "kinetic_energy"],
    
    // 性能层 (Performance)
    compute: ["execution_time_ms", "memory_allocation_bytes"],
    
    // UI 物理属性 (UI Physics)
    // @solves Case_Dynamic_Visuals
    ui_physics: ["rotation", "opacity", "scale", "z_index"],
    
    // 逻辑信号 (Logic Signals)
    // @solves Case_Logic_State_Divergence
    logic: ["score", "game_state_val", "custom_metric"]
};

/**
 * [Define] 扩展物理状态结构
 * 用于标准化 UI 组件的上报数据。
 */
export interface Define_Physical_State_Extended {
    x: number; y: number;
    width: number; height: number;
    rotation?: number; // Normalized 0-360
    opacity?: number;
    scale?: number;
}

// ========================================================
// SECTION 2: 数据协议 (Data Protocols)
// ========================================================

/**
 * [Protocol] 维度 K 线 (Dimensional K-Line)
 * 核心标准结构，兼容所有类型的信号。
 */
export interface DimensionalKLine {
    target_uid: string;   // 对象唯一标识
    metric_key: string;   // 指标名称 (支持 rotation, score, etc.)
    time_window: number;  // 聚合窗口(ms)
    
    // OHLC (Open, High, Low, Close)
    ohlc: [number, number, number, number];
    
    // [Intent Residency] 
    // 该字段受 `evolution_governance.intent_residency` 保护。
    // 即使当前未激活高级调度，保留此字段以维持向高级形态演进的结构通道。
    entropy: number;      // 信息熵
    sample_count: number; // 原始采样点数
}

/**
 * [Protocol] 动作时间轴协议 (ATP)
 * @solves Case_Input_Output_Correlation, Case_SideEffect_Isolation
 */
export interface Protocol_Action_Timeline {
    op: "EXECUTE_CHOREOGRAPHY";
    scenario_id: string;
    strategy: "human_like" | "mechanical";
    timeline: Array<{
        offset_ms: number;
        // 动作原语: POINTER_MOVE, CLICK, TYPE, WAIT
        action: string; 
        params?: Record<string, any>;
        // 环境控制: NETWORK_MOCK (用于副作用隔离)
        mock_context?: {
            url_pattern: string;
            response_body: any;
        };
        // [Critical] 用于对齐诊断的标记
        marker?: string; // e.g., "DRAG_START"
    }>;
}

/**
 * [Protocol] 动态指令协议
 * @solves Case_Adhoc_Instrumentation
 */
export interface Protocol_Dynamic_Directive {
    op: "MOUNT_SIGNAL";
    path: string;
    source: {
        type: "DOM_SELECTOR" | "GLOBAL_VAR" | "VIRTUAL_PUSH";
        selector?: string;
        varPath?: string;
    };
}

/**
 * [Protocol] 位序契约 (Rank Topology Contract)
 * 用于验证 UI 层级或逻辑关系的稳定性。
 */
export interface RankContract {
    contract_id: string;
    expected_order: string[]; 
    tolerance: {
        frames: number;
        value_margin: number;
    };
}

// ========================================================
// SECTION 3: 任务定义 (Task Architecture)
// ========================================================

/**
 * [Phase 1] 感知与压缩 (Sensing)
 * 负责建立从运行时到数据流的通用连接。
 */
export function Phase_1_Sensing() {
    const _tasks = [
        Task_Saliency_Allocator,    // [Structure] 即使算法退化，结构保留以维持均衡
        Task_KLine_Sampler,         // 核心 K 线生成
        Task_Virtual_Channel_Push,  // 虚拟信道
        Task_Attribute_Active_Bind, // 逻辑属性绑定
        Task_Dynamic_Directive_Mount// 动态挂载
    ];
}

/**
 * [Phase 2] 编排与行动 (Orchestration)
 * 负责执行时间轴动作与环境模拟。
 */
export function Phase_2_Orchestration() {
    const _tasks = [
        Task_Timeline_Executor,      // 执行 ATP 剧本
        Task_Environment_Interceptor // 执行 Mock
    ];
}

/**
 * [Phase 3] 诊断与验证 (Diagnosis)
 * 负责基于相关性与拓扑契约的健康度检查。
 */
export function Phase_3_Diagnosis() {
    const _tasks = [
        Task_Topology_Checker,    // 静态/层级正确性
        Task_Marker_Alignment     // 动态/交互响应性
    ];
}

/**
 * [Task] K 线采样器
 * Logic: 聚合来自 DOM、Virtual、Signals 的所有数据，计算 OHLC 和 Entropy。
 */
export function Task_KLine_Sampler() {}

/**
 * [Task] 虚拟信道推送接口
 * @solves Case_Virtual_Telemetry
 * Logic: 提供 pushMetric(id, key, val) 接口，允许异构系统写入。
 */
export function Task_Virtual_Channel_Push() {}

/**
 * [Task] 逻辑属性绑定
 * @solves Case_Logic_State_Divergence
 * Logic: 将组件内部状态 (State) 绑定到监控流。
 */
export function Task_Attribute_Active_Bind() {}

/**
 * [Task] 时间轴执行器
 * @solves Case_Input_Output_Correlation
 * Logic: 解析 ATP，使用贝塞尔曲线插值执行动作，并双写 Marker 到数据流。
 */
export function Task_Timeline_Executor() {
    const _input: Protocol_Action_Timeline = null;
}

/**
 * [Task] 标记对齐分析器
 * @solves Case_Input_Output_Correlation
 * Logic: 提取 Marker 间区间，计算 Input 方差与 Output 方差的相关性。
 */
export function Task_Marker_Alignment() {}

// ========================================================
// SECTION 4: 进度看板 (Roadmap)
// ========================================================

export const Status_Core_Capabilities = [
    Phase_1_Sensing,
    Task_Saliency_Allocator,
    Task_KLine_Sampler,
    Task_Virtual_Channel_Push,
    Phase_2_Orchestration,
    Task_Timeline_Executor,
    Phase_3_Diagnosis,
    Task_Topology_Checker,
    Task_Marker_Alignment
];