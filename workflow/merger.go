package workflow

import (
	"fmt"
	"text/template"

	"sysevov2/agent"
	"sysevov2/editing"
	"sysevov2/llm"
	"sysevov2/models"
	"sysevov2/utils"
)

// Merger 负责将非结构化的云端建议合并到本地代码库
type Merger struct {
	MergerAgent                      *agent.Agent
	LocalFileToSaveSelectedContextTo string
}

func (m *Merger) WithLocalModel(model *llm.Model) *Merger {
	m.MergerAgent.Models = []*llm.Model{model}
	return m
}

func (m *Merger) WithContextFile(filePath string) *Merger {
	m.LocalFileToSaveSelectedContextTo = filePath
	return m
}
func (m *Merger) GetContextFile(filePath string) string {
	if m.LocalFileToSaveSelectedContextTo != "" {
		return m.LocalFileToSaveSelectedContextTo
	}
	return "GoalWithContext.txt"
}

func NewMerger() *Merger {
	// 专门为合并逻辑设计的 Prompt
	t := template.Must(template.New("CodeMerger").Parse(`
你是一个精确的代码合并专家。
你的任务是根据 <CloudResponse> 中的建议，将修改应用到本地代码。

你需要根据 <Context> 中的现有代码结构，使用 'ApplyModification' 工具提交变更。
请确保：
1. TargetChunkID 必须与 Context 中提供的标识符完全匹配。
2. NewContent 必须是完整的 AST 节点代码（包含函数签名和代码体）。
3. 严禁修改没有提到的代码。

<Context>
{{.Context}}
</Context>

<CloudResponse>
{{.CloudResponse}}
</CloudResponse>
`))

	// 创建 Merger Agent 并绑定已有的修改工具
	// 注意：这里复用了 GoalRunner 中定义的 LLMToolApplyModification 逻辑
	mergerAgent := agent.Create(t).WithToolCallMutextRun().
		UseTools(llm.NewTool("ApplyModification", "Apply code modification", func(mod *models.CodeModification) {
			if err := editing.ApplyModification(mod); err != nil {
				fmt.Printf("❌ Merger failed to apply: %v\n", err)
			} else {
				fmt.Printf("✅ Merger applied change to: %s\n", mod.TargetChunkID)
			}
		})).WithModels(llm.ModelDefault)

	return &Merger{
		MergerAgent: mergerAgent,
	}
}

// RunManualMerge 执行合并流程
// contextFilePath: 之前生成的 GoalWithContext.txt 路径
// cloudResponsePath: 从剪切板复制，请确保内容已经位于接切板
func (m *Merger) RunManualMerge() error {
	// 1. 读取上下文和云端回复
	ctxBytes := utils.ReadFile(m.GetContextFile(""))

	cloudBytes := utils.TextFromClipboard()

	fmt.Println("🧠 Local LLM is parsing cloud response and applying edits...")

	// 2. 调用本地 Agent 解析并触发 ToolCall
	err := m.MergerAgent.Call(map[string]any{
		"Context":       string(ctxBytes),
		"CloudResponse": string(cloudBytes),
	})
	return err
}
