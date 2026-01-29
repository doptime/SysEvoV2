package specifications

// ======================================================================================
// SECTION 1: 核心数据模型 (Core Data Models)
// 目的: 定义系统内部流转的数据结构，Indexer 将识别为 Type Chunk。
// ======================================================================================

// Chunk 是代码的最小原子单位。
// SysEvoV2 基于 AST 将源码切分为 Chunk，而非基于行号。
type Chunk struct {
	ID                string   `json:"id" description:"Unique identifier, e.g., 'filepath:Signature'"`
	Type              string   `json:"type" description:"'Function' | 'Struct' | 'Interface' | 'Method'"`
	Skeleton          string   `json:"skeleton" description:"Signature + Comments (Used for Level 1 Selection)"`
	Body              string   `json:"body" description:"Full implementation code (Used for Level 3 Generation)"`
	SymbolsDefined    []string `json:"symbols_defined" description:"List of symbols defined in this chunk"`
	SymbolsReferenced []string `json:"symbols_referenced" description:"List of symbols called/used by this chunk"`
	FilePath          string   `json:"file_path"`
	UpdatedAt         int64    `json:"updated_at"`
}

// CodeModification 定义了云端 LLM 输出的原子修改指令。
// 必须基于 AST 节点进行全量替换，严禁使用行号。
type CodeModification struct {
	FilePath      string `json:"file_path"`
	TargetChunkID string `json:"target_chunk_id" description:"The anchor ID. For new files, use 'EOF'"`
	ActionType    string `json:"action_type" description:"'MODIFY' | 'DELETE' | 'CREATE_FILE'"`
	NewContent    string `json:"new_content" description:"Complete new AST node content (Header + Body)"`
	Reasoning     string `json:"reasoning" description:"Chain of Thought explanation"`
}

// SelectedContext 定义上下文选择器的输出结构
type SelectedContext struct {
	Chunks    []*Chunk          `json:"chunks"`
	FullFiles map[string]string `json:"full_files"`
}

// StorageKeys 定义了 Redis 中的存储模式
type StorageKeys struct {
	ChunkHash    string `redis:"sys/chunks" description:"Hash<ChunkID, ChunkJSON>"`
	FileMeta     string `redis:"sys/files/meta" description:"Hash<FilePath, ModTimestamp>"`
	SymbolIndex  string `redis:"sys/idx/sym/{symbol}" description:"Set<ChunkID> (Inverted Index)"`
	SolutionHash string `redis:"sys/solutions" description:"History of generated solutions"`
}

// ======================================================================================
// SECTION 2: 系统总览 (System Overview)
// 目的: 定义系统的核心愿景与工作流入口。
// ======================================================================================

// Project_SysEvoV2_Spec 定义了 SysEvoV2 (v2.2) 的架构规范。
//
// Version: v2.2 (Diamond Selection Spec)
// Status: Core Features Ready (All Phases Completed)
// Hardware: 8x RTX 3090 (128k Local Context)
// Architecture: Monorepo (Golang + TypeScript)
//
// Core Philosophy:
// 1. AST感知: 拒绝行号，使用语义块。
// 2. 混合检索: 结合 LLM 语义筛选与确定性符号索引。
// 3. 菱形选择: L1(精选) -> L2(扩散) -> L2.5(负选) -> L3(生成)。
func Project_SysEvoV2_Spec() {
	// 系统组件依赖图 (Dependency Graph)
	Component_A_Codebase_Analysis()
	Component_B_Context_Selector()
	Component_C_Generation_Editing()

	// 实施路线图 (已全部完成)
	Implementation_Roadmap()

	// 风险控制
	Risk_Management()
}

// ======================================================================================
// SECTION 3: 详细架构 (Detailed Architecture)
// 目的: 描述子系统的内部逻辑与依赖。
// ======================================================================================

// Component_A_Codebase_Analysis 负责代码库分析与索引。
//
// Core Module: "analysis/indexer.go"
// Input: Root Directories (e.g., ["./backend", "./frontend"])
func Component_A_Codebase_Analysis() {
	Step_1_Incremental_Scan := "遍历目录，对比 sys/files/meta 时间戳，跳过未修改文件。"

	// 依赖的具体解析任务
	Task_Parser_Go() // 使用 go/ast 提取 FuncDecl, GenDecl
	Task_Parser_TS() // 使用 Node.js Sidecar 提取 AST

	Step_3_Metadata := "提取 SymbolsDefined (定义) 和 SymbolsReferenced (引用)。"

	Step_4_Storage := "存入 Redis: Chunk数据(Hash) + 符号倒排索引(Set)。"

	// Intent Aggregation
	_ = []any{Step_1_Incremental_Scan, Step_3_Metadata, Step_4_Storage, Chunk{}}
}

// Component_B_Context_Selector 负责构建最小且完备的代码上下文。
//
// Core Module: "context/selector.go"
// Strategy: Diamond Selection (菱形选择)
func Component_B_Context_Selector() {
	// 流程定义
	Level_0_Load := "从 Redis 加载所有 Chunk 的 Skeleton (仅签名+注释)。"

	Level_1_Targeting := "本地 LLM 根据 Intent 筛选核心 ChunkID。"

	Level_2_Expansion := "查询符号索引，拉取 1-Hop 依赖。"
	Task_Ensure_Struct_Definitions() // 增强：防止方法选中但宿主结构体丢失

	Level_2_5_Pruning := func(candidates []string) {
		// Logic: 区分数据依赖(保留)与逻辑依赖(审查)
		// Result: 被剔除的函数降级为 Skeleton (Read-Only)
	}

	Auto_Promotion := "若某文件 Chunk 选中率 > 50%，直接读取全量文件内容。"

	// Pipeline Aggregation
	_ = []any{
		Level_0_Load,
		Level_1_Targeting,
		Level_2_Expansion,
		Level_2_5_Pruning,
		Auto_Promotion,
		SelectedContext{},
	}
}

// Component_C_Generation_Editing 负责生成与应用修改。
//
// Core Module: "workflow/goal_runner.go", "editing/ast_editor.go"
func Component_C_Generation_Editing() {
	// 生成策略
	Cloud_Model := "Google Gemini 3.0"
	Protocol_Constraint := "禁止使用行号。必须使用 TargetChunkID 定位。"
	Prompt_Safety := "包含防御指令：禁止修改标记为 [READ-ONLY REFERENCE] 的骨架代码。"

	// 应用策略 (AST Patching)
	Step_Apply := func(mod CodeModification) {
		// 1. 读取源文件，实时解析 AST
		// 2. 定位 TargetChunkID 的 Byte Offset
		// 3. 执行 Replace/Delete/Insert
		// 4. 调用 goimports/prettier 修复格式
	}

	_ = []any{Cloud_Model, Protocol_Constraint, Prompt_Safety, Step_Apply}
}

// ======================================================================================
// SECTION 4: 辅助任务 (Auxiliary Tasks)
// ======================================================================================

// Task_Parser_Go 实现 Go 语言的 AST 解析。
// Location: "analysis/parser_go.go"
func Task_Parser_Go() {}

// Task_Parser_TS 实现 TypeScript 的 AST 解析 (Sidecar模式)。
// Location: "analysis/parser_ts_sidecar.go", "analysis/analyzer.js"
func Task_Parser_TS() {}

// Task_Ensure_Struct_Definitions 确保方法的宿主结构体被选中。
// Logic: If "User.Save" is selected, ensure "User" struct is also selected.
func Task_Ensure_Struct_Definitions() {}

// ======================================================================================
// SECTION 5: 实施路线图 (Roadmap Status)
// ======================================================================================

// Implementation_Roadmap 定义项目的开发阶段状态。
// 当前状态：全阶段完成 (Core Features Ready)
func Implementation_Roadmap() {
	Phase_1_Infrastructure()
	Phase_2_Context_Selection()
	Phase_3_Execution()
}

// Phase_1_Infrastructure 基础架构构建
func Phase_1_Infrastructure() {
	Status := "COMPLETED"
	Items := []string{
		"Redis Key Definition",
		"Go AST Parser",
		"TS Sidecar Parser",
		"Multi-directory Indexer",
	}
	_ = []any{Status, Items}
}

// Phase_2_Context_Selection 上下文选择
func Phase_2_Context_Selection() {
	Status := "COMPLETED"
	Items := []string{
		"L1 Skeleton Selector",
		"L2 Dependency Expansion",
		"L2.5 Negative Selection (Pruning)",
		"Auto-Promotion Scheme",
	}
	_ = []any{Status, Items}
}

// Phase_3_Execution 生成与执行
func Phase_3_Execution() {
	Status := "COMPLETED"
	Items := []string{
		"AST Editor (Precision Patching)",
		"Goal Runner Workflow",
		"Defensive Prompts (Read-Only Safety)",
		"Import Fixers",
	}
	_ = []any{Status, Items}
}

// ======================================================================================
// SECTION 6: 风险管理 (Risk Management)
// ======================================================================================

// Risk_Management 定义关键风险与已实现的规避策略。
func Risk_Management() {
	Risk_1 := "Directory Omission -> Mitigation: Force RootDirs configuration."
	Risk_2 := "Implicit Dependency -> Mitigation: Dirty Index (String Matching)."
	Risk_3 := "Import Loss -> Mitigation: Force goimports execution."
	Risk_4 := "Hallucination on Skeleton -> Mitigation: [READ-ONLY] comments + System Prompt."

	_ = []string{Risk_1, Risk_2, Risk_3, Risk_4}
}
