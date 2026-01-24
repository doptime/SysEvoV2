package main

import (
	"sysevov2/llm"
	"sysevov2/workflow"
)

func main() {

	//
	workflow.NewMerger().RunManualMerge("GoalWithContext.txt", llm.ModelDefault)
	return
	Test_selection()
}
