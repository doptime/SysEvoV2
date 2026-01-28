package context

import (
	"fmt"
	"strings"
	"text/template"

	"sysevov2/agent"
	"sysevov2/llm"
	"sysevov2/models"
	"sysevov2/storage"
	"sysevov2/utils"

	"github.com/samber/lo"
)

// SelectedContext 封装最终的选择结果
type SelectedContext struct {
	Chunks    []*models.Chunk   // 包含 Core(Body), Type(Body), KeptDep(Body), PrunedDep(Skeleton)
	FullFiles map[string]string // 路径 -> 文件内容 (被“升格”的文件)
}

type Selector struct {
	SelectionAgent         *agent.Agent
	NegativeSelectionAgent *agent.Agent // [NEW] Level 2.5 负选择 Agent
	FilesMustInclude       []string
	PromotionThreshold     float64
}

type SelectionResult struct {
	SelectedIDs []string `description:"The list of Chunk IDs that are strictly necessary."`
}

func NewSelector() *Selector {
	// Level 1: 核心筛选 Agent
	t1 := template.Must(template.New("ContextSelector").Parse(`
You are a Code Context Selector. Analyze the Intent and the Candidates.
Return the IDs of chunks that are strictly necessary to fulfill the intent.
Do not select chunks that are irrelevant.

<Important Files>
{{.ImportantFiles}}
</Important Files>

<Intent>
{{.Intent}}
</Intent>

<Candidates>
{{.Candidates}}
</Candidates>

When you have identified the necessary Chunk IDs, you must use the provided tool function to submit the result.
Do not reply with just a Markdown list.
`))

	// [NEW] Level 2.5: 负选择 Agent (The Judge)
	t2 := template.Must(template.New("NegativeSelector").Parse(`
You are a Senior Code Reviewer (The Judge).
We are modifying the "Core Functions" based on the Intent. To do this safely, we found some "Dependency Candidates".

Task: Determine which Dependencies we MUST read the "Implementation Body" of.
- If we only need to CALL a dependency, we DO NOT need its body (System will provide signature only) -> REJECT.
- If the dependency contains complex logic that might break, or needs modification -> KEEP.

<Intent>
{{.Intent}}
</Intent>

<Core Functions (Targets)>
{{.CoreSkeleton}}
</Core Functions>

<Dependency Candidates (To Review)>
{{.DepCandidates}}
</Dependency Candidates>

Return the IDs of dependencies we MUST Keep (Body). 
`))

	selAgent := agent.Create(t1).WithToolCallMutextRun().WithModels(llm.ModelDefault)
	negAgent := agent.Create(t2).WithToolCallMutextRun().WithModels(llm.ModelDefault)

	return &Selector{
		SelectionAgent:         selAgent,
		NegativeSelectionAgent: negAgent,
		PromotionThreshold:     0.5,
	}
}

// SelectRelevantChunks 执行 Diamond Selection (L1 -> L2 -> L2.5)
func (s *Selector) SelectRelevantChunks(intent string, model *llm.Model) (*SelectedContext, error) {
	fmt.Printf("🧠 Selecting Context for: %.50s...\n", intent)

	// 1. Level 0: 加载所有 Chunk (Lazy Load 优化点：这里暂时全量加载，后续可改向量检索)
	allChunksMap, err := storage.ChunkStorage.HGetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load chunks from storage: %w", err)
	}
	allChunks := lo.Values(allChunksMap)

	// 2. 准备 Level 1 候选列表
	var sb strings.Builder
	for _, c := range allChunks {
		skel := c.Skeleton
		if len(skel) > 400 {
			skel = skel[:400] + "..."
		}
		sb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, skel))
	}

	// 3. Level 1: 核心定位 (Targeting)
	var coreIDs []string
	keyedAgent := s.SelectionAgent.UseTools(llm.NewTool("PickChunks", "Select necessary code chunks (IDs)", func(res *SelectionResult) {
		coreIDs = res.SelectedIDs
	}))

	err = keyedAgent.Call(map[string]any{
		agent.UseModel:   model,
		"ImportantFiles": utils.WrapFilesInXML("ImportantFile", s.FilesMustInclude...),
		"Intent":         intent,
		"Candidates":     sb.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("L1 selection failed: %w", err)
	}

	// 4. Level 2: 依赖扩散 (Expansion)
	// 返回所有 1-Hop 依赖的 ID 集合
	allDependencyIDs := s.expandDependencies(coreIDs, allChunksMap)

	// 剔除 coreIDs 自身 (防止重复处理)
	allDependencyIDs = lo.Without(allDependencyIDs, coreIDs...)

	// 5. Level 2.5: 分类与负选择 (Pruning)
	var autoKeepIDs []string   // Structs/Interfaces -> 自动保留
	var reviewListIDs []string // Functions/Methods -> 需要审查

	for _, id := range allDependencyIDs {
		chunk, exists := allChunksMap[id]
		if !exists {
			continue
		}
		// 基于新版 models 常量进行判断
		switch chunk.Type {
		case models.ChunkTypeStruct, models.ChunkTypeInterface, models.ChunkTypeType, models.ChunkTypeClass:
			autoKeepIDs = append(autoKeepIDs, id)
		default:
			// Function, Method 默认为待审查
			reviewListIDs = append(reviewListIDs, id)
		}
	}

	// 执行负选择 Agent
	keptReviewIDs := s.runNegativeSelection(intent, coreIDs, reviewListIDs, allChunksMap, model)

	// 6. 组装最终集合
	finalIDSet := make(map[string]struct{})

	// A. Core Chunks (Body)
	for _, id := range coreIDs {
		finalIDSet[id] = struct{}{}
	}
	// B. Auto-Keep Types (Body)
	for _, id := range autoKeepIDs {
		finalIDSet[id] = struct{}{}
	}
	// C. Kept Logic (Body)
	for _, id := range keptReviewIDs {
		finalIDSet[id] = struct{}{}
	}

	// D. Pruned Logic (Skeleton Only) - 这是一个特殊集合
	// 被 ReviewList 包含 但 未被 Kept 包含的 ID
	prunedIDs := lo.Without(reviewListIDs, keptReviewIDs...)

	// ==========================================
	// 7. 密度计算与自动升格 (Scheme B)
	// ==========================================

	// 统计 Full Body 的 Chunk
	fileTotalCounts := make(map[string]int)
	fileSelectedCounts := make(map[string]int)

	for _, c := range allChunks {
		fileTotalCounts[c.FilePath]++
	}
	for id := range finalIDSet {
		if c, ok := allChunksMap[id]; ok {
			fileSelectedCounts[c.FilePath]++
		}
	}

	filesToPromote := make(map[string]bool)
	for filePath, selectedCount := range fileSelectedCounts {
		totalCount := fileTotalCounts[filePath]
		if totalCount == 0 {
			continue
		}
		ratio := float64(selectedCount) / float64(totalCount)
		if ratio >= s.PromotionThreshold || (totalCount == 1 && selectedCount == 1) {
			filesToPromote[filePath] = true
			fmt.Printf("📂 Auto-Promoting File (Density %.0f%%): %s\n", ratio*100, filePath)
		}
	}

	// 8. 构造输出结果
	result := &SelectedContext{
		Chunks:    make([]*models.Chunk, 0),
		FullFiles: make(map[string]string),
	}

	// 处理升格文件
	for filePath := range filesToPromote {
		content := utils.ReadFile(filePath)
		if content != "" {
			result.FullFiles[filePath] = content
		}
	}

	// 添加 Full Body Chunks (且未被升格)
	for id := range finalIDSet {
		chunk, ok := allChunksMap[id]
		if !ok || filesToPromote[chunk.FilePath] {
			continue
		}
		result.Chunks = append(result.Chunks, chunk)
	}

	// [核心策略] 添加 Pruned Chunks (Skeleton 降级)
	// 仅当文件未被升格时添加。
	// 关键：我们修改内存中 Chunk 副本的 Body 为 Skeleton，从而骗过 goal_runner
	for _, id := range prunedIDs {
		originalChunk, ok := allChunksMap[id]
		if !ok || filesToPromote[originalChunk.FilePath] {
			continue
		}

		// 复制一份，避免修改全局缓存
		prunedChunk := *originalChunk
		// 【降级操作】将 Body 替换为 Skeleton
		prunedChunk.Body = prunedChunk.Skeleton
		// 标记一下（可选，方便调试）
		// prunedChunk.Body = "// [Skeleton Reference Only]\n" + prunedChunk.Skeleton

		result.Chunks = append(result.Chunks, &prunedChunk)
	}

	fmt.Printf("✅ Selected: %d Full Files, %d Body Chunks, %d Skeleton Refs\n",
		len(result.FullFiles), len(finalIDSet)-len(result.FullFiles), len(prunedIDs)) // 估算打印
	return result, nil
}

// runNegativeSelection 执行 L2.5 审查
func (s *Selector) runNegativeSelection(intent string, coreIDs []string, candidates []string, allChunks map[string]*models.Chunk, model *llm.Model) []string {
	if len(candidates) == 0 {
		return nil
	}

	// 构造 Prompt 素材
	var coreSb strings.Builder
	for _, id := range coreIDs {
		if c, ok := allChunks[id]; ok {
			coreSb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, c.Skeleton))
		}
	}

	var candSb strings.Builder
	for _, id := range candidates {
		if c, ok := allChunks[id]; ok {
			candSb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, c.Skeleton))
		}
	}

	var keptIDs []string
	// 使用与 L1 相同的 SelectionResult 结构复用工具
	keyedAgent := s.NegativeSelectionAgent.UseTools(llm.NewTool("KeepDependencies", "List of dependency IDs to KEEP (Body)", func(res *SelectionResult) {
		keptIDs = res.SelectedIDs
	}))

	err := keyedAgent.Call(map[string]any{
		agent.UseModel:  model,
		"Intent":        intent,
		"CoreSkeleton":  coreSb.String(),
		"DepCandidates": candSb.String(),
	})

	if err != nil {
		fmt.Printf("⚠️ L2.5 Negative Selection failed: %v. Keeping all candidates safely.\n", err)
		return candidates // 降级策略：如果 LLM 失败，保留所有（宁滥勿缺）
	}

	fmt.Printf("📉 Negative Selection: Pruned %d/%d candidates.\n", len(candidates)-len(keptIDs), len(candidates))
	return keptIDs
}

// expandDependencies 查找所有 1-Hop 依赖 ID (L2)
func (s *Selector) expandDependencies(seeds []string, allChunks map[string]*models.Chunk) []string {
	uniqueSeeds := lo.Uniq(seeds)
	dependencySet := make(map[string]struct{})

	// 收集所有种子 Chunk 引用的符号
	var symbolsToQuery []string
	seenSymbols := make(map[string]bool)

	for _, id := range uniqueSeeds {
		chunk, ok := allChunks[id]
		if !ok {
			continue
		}
		for _, sym := range chunk.SymbolsReferenced {
			if len(sym) > 1 && !seenSymbols[sym] {
				symbolsToQuery = append(symbolsToQuery, sym)
				seenSymbols[sym] = true
			}
		}
	}

	// 批量查询反向索引
	if len(symbolsToQuery) > 0 {
		targetIDs, err := storage.Indexer.GetUnionLinks(symbolsToQuery)
		if err != nil {
			fmt.Printf("⚠️ Error fetching dependencies: %v\n", err)
		} else {
			for _, tid := range targetIDs {
				// 确保 ID 存在于当前代码库（防止脏数据）
				if _, exists := allChunks[tid]; exists {
					dependencySet[tid] = struct{}{}
				}
			}
		}
	}

	// 转换为 Slice 返回
	return lo.Keys(dependencySet)
}
