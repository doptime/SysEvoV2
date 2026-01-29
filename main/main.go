package main

import "sysevov2/workflow"

func main() {
	Test_selection("仔                                                                                                           ..式，看看是否还有大的改进的余地。")
	Test_selection("依赖扩散功能现在没有实现。需要检查相关的代码，并用新的全量源码确保这个功能被实现，并且正确工作。")
	Test_selection("讨论把 部分 本地文件以全量源码的方式追加到 Context 中，以提升上下文的完整性和准确性。优化 Selector 的文件选择逻辑。 这个想法是否必要")
	workflow.NewMerger().RunManualMerge()

	//workflow.NewMerger().RunManualMerge("GoalWithContext.txt", llm.ModelDefault)
}
