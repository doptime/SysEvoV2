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

// SelectionResult 定义 LLM 输出的结构体，对应 Tool 参数
type SelectionResult struct {
	SelectedIDs []string `description:"The list of Chunk IDs that are strictly necessary."`
}

func NewSelector() *Selector {
	// 初始化 Agent 模板
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

	// 创建基础 Agent
	selAgent := agent.Create(t).WithToolCallMutextRun().WithModels(llm.ModelDefault)

	return &Selector{
		SelectionAgent: selAgent,
	}
}

func (s *Selector) SelectRelevantChunks(intent string, model *llm.Model) ([]*models.Chunk, error) {
	fmt.Printf("🧠 Selecting Context for: %.50s...\n", intent)

	// 1. 加载所有 Chunk (Level 0)
	allChunksMap, err := storage.ChunkStorage.HGetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load chunks from storage: %w", err)
	}
	allChunks := lo.Values(allChunksMap)

	// 2. 构建候选列表 (Skeleton View)
	// 注意：如果项目极大，这里可能需要根据 Embeddings 先做一次粗筛，目前全量放入上下文
	var sb strings.Builder
	for _, c := range allChunks {
		skel := c.Skeleton
		// 截断过长的骨架以节省 Token
		if len(skel) > 400 {
			skel = skel[:400] + "..."
		}
		sb.WriteString(fmt.Sprintf("ID: %s\n%s\n---\n", c.ID, skel))
	}

	// 3. 配置工具与回调 (Level 1 Selection)
	// 使用闭包捕获 Agent 选中的 ID
	var finalIDs []string

	// 注意：这里假设 UseTools 返回一个新的 Agent 实例或不仅限于单次调用
	// 为了线程安全，建议每次请求克隆 Agent，或者确保 UseTools 是请求隔离的
	// 这里沿用你的现有模式
	keyedAgent := s.SelectionAgent.UseTools(llm.NewTool("PickChunks", "Select necessary code chunks (IDs)", func(res *SelectionResult) {
		finalIDs = res.SelectedIDs
	}))

	// 4. 调用 LLM
	err = keyedAgent.Call(map[string]any{
		agent.UseModel:   model,
		"ImportantFiles": utils.TextFromFiles("ImportantFile", s.FilesMustInclude...),
		"Intent":         intent,
		"Candidates":     sb.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("agent call failed: %w", err)
	}

	// 5. 脏扩散 (Level 2 Dependency Expansion)
	// 基于 Level 1 选中的 Chunk，查找它们引用的符号是由谁定义的
	finalIDSet := s.expandDependencies(finalIDs, allChunksMap)

	// 6. 组装最终结果
	result := make([]*models.Chunk, 0, len(finalIDSet))
	for id := range finalIDSet {
		if chunk, ok := allChunksMap[id]; ok {
			result = append(result, chunk)
		}
	}

	fmt.Printf("✅ Selected %d chunks (Seeds: %d, Expanded: %d)\n", len(result), len(finalIDs), len(result)-len(finalIDs))
	return result, nil
}

// expandDependencies 执行 1-Hop 依赖扩散
func (s *Selector) expandDependencies(seeds []string, allChunks map[string]*models.Chunk) map[string]struct{} {
	resultSet := make(map[string]struct{})

	// 1. 初始化结果集，并收集所有种子 Chunk 引用的符号
	uniqueSymbols := make(map[string]struct{})

	for _, id := range seeds {
		// 种子本身必须包含在结果中
		resultSet[id] = struct{}{}

		chunk, ok := allChunks[id]
		if !ok {
			continue
		}

		// 收集该 Chunk 引用的符号 (Level 1 -> 引用 -> Level 2 定义)
		for _, refSymbol := range chunk.SymbolsReferenced {
			// 过滤掉单字符或常见干扰项
			if len(refSymbol) > 1 {
				uniqueSymbols[refSymbol] = struct{}{}
			}
		}
	}

	// 转换 Set 为 Slice
	symbolList := make([]string, 0, len(uniqueSymbols))
	for sym := range uniqueSymbols {
		symbolList = append(symbolList, sym)
	}

	// 2. 【核心优化】批量查询反向索引
	// 调用 index_client.go 中的 GetUnionLinks (使用 Redis SUNION)
	if len(symbolList) > 0 {
		targetIDs, err := storage.Indexer.GetUnionLinks(symbolList)
		if err != nil {
			fmt.Printf("⚠️ Error fetching dependencies: %v\n", err)
			// 出错时降级：仅返回种子，不中断流程
		} else {
			// 3. 将查找到的定义者加入结果集
			for _, tid := range targetIDs {
				// 必须检查 tid 是否在当前加载的 allChunks 中
				// (防止引用了已被删除的文件或未加载的模块)
				if _, exists := allChunks[tid]; exists {
					resultSet[tid] = struct{}{}
				}
			}
		}
	}

	return resultSet
}
