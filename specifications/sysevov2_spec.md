# 项目规格说明书：SysEvoV2 (自动化代码演进系统)

**版本:** v2.2 (Diamond Selection Spec)
**日期:** 2026-01-28
**状态:** 核心功能就绪 (Core Features Ready)
**硬件基准:** 8x NVIDIA RTX 3090 (192GB VRAM), Local Context Limit: 128k Tokens
**目标架构:** 前后端一体化 Monorepo (Golang + TypeScript)

---

## 1. 系统概述 (System Overview)

SysEvoV2 是一个基于 **AST 感知** 和 **混合检索** 的自动化代码修改系统。它旨在解决大规模代码库中“上下文选择不准”和“行号修改幻觉”的核心问题。

**核心工作流：**

1. **索引 (Indexing):** 将多目录下的源码解析为 AST 语义块 (Chunks) 并建立符号索引。
2. **筛选 (Selection):** 采用 **“菱形选择” (Diamond Selection)** 策略：先由本地 LLM 锁定核心骨架，进行依赖扩散，再进行**负选择 (Negative Selection)** 剔除冗余实现。
3. **生成 (Generation):** 利用云端 LLM 生成基于 AST 节点的完整替换代码。
4. **应用 (Application):** 通过本地 AST 定位进行精准的代码替换与格式化。

---

## 2. 详细架构设计 (Detailed Architecture)

系统由三个核心子系统组成：**分析层 (Analysis)**、**上下文层 (Context)**、**执行层 (Execution)**。

### 2.1 组件 A：代码库分析与索引 (Codebase Analysis & Indexing)

负责将静态文件转换为可查询的语义数据结构。

* **输入:** 配置的 **根目录列表 (Root Directories)**（支持前后端多目录，如 `["./backend", "./frontend"]`）。
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

负责根据用户意图构建最小且完备的代码上下文。采用 **L1(精选) -> L2(扩散) -> L2.5(负选)** 策略。

* **输入:** 用户意图 (Intent string)。
* **核心模块:** `context/selector.go`
* **处理流程:**
1. **Level 0 (加载):** 从 Redis 加载所有 Chunk 的 **骨架 (Skeleton)** (仅签名+注释，无实现)。
2. **Level 1 (语义筛选):**
* 将意图和骨架列表输入本地 LLM (Agent/GLM-4 等)。
* LLM 输出与任务直接相关的 **Core ChunkID** 列表。


3. **Level 2 (依赖扩散):**
* 遍历 Level 1 选中 Chunk 的 `SymbolsReferenced`。
* 查询 `sys/idx/sym/*` 索引，强制拉取定义了这些符号的 Chunk (1-Hop 依赖)。
* *增强:* 调用 `ensureStructDefinitions` 防止方法被选中但宿主结构体丢失。


4. **Level 2.5 (负选择/审查):** **[NEW]**
* **目的:** 解决扩散导致的上下文膨胀。
* **逻辑:** 将 Level 2 引入的**函数类依赖**再次输入本地 LLM 进行二分类审查。
* *Keep Body:* 修改需要或逻辑复杂 -> 保留完整代码。
* *Skeleton Only:* 仅需调用，无需了解实现 -> **降级为仅保留骨架 (Signature)**。


* *注:* 结构体/接口定义通常直接保留 Body 以防幻觉。


5. **自动升格 (Auto-Promotion):**
* 计算每个文件的 Chunk 选中密度。
* 如果某文件被选中的 Chunk 占比超过阈值 (如 50%)，则读取该文件的**全量源码**放入上下文，方便 LLM 理解全局或进行手动合并。




* **输出:** 混合上下文结构 (SelectedContext)，包含：
* `FullFiles`: 升格的完整文件内容。
* `Chunks`: 未升格文件中的 Chunk (包含 Body 或 降级后的 Skeleton)。



### 2.3 组件 C：生成与编辑 (Generation & Editing)

负责生成修改方案并安全地应用到磁盘。

* **输入:** 混合上下文 (FullFiles + Chunks) + 用户意图。
* **核心模块:** `workflow/goal_runner.go`, `editing/ast_editor.go`
* **生成策略 (Cloud Agent):**
* 模型: Google Gemini 3.0。
* 协议: 输出 `CodeModification` 结构。
* **约束:** 禁止使用行号。必须使用 `TargetChunkID` 定位，并提供完整的 `NewContent` (AST 节点全量替换)。
* **安全:** Prompt 包含防御性指令，禁止修改标记为 `[READ-ONLY REFERENCE]` 的骨架代码。


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
    Type              string   `json:"type"`               // "Function" | "Struct" | "Interface"
    Skeleton          string   `json:"skeleton"`           // 签名 + 注释
    Body              string   `json:"body"`               // 完整代码
    SymbolsDefined    []string `json:"symbols_defined"`    // 定义的符号
    SymbolsReferenced []string `json:"symbols_referenced"` // 调用的符号
    FilePath          string   `json:"file_path"`
}