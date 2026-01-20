package context

import (
	"encoding/json"
	"fmt"
	"strings"

	"sysevov2/agent"
	"sysevov2/models"
	"sysevov2/storage"

	"github.com/samber/lo"
)

type Selector struct {
	Agent *agent.Agent // 复用旧版 Agent 架构
}

func NewSelector(ag *agent.Agent) *Selector {
	return &Selector{Agent: ag}
}

// SelectRelevantChunks 根据用户意图选择最小完备上下文
func (s *Selector) SelectRelevantChunks(intent string) ([]*models.Chunk, error) {
	fmt.Printf("🧠 Selecting Context for: %.50s...\n", intent)

	// Step 1: 加载所有骨架 (假设项目规模适中，全量加载骨架)
	allChunksMap, err := storage.ChunkStorage.HGetAll()
	if err != nil {
		return nil, err
	}
	allChunks := lo.Values(allChunksMap)

	// Step 2: LLM 初筛 (Level 1)
	selectedIDs, err := s.llmSelectIDs(intent, allChunks)
	if err != nil {
		return nil, err
	}
	fmt.Printf("🎯 LLM Selected: %d chunks\n", len(selectedIDs))

	// Step 3: 依赖扩散 (Level 2 - 查脏符号表)
	finalIDSet := s.expandDependencies(selectedIDs, allChunksMap)
	fmt.Printf("🕸️ Expanded to: %d chunks\n", len(finalIDSet))

	// Step 4: 组装结果
	result := make([]*models.Chunk, 0, len(finalIDSet))
	for id := range finalIDSet {
		if chunk, ok := allChunksMap[id]; ok {
			result = append(result, chunk)
		}
	}
	return result, nil
}

// llmSelectIDs 调用本地模型进行骨架筛选
func (s *Selector) llmSelectIDs(intent string, candidates []*models.Chunk) ([]string, error) {
	var sb strings.Builder
	for i, c := range candidates {
		// 截断 Skeleton 以节省 Token
		skel := c.Skeleton
		if len(skel) > 400 {
			skel = skel[:400] + "..."
		}
		sb.WriteString(fmt.Sprintf("[%d] %s\n%s\n---\n", i, c.ID, skel))
	}

	sysPrompt := `You are a Code Context Selector.
Analyze the INTENT and the CANDIDATES.
Return a JSON list of Chunk IDs that are strictly necessary to fulfill the intent.
Output Format: ["main.go:User", "utils.go:Hash"]`

	// 使用 agent.Call (旧实现)
	params := map[string]any{
		"SystemPrompt":          sysPrompt,
		"Intent":                intent,
		"Candidates":            sb.String(),
		agent.UseModel:          s.Agent.Models[0], // 假设第一个是本地小模型
		agent.UseContentToParam: "Result",
	}

	if err := s.Agent.Call(params); err != nil {
		return nil, err
	}

	rawJSON, _ := params["Result"].(string)
	return parseJSONList(rawJSON)
}

// expandDependencies 查表扩散
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
			// 查索引：谁定义了这个符号？
			targetIDs, _ := storage.Indexer.GetSymbolLinks(refSymbol)
			for _, tid := range targetIDs {
				if tid != id {
					// 确保目标在当前项目中
					if _, exists := allChunks[tid]; exists {
						resultSet[tid] = struct{}{}
					}
				}
			}
		}
	}
	return resultSet
}

func parseJSONList(s string) ([]string, error) {
	// 简单的 JSON 提取清洗逻辑
	s = strings.TrimSpace(s)
	start := strings.Index(s, "[")
	end := strings.LastIndex(s, "]")
	if start == -1 || end == -1 {
		return nil, fmt.Errorf("no json list found")
	}
	var res []string
	err := json.Unmarshal([]byte(s[start:end+1]), &res)
	return res, err
}
