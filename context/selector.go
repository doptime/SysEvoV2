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

// SelectedContext 封装最终的选择结果：包含零散的 Chunks 和被升级为全量的文件
type SelectedContext struct {
	Chunks    []*models.Chunk   // 零散的代码块
	FullFiles map[string]string // 路径 -> 文件内容 (被“升格”的文件)
}

type Selector struct {
	SelectionAgent   *agent.Agent
	FilesMustInclude []string
	// 升格阈值：如果一个文件中超过 50% 的 Chunk 被选中，读取全量文件
	PromotionThreshold float64
}

type SelectionResult struct {
	SelectedIDs []string `description:"The list of Chunk IDs that are strictly necessary."`
}

func NewSelector() *Selector {
	t := template.Must(template.New("ContextSelector").Parse(`
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

	selAgent := agent.Create(t).WithToolCallMutextRun().WithModels(llm.ModelDefault)

	return &Selector{
		SelectionAgent:     selAgent,
		PromotionThreshold: 0.5, // 设定为 50%
	}
}

// SelectRelevantChunks 返回结构化上下文，而非简单的 Slice
func (s *Selector) SelectRelevantChunks(intent string, model *llm.Model) (*SelectedContext, error) {
	fmt.Printf("🧠 Selecting Context for: %.50s...\n", intent)

	// 1. 加载所有 Chunk
	allChunksMap, err := storage.ChunkStorage.HGetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load chunks from storage: %w", err)
	}
	allChunks := lo.Values(allChunksMap)

	// 2. 构建候选列表 (Skeleton View)
	var sb strings.Builder
	for _, c := range allChunks {
		skel := c.Skeleton
		if len(skel) > 400 {
			skel = skel[:400] + "..."
		}
		sb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, skel))
	}

	// 3. Agent 筛选 (Level 1)
	var finalIDs []string
	keyedAgent := s.SelectionAgent.UseTools(llm.NewTool("PickChunks", "Select necessary code chunks (IDs)", func(res *SelectionResult) {
		finalIDs = res.SelectedIDs
	}))

	err = keyedAgent.Call(map[string]any{
		agent.UseModel:   model,
		"ImportantFiles": utils.WrapFilesInXML("ImportantFile", s.FilesMustInclude...),
		"Intent":         intent,
		"Candidates":     sb.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("agent call failed: %w", err)
	}

	// 4. 依赖扩散 (Level 2)
	finalIDSet := s.expandDependencies(finalIDs, allChunksMap)

	// ==========================================
	// 5. 密度计算与自动升格 (Scheme B Implementation)
	// ==========================================

	// A. 统计每个文件的总 Chunk 数
	fileTotalCounts := make(map[string]int)
	for _, c := range allChunks {
		fileTotalCounts[c.FilePath]++
	}

	// B. 统计每个文件被选中的 Chunk 数
	fileSelectedCounts := make(map[string]int)
	for id := range finalIDSet {
		if c, ok := allChunksMap[id]; ok {
			fileSelectedCounts[c.FilePath]++
		}
	}

	// C. 判定哪些文件需要升格
	filesToPromote := make(map[string]bool)
	for filePath, selectedCount := range fileSelectedCounts {
		totalCount := fileTotalCounts[filePath]
		if totalCount == 0 {
			continue
		}

		ratio := float64(selectedCount) / float64(totalCount)
		// 规则：选中比例 > 阈值，或者文件极其微小（只有1个Chunk且被选中）
		if ratio >= s.PromotionThreshold || (totalCount == 1 && selectedCount == 1) {
			filesToPromote[filePath] = true
			fmt.Printf("📂 Auto-Promoting File (Density %.0f%%): %s\n", ratio*100, filePath)
		}
	}

	// D. 组装最终结果
	result := &SelectedContext{
		Chunks:    make([]*models.Chunk, 0),
		FullFiles: make(map[string]string),
	}

	// 处理全量文件
	for filePath := range filesToPromote {
		content := utils.ReadFile(filePath)
		if content != "" {
			result.FullFiles[filePath] = content
		}
	}

	// 处理剩余 Chunk (如果所属文件已被升格，则跳过该 Chunk)
	for id := range finalIDSet {
		chunk, ok := allChunksMap[id]
		if !ok {
			continue
		}
		// 只有当文件不在 FullFiles 列表时，才添加 Chunk
		if !filesToPromote[chunk.FilePath] {
			result.Chunks = append(result.Chunks, chunk)
		}
	}

	fmt.Printf("✅ Selected: %d Full Files, %d Individual Chunks\n", len(result.FullFiles), len(result.Chunks))
	return result, nil
}

// expandDependencies 保持不变...
func (s *Selector) expandDependencies(seeds []string, allChunks map[string]*models.Chunk) map[string]struct{} {
	// ... (保持原有代码不变)
	resultSet := make(map[string]struct{})
	uniqueSymbols := make(map[string]struct{})

	for _, id := range seeds {
		resultSet[id] = struct{}{}
		chunk, ok := allChunks[id]
		if !ok {
			continue
		}
		for _, refSymbol := range chunk.SymbolsReferenced {
			if len(refSymbol) > 1 {
				uniqueSymbols[refSymbol] = struct{}{}
			}
		}
	}

	symbolList := make([]string, 0, len(uniqueSymbols))
	for sym := range uniqueSymbols {
		symbolList = append(symbolList, sym)
	}

	if len(symbolList) > 0 {
		targetIDs, err := storage.Indexer.GetUnionLinks(symbolList)
		if err != nil {
			fmt.Printf("⚠️ Error fetching dependencies: %v\n", err)
		} else {
			for _, tid := range targetIDs {
				if _, exists := allChunks[tid]; exists {
					resultSet[tid] = struct{}{}
				}
			}
		}
	}
	return resultSet
}
