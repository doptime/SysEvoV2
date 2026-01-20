package workflow

import (
	"fmt"

	"sysevov2/agent"
	"sysevov2/context"
	"sysevov2/editing"
	"sysevov2/models"
	"sysevov2/tool"
)

type GoalRunner struct {
	Selector *context.Selector
	Editor   *agent.Agent // 负责生成的 Cloud Agent (Gemini)
}

func NewRunner(localAgent, cloudAgent *agent.Agent) *GoalRunner {
	return &GoalRunner{
		Selector: context.NewSelector(localAgent),
		Editor:   cloudAgent,
	}
}

// ExecuteGoal 执行单个目标
func (r *GoalRunner) ExecuteGoal(goal string) error {
	// 1. 上下文筛选
	chunks, err := r.Selector.SelectRelevantChunks(goal)
	if err != nil {
		return err
	}

	// 2. 构造 Prompt 给 Gemini
	// 将选中的 Chunk 代码拼接
	var contextStr string
	for _, c := range chunks {
		contextStr += fmt.Sprintf("// File: %s\n// Chunk: %s\n%s\n\n", c.FilePath, c.ID, c.Body)
	}

	sysPrompt := `You are a Senior Go Engineer.
Your task: Generate code modifications to achieve the Goal.
You have been provided with the relevant code context (CHUNKS).

Guidelines:
1. Use the "ApplyModification" tool to make changes.
2. TargetChunkID must be precise (e.g., "main.go:Process").
3. NewContent must be the COMPLETE new code for that chunk.
4. If creating a new file, use "CREATE_FILE" action.`

	// 3. 调用 Cloud Agent
	params := map[string]any{
		"SystemPrompt": sysPrompt,
		"Goal":         goal,
		"Chunks":       contextStr,
		agent.UseModel: r.Editor.Models[0], // Gemini
	}

	// 定义 Tool 回调
	// 当 Gemini 调用 ApplyModification 时，直接触发 editing.ApplyModification
	r.Editor.WithTools(tool.NewTool("ApplyModification", "Modify code chunk", func(mod *models.CodeModification) {
		mod.GoalID = goal
		if err := editing.ApplyModification(mod); err != nil {
			fmt.Printf("❌ Edit Failed: %v\n", err)
		} else {
			fmt.Printf("✅ Edit Applied: %s\n", mod.TargetChunkID)
		}
	}))

	// 4. 执行生成 (Agent 内部会自动处理 Tool 调用)
	fmt.Println("🚀 Generating Code...")
	return r.Editor.Call(params)
}
