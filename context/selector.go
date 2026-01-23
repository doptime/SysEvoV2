package context

import (
	"fmt"
	"strings"
	"text/template"

	"sysevov2/agent"
	"sysevov2/llm"
	"sysevov2/models"
	"sysevov2/storage"

	"github.com/samber/lo"
)

type Selector struct {
	// 使用模板定义的 Agent
	SelectionAgent *agent.Agent
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

<Intent>
{{.Intent}}
</Intent>

<Candidates>
{{.Candidates}}
</Candidates>
`))

	selAgent := agent.Create(t).WithToolCallMutextRun()

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
	s.SelectionAgent.WithTools(llm.NewTool("PickChunks", "Select necessary code chunks", func(res *SelectionResult) {
		finalIDs = res.SelectedIDs
	}))

	// 调用 Agent
	err := s.SelectionAgent.Call(map[string]any{
		agent.UseModel: model,
		"Intent":       intent,
		"Candidates":   sb.String(),
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
	for _, id := range seeds {
		resultSet[id] = struct{}{}
	}

	for _, id := range seeds {
		chunk, ok := allChunks[id]
		if !ok {
			continue
		}
		for _, refSymbol := range chunk.SymbolsReferenced {
			targetIDs, _ := storage.Indexer.GetSymbolLinks(refSymbol)
			for _, tid := range targetIDs {
				if _, exists := allChunks[tid]; exists {
					resultSet[tid] = struct{}{}
				}
			}
		}
	}
	return resultSet
}
