package workflow

import (
	"fmt"
	"text/template"

	"sysevov2/agent"
	"sysevov2/context"
	"sysevov2/editing" // 假设你的 ApplyModification 在这里
	"sysevov2/llm"
	"sysevov2/models"
)

type GoalRunner struct {
	Selector    *context.Selector
	EditorAgent *agent.Agent
}

var LLMToolApplyModification = llm.NewTool("ApplyModification", "Modify a code chunk", func(mod *models.CodeModification) {
	if err := editing.ApplyModification(mod); err != nil {
		fmt.Printf("❌ Edit Failed: %v\n", err)
	} else {
		fmt.Printf("✅ Applied: %s\n", mod.TargetChunkID)
	}
})

func NewRunner() *GoalRunner {
	t := template.Must(template.New("GoalEditor").Parse(`
You are a Senior Engineer. Achieve the Goal by modifying code chunks.
<Context>
{{.Context}}
</Context>

<Goal>
{{.Goal}}
</Goal>
`))

	// 创建 Editor Agent 并绑定 ApplyModification 工具
	editor := agent.Create(t).WithToolCallMutextRun().WithTools(LLMToolApplyModification)

	return &GoalRunner{
		Selector:    context.NewSelector(),
		EditorAgent: editor,
	}
}

func (r *GoalRunner) ExecuteGoal(goal string, localModel, cloudModel *llm.Model) error {
	// 1. 获取上下文
	chunks, err := r.Selector.SelectRelevantChunks(goal, localModel)
	if err != nil {
		return err
	}

	var contextStr string
	for _, c := range chunks {
		contextStr += fmt.Sprintf("// File: %s, Chunk: %s\n%s\n\n", c.FilePath, c.ID, c.Body)
	}

	// 2. 调用生成
	return r.EditorAgent.Call(map[string]any{
		agent.UseModel: cloudModel,
		"Goal":         goal,
		"Context":      contextStr,
	})
}
