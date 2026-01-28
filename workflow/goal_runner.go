package workflow

import (
	"fmt"
	"text/template"

	"sysevov2/agent"
	"sysevov2/context"
	"sysevov2/editing"
	"sysevov2/llm"
	"sysevov2/models"
	"sysevov2/utils"
)

type GoalRunner struct {
	Selector    *context.Selector
	EditorAgent *agent.Agent
}

func (g *GoalRunner) WithFilesMustInclude(files ...string) *GoalRunner {
	g.Selector.FilesMustInclude = append(g.Selector.FilesMustInclude, files...)
	return g
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

	editor := agent.Create(t).WithToolCallMutextRun().UseTools(LLMToolApplyModification)

	return &GoalRunner{
		Selector:    context.NewSelector(),
		EditorAgent: editor,
	}
}

// ExportContextToFile 辅助调试方法
func (r *GoalRunner) ExportContextToFile(goal string, contextStr string) {
	finalContent := fmt.Sprintf("<Goal>\n%s\n</Goal>\n\n%s", goal, contextStr)
	utils.StringToFile("GoalWithContext.txt", finalContent)
}

func (r *GoalRunner) ExecuteGoal(goal string, contextSelectModel, CodeImproveModel *llm.Model) error {
	// 1. 获取上下文 (返回的是 SelectedContext 结构体)
	selectedCtx, err := r.Selector.SelectRelevantChunks(goal, contextSelectModel)
	if err != nil {
		return err
	}

	var contextStr string

	// A. 必须包含的重要文件 (README 等)
	for _, file := range r.Selector.FilesMustInclude {
		// 防止与自动升格的文件重复，这里可以加个判断，或者直接覆盖
		// 假设 FilesMustInclude 优先级最高
		if _, alreadyPromoted := selectedCtx.FullFiles[file]; !alreadyPromoted {
			contextStr += fmt.Sprintf("<File name=\"%s\"> \n%s </File>\n\n", file, utils.ReadFile(file))
		}
	}

	// B. 自动升格的全量文件 (Scheme B Result)
	for path, content := range selectedCtx.FullFiles {
		contextStr += fmt.Sprintf("<File name=\"%s\"> \n%s </File>\n\n", path, content)
	}

	// C. 剩余的零散 Chunks
	for _, c := range selectedCtx.Chunks {
		contextStr += fmt.Sprintf("<Chunk id=\"%s\"> \n%s </Chunk>\n\n", c.ID, c.Body)
	}

	// 保存到本地以便调试
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
