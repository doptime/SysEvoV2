这是一份基于之前所有讨论、代码实现及新需求（前后端一体化、多目录支持）重新整理的**SysEvoV2 项目技术规格说明书**。

这份文档去除了所有文学性隐喻，采用了工程化、精确的描述，确保实现时无歧义。

---

# 项目规格说明书：SysEvoV2 (自动化代码演进系统)

**版本:** v2.1 (Engineering Spec)
**日期:** 2026-01-20
**状态:** 开发中 (In Development)
**硬件基准:** 8x NVIDIA RTX 3090 (192GB VRAM), Local Context Limit: 65k Tokens
**目标架构:** 前后端一体化 Monorepo (Golang + TypeScript)

---

## 1. 系统概述 (System Overview)

SysEvoV2 是一个基于 **AST 感知** 和 **混合检索** 的自动化代码修改系统。它旨在解决大规模代码库中“上下文选择不准”和“行号修改幻觉”的核心问题。

**核心工作流：**

1. **索引 (Indexing):** 将多目录下的源码解析为 AST 语义块 (Chunks) 并建立符号索引。
2. **筛选 (Selection):** 基于意图利用本地 LLM 筛选骨架，并结合符号索引进行确定性依赖扩散。
3. **生成 (Generation):** 利用云端 LLM 生成基于 AST 节点的完整替换代码。
4. **应用 (Application):** 通过本地 AST 定位进行精准的代码替换与格式化。

---

## 2. 详细架构设计 (Detailed Architecture)

系统由三个核心子系统组成：**分析层 (Analysis)**、**上下文层 (Context)**、**执行层 (Execution)**。

### 2.1 组件 A：代码库分析与索引 (Codebase Analysis & Indexing)

负责将静态文件转换为可查询的语义数据结构。

* **输入:** * 配置的 **根目录列表 (Root Directories)**（支持前后端多目录，如 `["./backend", "./frontend"]`）。
* **核心模块:** `analysis/indexer.go`
* **处理流程:**
1. **增量扫描:** 遍历指定目录，对比 `sys/files/meta` 中的修改时间戳，仅处理变动文件。
2. **AST 切分 (Chunking):**
* **Golang:** 使用 `go/ast` 提取 `FuncDecl`, `GenDecl` (Struct/Interface)。
* **TypeScript:** 调用 Node.js Sidecar (`analyzers/ts/index.js`) 解析 AST。
* **粒度:** 最小单位为“语义块 (Chunk)”，包含函数签名、注释及完整函数体。


3. **元数据提取:**
* `SymbolsDefined`: 该块定义的标识符（如函数名、结构体名）。
* `SymbolsReferenced`: 该块内部调用的所有标识符（用于构建依赖图）。


4. **持久化 (Storage):**
* **Chunk 数据:** 存入 Redis Hash `sys/chunks`。
* **符号索引:** 存入 Redis Set `sys/idx/sym/{symbol}` (倒排索引: 符号 -> ChunkID列表)。





### 2.2 组件 B：上下文选择器 (Context Selector)

负责根据用户意图构建最小且完备的代码上下文。

* **输入:** 用户意图 (Intent string)。
* **核心模块:** `context/selector.go`
* **处理流程:**
1. **Level 0 (加载):** 从 Redis 加载所有 Chunk 的 **骨架 (Skeleton)** (仅签名+注释，无实现)。
2. **Level 1 (语义筛选):** * 将意图和骨架列表输入本地 LLM (Agent/GLM-4.7)。
* LLM 输出与任务直接相关的 ChunkID 列表 (JSON 格式)。


3. **Level 2 (依赖扩散):**
* 遍历 Level 1 选中 Chunk 的 `SymbolsReferenced`。
* 查询 `sys/idx/sym/*` 索引，强制拉取定义了这些符号的 Chunk (1-Hop 依赖)。
* *目的:* 确保云端模型拥有类型定义和工具函数的上下文，避免幻觉。


4. **输出:** 包含完整代码体 (Body) 的 Chunk 列表。



### 2.3 组件 C：生成与编辑 (Generation & Editing)

负责生成修改方案并安全地应用到磁盘。

* **输入:** 完整上下文 Chunk 列表 + 用户意图。
* **核心模块:** `workflow/goal_runner.go`, `editing/ast_editor.go`
* **生成策略 (Cloud Agent):**
* 模型: Google Gemini 3.0。
* 协议: 输出 `CodeModification` 结构。
* **约束:** 禁止使用行号。必须使用 `TargetChunkID` 定位，并提供完整的 `NewContent` (AST 节点全量替换)。


* **应用策略 (AST Patching):**
1. **定位:** 读取目标文件，实时解析 AST，根据 `TargetChunkID` (如 `User.Save`) 匹配最新的 Byte Offset (Start, End)。
2. **替换:** 执行字节级替换。
* *Modify:* 替换指定范围。
* *Delete:* 删除指定范围。
* *Create/Append:* 写入新文件或追加到文件末尾。


3. **修复:** 调用 `goimports` (Go) 或 `prettier` (TS) 自动修复导入路径和格式。



---

## 3. 数据结构规范 (Data Schema)

基于 Doptime Framework 的存储定义。

### 3.1 存储键 (Storage Keys)

| Key Pattern | 类型 | 用途 |
| --- | --- | --- |
| `sys/chunks` | `Hash<string, *Chunk>` | 存储代码块实体。Field 为 ChunkID。 |
| `sys/files/meta` | `Hash<string, int64>` | 存储文件修改时间戳，用于增量检查。 |
| `sys/idx/sym/{symbol}` | `Set<string>` | 符号倒排索引。存储定义该符号的 ChunkID 集合。 |
| `sys/solutions` | `Hash<string, *Solution>` | 存储生成的修改方案历史。 |

### 3.2 核心模型 (Models)

**Chunk (代码原子)**

```go
type Chunk struct {
    ID                string   `json:"id"`                 // "filepath:Signature"
    Type              string   `json:"type"`               // "Function" | "Struct"
    Skeleton          string   `json:"skeleton"`           // 签名 + 注释
    Body              string   `json:"body"`               // 完整代码
    SymbolsDefined    []string `json:"symbols_defined"`    // 定义的符号
    SymbolsReferenced []string `json:"symbols_referenced"` // 调用的符号
    FilePath          string   `json:"file_path"`
}

```

**CodeModification (修改指令)**

```go
type CodeModification struct {
    FilePath      string `json:"file_path"`
    TargetChunkID string `json:"target_chunk_id"` // 锚点 ID
    ActionType    string `json:"action_type"`     // MODIFY | DELETE | CREATE_FILE
    NewContent    string `json:"new_content"`     // 完整的新 AST 节点代码
    Reasoning     string `json:"reasoning"`
}

```

---

## 4. 实施路线图 (Implementation Roadmap)

### Phase 1: 基础架构构建 (Infrastructure)

* [x] **存储层:** 实现 Redis Key 定义 (`storage/keys.go`, `storage/index_client.go`)。
* [x] **解析层 (Go):** 实现 `go/ast` 解析器 (`analysis/parser_go.go`)。
* [x] **解析层 (TS):** 实现 Node.js Sidecar 解析器 (`analysis/parser_ts_sidecar.go`)。
* [ ] **索引器:** 更新 `RunIncrementalIndexing` 以支持传入**目录切片 (`[]string`)**，并串联解析与存储逻辑。

### Phase 2: 上下文选择 (Context Selection)

* [ ] **Agent 集成:** 移植旧版 Agent (`agent`, `models` 包) 到新架构。
* [ ] **选择器:** 实现 `context/selector.go`，联通本地 LLM 与 Redis 索引。

### Phase 3: 生成与执行 (Execution)

* [ ] **编辑器:** 实现 `editing/ast_editor.go`，完成基于 AST 的精准替换逻辑。
* [ ] **工作流:** 实现 `workflow/goal_runner.go`，串联 Context -> Cloud Agent -> Editor 闭环。

---

## 5. 关键风险与规避 (Risk Management)

1. **风险:** 目录遍历遗漏。
* *规避:* `RunIncrementalIndexing` 入口参数强制改为 `rootDirs []string`，并在配置中明确列出所有源码根目录（如 `backend/`, `frontend/src/`）。


2. **风险:** 隐式依赖丢失（如 Middleware）。
* *规避:* 符号索引采用“字符串强匹配”策略（Dirty Index），宁滥勿缺。


3. **风险:** 代码替换导致 Import 丢失。
* *规避:* 编辑器在写入文件后，**强制执行** `goimports` (Go) 或自动导入修复逻辑。


4. **风险:** TypeScript 解析环境依赖。
* *规避:* 采用 Sidecar 模式，将 TS 解析器作为独立子进程运行，不依赖宿主项目的 `node_modules`。



---

**指令:**
本项目文档作为后续开发的**唯一真理来源 (Single Source of Truth)**。所有代码实现必须严格遵循上述数据结构与流程定义。