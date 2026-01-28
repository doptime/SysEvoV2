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
	NegativeSelectionAgent *agent.Agent
	FilesMustInclude       []string
	PromotionThreshold     float64
}

type SelectionResult struct {
	SelectedIDs []string `description:"The list of Chunk IDs that are strictly necessary."`
}

func NewSelector() *Selector {
	// L1: 核心筛选 (Targeting)
	t1 := template.Must(template.New("ContextSelector").Parse(`
You are a Code Context Selector. Analyze the Intent and the Candidates.
Return the IDs of chunks that are strictly necessary to fulfill the intent.

<Important Files>
{{.ImportantFiles}}
</Important Files>

<Intent>
{{.Intent}}
</Intent>

<Candidates>
{{.Candidates}}
</Candidates>

Return the Chunk IDs that must be modified or read in detail.
`))

	// L2.5: 负选择 (Pruning)
	t2 := template.Must(template.New("NegativeSelector").Parse(`
You are a Senior Code Reviewer (The Judge).
We are modifying "Core Functions" to fulfill an Intent. We found some "Dependencies".

Task: Decide which Dependencies need their IMPLEMENTATION (Body) vs which only need their SIGNATURE (Skeleton).

<Intent>
{{.Intent}}
</Intent>

<Core Functions>
{{.CoreSkeleton}}
</Core Functions>

<Dependency Candidates>
{{.DepCandidates}}
</Dependency Candidates>

Return the IDs of dependencies where the BODY is essential (e.g., complex logic, potential side effects, or needs modification).
If only the signature is needed for calling, DO NOT select it.
`))

	selAgent := agent.Create(t1).WithToolCallMutextRun().WithModels(llm.ModelDefault)
	negAgent := agent.Create(t2).WithToolCallMutextRun().WithModels(llm.ModelDefault)

	return &Selector{
		SelectionAgent:         selAgent,
		NegativeSelectionAgent: negAgent,
		PromotionThreshold:     0.5,
	}
}

// SelectRelevantChunks 执行 Diamond Selection
func (s *Selector) SelectRelevantChunks(intent string, model *llm.Model) (*SelectedContext, error) {
	fmt.Printf("🧠 Selecting Context for: %.50s...\n", intent)

	// 1. 加载所有 Chunk
	allChunksMap, err := storage.ChunkStorage.HGetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load chunks: %w", err)
	}
	allChunks := lo.Values(allChunksMap)

	// 2. 构建 L1 候选列表 (含过载保护)
	var sb strings.Builder
	const maxCandidateTokens = 40000 // 预留 Buffer 给 System Prompt 和 ToolDef
	estimatedTokens := 0

	for _, c := range allChunks {
		// 截断过长的 Skeleton，防止单体过大
		skel := c.Skeleton
		if len(skel) > 300 {
			skel = skel[:300] + "..."
		}
		entry := fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, skel)

		// 简单估算 Token (Char/4)
		tokenCount := len(entry) / 4
		if estimatedTokens+tokenCount > maxCandidateTokens {
			sb.WriteString("\n... (Candidates truncated due to context limit) ...\n")
			break
		}
		sb.WriteString(entry)
		estimatedTokens += tokenCount
	}

	// 3. Level 1: 核心定位
	var coreIDs []string
	keyedAgent := s.SelectionAgent.UseTools(llm.NewTool("PickChunks", "Select necessary code chunks", func(res *SelectionResult) {
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

	// 4. Level 2: 依赖扩散 + 【修复1】宿主结构体补全
	// 先找出所有 1-Hop 依赖
	depIDs := s.expandDependencies(coreIDs, allChunksMap)
	// 再找出所有 Method 的宿主 Struct (防止“孤儿方法”)
	hostStructIDs := s.ensureStructDefinitions(coreIDs, allChunksMap)

	// 合并并去重，同时移除 coreIDs 自身
	allExpandedIDs := lo.Uniq(append(depIDs, hostStructIDs...))
	allExpandedIDs = lo.Without(allExpandedIDs, coreIDs...)

	// 5. Level 2.5: 分类与负选择
	var autoKeepIDs []string   // Structs/Interfaces
	var reviewListIDs []string // Functions/Methods

	for _, id := range allExpandedIDs {
		chunk, exists := allChunksMap[id]
		if !exists {
			continue
		}
		// 使用 models 常量判断
		switch chunk.Type {
		case models.ChunkTypeStruct, models.ChunkTypeInterface, models.ChunkTypeType, models.ChunkTypeClass:
			autoKeepIDs = append(autoKeepIDs, id)
		default:
			reviewListIDs = append(reviewListIDs, id)
		}
	}

	// 执行负选择 Agent
	keptReviewIDs := s.runNegativeSelection(intent, coreIDs, reviewListIDs, allChunksMap, model)

	// 6. 组装最终集合 (ID Set)
	finalIDSet := make(map[string]struct{})

	// A. Core (Body)
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

	// D. Pruned (Skeleton)
	prunedIDs := lo.Without(reviewListIDs, keptReviewIDs...)

	// 7. 密度计算与自动升格
	fileTotalCounts := make(map[string]int)
	fileSelectedCounts := make(map[string]int)

	for _, c := range allChunks {
		fileTotalCounts[c.FilePath]++
	}
	// 注意：只统计 Full Body 的命中率，Pruned Skeleton 不计入升格权重
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

	// 添加 Body Chunks
	for id := range finalIDSet {
		chunk, ok := allChunksMap[id]
		if !ok || filesToPromote[chunk.FilePath] {
			continue
		}
		result.Chunks = append(result.Chunks, chunk)
	}

	// 添加 Pruned Chunks (Skeleton 降级)
	for _, id := range prunedIDs {
		originalChunk, ok := allChunksMap[id]
		if !ok || filesToPromote[originalChunk.FilePath] {
			continue
		}

		// 【修复2】显式标记 Read-Only，防止 LLM 误修改
		prunedChunk := *originalChunk
		prunedChunk.Body = fmt.Sprintf("// [READ-ONLY REFERENCE] Signature Only\n// DO NOT MODIFY THIS CHUNK\n%s", prunedChunk.Skeleton)

		result.Chunks = append(result.Chunks, &prunedChunk)
	}

	fmt.Printf("✅ Selected: %d Files, %d Body Chunks, %d Skeletons\n",
		len(result.FullFiles), len(finalIDSet)-len(result.FullFiles), len(prunedIDs))
	return result, nil
}

// ensureStructDefinitions 【核心修复】防止 Method 选中但 Struct 没选中
func (s *Selector) ensureStructDefinitions(methodIDs []string, allChunks map[string]*models.Chunk) []string {
	var structIDs []string
	for _, id := range methodIDs {
		// 假设 ID 格式: "path/to/file.go:User.Save"
		// 尝试推导: "path/to/file.go:User"
		parts := strings.Split(id, ":")
		if len(parts) != 2 {
			continue
		}

		path, name := parts[0], parts[1]
		if strings.Contains(name, ".") {
			structName := strings.Split(name, ".")[0]
			potentialStructID := fmt.Sprintf("%s:%s", path, structName)

			// 检查该 ID 是否存在且是 Struct 类型
			if chunk, ok := allChunks[potentialStructID]; ok {
				if chunk.Type == models.ChunkTypeStruct || chunk.Type == models.ChunkTypeInterface {
					structIDs = append(structIDs, potentialStructID)
				}
			}
		}
	}
	return structIDs
}

func (s *Selector) runNegativeSelection(intent string, coreIDs []string, candidates []string, allChunks map[string]*models.Chunk, model *llm.Model) []string {
	if len(candidates) == 0 {
		return nil
	}

	// 构建素材 (Skeleton Only)
	var coreSb, candSb strings.Builder
	for _, id := range coreIDs {
		if c, ok := allChunks[id]; ok {
			coreSb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, c.Skeleton))
		}
	}
	for _, id := range candidates {
		if c, ok := allChunks[id]; ok {
			candSb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, c.Skeleton))
		}
	}

	var keptIDs []string
	keyedAgent := s.NegativeSelectionAgent.UseTools(llm.NewTool("KeepDependencies", "List of dependency IDs to KEEP", func(res *SelectionResult) {
		keptIDs = res.SelectedIDs
	}))

	err := keyedAgent.Call(map[string]any{
		agent.UseModel:  model,
		"Intent":        intent,
		"CoreSkeleton":  coreSb.String(),
		"DepCandidates": candSb.String(),
	})

	if err != nil {
		fmt.Printf("⚠️ Negative Selection failed: %v. Safe fallback: keeping all.\n", err)
		return candidates
	}
	return keptIDs
}

func (s *Selector) expandDependencies(seeds []string, allChunks map[string]*models.Chunk) []string {
	uniqueSeeds := lo.Uniq(seeds)
	dependencySet := make(map[string]struct{})
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

	if len(symbolsToQuery) > 0 {
		targetIDs, err := storage.Indexer.GetUnionLinks(symbolsToQuery)
		if err != nil {
			fmt.Printf("⚠️ Error fetching dependencies: %v\n", err)
		} else {
			for _, tid := range targetIDs {
				if _, exists := allChunks[tid]; exists {
					dependencySet[tid] = struct{}{}
				}
			}
		}
	}
	return lo.Keys(dependencySet)
}
