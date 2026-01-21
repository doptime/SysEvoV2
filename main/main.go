package main

import (
	"log"
	"sysevov2/analysis"
)

func main() {
	projectRoots := []string{
		"/Users/yang/SysEvoV2",
	}

	// 指定运行线程数，例如 4 线程
	err := analysis.RunParallelIndexing(projectRoots, 1)
	if err != nil {
		log.Fatalf("Failed to index codebase: %v", err)
	}
}
