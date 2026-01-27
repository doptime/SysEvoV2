package main

import (
	"fmt"
	"sysevov2/analysis"
	"sysevov2/llm"
	"sysevov2/workflow"
)

func Test_selection(Goal string) {
	// 1. 并发索引当前项目
	roots := []string{"/Users/yang/SysEvoV2"}
	analysis.RunParallelIndexing(roots, 4)

	// 2. 初始化 Runner
	runner := workflow.NewRunner()
	runner.Selector.FilesMustInclude = []string{
		"/Users/yang/SysEvoV2/README.md",
	}

	// 3. 发布自完善指令
	// 例如：让系统优化 Selector 的解析逻辑，使其更健壮
	err := runner.ExecuteGoal(
		Goal,
		llm.ModelDefault, // 本地模型筛选
		nil,              // 云端模型修改
	)

	if err != nil {
		fmt.Println("Evolution turn failed:", err)
	}

}
