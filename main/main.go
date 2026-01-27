package main

import "sysevov2/workflow"

func main() {
	workflow.NewMerger().RunManualMerge()

	Test_selection("检查脏扩散的功能代码是否符合预期。重点检查索引的检查逻辑是否正确建立。现有的索引表并不包括反向符号索引。这会不会引发问题？如果会，如何改进？现在脏扩散的Level2 ID 表都是空的。并没有实现Level2的脏扩散。这部分合理的实现应该是什么样的？")
	//workflow.NewMerger().RunManualMerge("GoalWithContext.txt", llm.ModelDefault)
}
