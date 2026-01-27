package workflow

import (
	"fmt"
	"text/template"

	"sysevov2/agent"
	"sysevov2/context"
	"sysevov2/editing" // 假设你的 ApplyModification 在这里
	"sysevov2/llm"
	"sysevov2/models"
	"sysevov2/utils"
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
	editor := agent.Create(t).WithToolCallMutextRun().UseTools(LLMToolApplyModification)

	return &GoalRunner{
		Selector:    context.NewSelector(),
		EditorAgent: editor,
	}
}

func (r *GoalRunner) ExportContextToFile(goal string, contextString string) {
	var contextStr string
	contextStr += fmt.Sprintf("<Goal>\n %s\n</Goal>\n\n", goal)
	for _, file := range r.Selector.FilesMustInclude {
		contextStr += fmt.Sprintf("// Important File: %s\n", file)

	}
	contextStr += contextString

	utils.StringToFile("GoalWithContext.txt", contextStr)
}
func (r *GoalRunner) ExecuteGoal(goal string, contextSelectModel, CodeImproveModel *llm.Model) error {
	// 1. 获取上下文
	chunks, err := r.Selector.SelectRelevantChunks(goal, contextSelectModel)
	if err != nil {
		return err
	}

	var contextStr string
	for _, file := range r.Selector.FilesMustInclude {
		contextStr += fmt.Sprintf("<File name=\"%s\"> \n%s </File>\n\n", file, utils.ReadFile(file))
	}

	for _, c := range chunks {
		contextStr += fmt.Sprintf("<Chunk id=\"%s\"> \n%s </Chunk>\n\n", c.ID, c.Body)
	}

	r.ExportContextToFile(goal, contextStr)

	if CodeImproveModel == nil {
		return nil
	}
	// 2. 调用生成
	return r.EditorAgent.Call(map[string]any{
		agent.UseModel: CodeImproveModel,
		"Goal":         goal,
		"Context":      contextStr,
	})
}
