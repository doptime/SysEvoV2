package main

import (
	"fmt"
	"sysevov2/analysis"
	"sysevov2/llm"
	"sysevov2/workflow"
)

func Test_selection() {
	// 1. 并发索引当前项目
	roots := []string{"/Users/yang/SysEvoV2"}
	analysis.RunParallelIndexing(roots, 4)

	// 2. 初始化 Runner
	runner := workflow.NewRunner()

	// 3. 发布自完善指令
	// 例如：让系统优化 Selector 的解析逻辑，使其更健壮
	err := runner.ExecuteGoal(
		"添加一个功能，可以把选择的上下包括功能描述也一并输出到一个本地文件，以进行调试",
		llm.ModelDefault, // 本地模型筛选
		llm.ModelDefault, // 云端模型修改
	)

	if err != nil {
		fmt.Println("Evolution turn failed:", err)
	}

}
