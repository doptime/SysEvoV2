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
	// [Upgraded Prompt] 增加了对上下文结构的解释和防御性指令
	t := template.Must(template.New("GoalEditor").Parse(`
You are a Senior Engineer. Your task is to achieve the Goal by modifying the provided Code Context.

<ContextStructure>
The context consists of:
1. <File>: Full content of files (Auto-Promoted or Must-Include).
2. <Chunk>: Isolated code blocks.
   - Some chunks contain full implementation (Body).
   - Some chunks are marked as [READ-ONLY REFERENCE]. These contain only signatures (Skeleton).
</ContextStructure>

<Rules>
1. **Targeting**: You can modify any <Chunk> or <File> that is NOT marked as Read-Only.
2. **Read-Only**: Do NOT attempt to implement or modify chunks marked as [READ-ONLY REFERENCE]. They are provided only for context (e.g., to see available methods).
3. **completeness**: When modifying a Chunk, you must provide the *complete* new AST node content (Header + Body).
4. **No Hallucination**: Do not use line numbers. Use 'TargetChunkID' strictly from the context.
</Rules>

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
		// 防止与自动升格的文件重复
		if _, alreadyPromoted := selectedCtx.FullFiles[file]; !alreadyPromoted {
			contextStr += fmt.Sprintf("<File name=\"%s\"> \n%s </File>\n\n", file, utils.ReadFile(file))
		}
	}

	// B. 自动升格的全量文件 (Scheme B Result)
	for path, content := range selectedCtx.FullFiles {
		contextStr += fmt.Sprintf("<File name=\"%s\"> \n%s </File>\n\n", path, content)
	}

	// C. 剩余的零散 Chunks (包含被 Selector 注入了 READ-ONLY 注释的 Skeleton)
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
