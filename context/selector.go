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

type Selector struct {
	// 使用模板定义的 Agent
	SelectionAgent   *agent.Agent
	FilesMustInclude []string
}

// 定义 LLM 输出的结构体体，对应 Tool 参数
type SelectionResult struct {
	SelectedIDs []string `description:"The list of Chunk IDs that are strictly necessary."`
}

func NewSelector() *Selector {
	// 按照你提供的用法：agent.Create + template
	t := template.Must(template.New("ContextSelector").Parse(`
You are a Code Context Selector. Analyze the Intent and the Candidates.
Return the IDs of chunks that are necessary to fulfill the intent.

<Important Files>
{{.ImportantFiles}}
</Important Files>

<Intent>
{{.Intent}}
</Intent>

<Candidates>
{{.Candidates}}
</Candidates>

当你确定了需要选择的 Chunk ID 后，必须使用提供的工具函数提交结果。严禁仅以 Markdown 列表形式回复。
`))

	selAgent := agent.Create(t).WithToolCallMutextRun().WithModels(llm.ModelDefault)

	return &Selector{
		SelectionAgent: selAgent,
	}
}

func (s *Selector) SelectRelevantChunks(intent string, model *llm.Model) ([]*models.Chunk, error) {
	fmt.Printf("🧠 Selecting Context for: %.50s...\n", intent)

	allChunksMap, _ := storage.ChunkStorage.HGetAll()
	allChunks := lo.Values(allChunksMap)

	var sb strings.Builder
	for _, c := range allChunks {
		skel := c.Skeleton
		if len(skel) > 400 {
			skel = skel[:400] + "..."
		}
		sb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, skel))
	}

	// 核心：使用闭包捕获选中的 ID
	var finalIDs []string
	s.SelectionAgent = s.SelectionAgent.UseTools(llm.NewTool("PickChunks", "Select necessary code chunks (IDs)", func(res *SelectionResult) {
		finalIDs = res.SelectedIDs
	}))

	// 调用 Agent
	err := s.SelectionAgent.Call(map[string]any{
		agent.UseModel:   model,
		"ImportantFiles": utils.TextFromFiles("ImportantFile", s.FilesMustInclude...),
		"Intent":         intent,
		"Candidates":     sb.String(),
	})
	if err != nil {
		return nil, err
	}

	// 脏扩散 (Level 2)
	finalIDSet := s.expandDependencies(finalIDs, allChunksMap)

	result := make([]*models.Chunk, 0)
	for id := range finalIDSet {
		if chunk, ok := allChunksMap[id]; ok {
			result = append(result, chunk)
		}
	}
	return result, nil
}

func (s *Selector) expandDependencies(seeds []string, allChunks map[string]*models.Chunk) map[string]struct{} {
	resultSet := make(map[string]struct{})

	// 1. 初始化结果集，并收集所有需要查询的符号
	uniqueSymbols := make(map[string]struct{}) // 用于符号去重

	for _, id := range seeds {
		resultSet[id] = struct{}{} // 将种子自身加入结果

		chunk, ok := allChunks[id]
		if !ok {
			continue
		}

		// 收集该 Chunk 引用的所有符号
		for _, refSymbol := range chunk.SymbolsReferenced {
			// 简单的过滤：忽略过短的符号或特定内置符号（可选）
			if len(refSymbol) > 1 {
				uniqueSymbols[refSymbol] = struct{}{}
			}
		}
	}

	// 将去重后的符号转为切片
	symbolList := make([]string, 0, len(uniqueSymbols))
	for sym := range uniqueSymbols {
		symbolList = append(symbolList, sym)
	}

	// 2. 【核心优化】使用 SUNION 一次性获取所有依赖的 ChunkID
	if len(symbolList) > 0 {
		targetIDs, err := storage.Indexer.GetUnionLinks(symbolList)
		if err != nil {
			fmt.Printf("Error fetching dependencies: %v\n", err)
			// 出错时降级：不扩散，或者记录日志
		} else {
			// 3. 将存在的 Chunk 加入结果集
			for _, tid := range targetIDs {
				// 必须检查 tid 是否在当前加载的 allChunks 中（防止引用了已被删除的文件）
				if _, exists := allChunks[tid]; exists {
					resultSet[tid] = struct{}{}
				}
			}
		}
	}

	return resultSet
}
