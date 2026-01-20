package analysis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sysevov2/models"
)

// analyzerScriptPath 定义分析器脚本的相对路径
// 部署时确保 analyzers 目录和二进制文件在一起，或者通过环境变量配置
const analyzerScriptPath = "analyzers/ts/index.js"

// ParseTSFile 启动一个 Node 子进程来分析目标文件
func ParseTSFile(targetPath string) ([]*models.Chunk, error) {
	// 1. 获取当前工作目录，定位分析器脚本
	cwd, _ := os.Getwd()
	scriptAbsPath := filepath.Join(cwd, analyzerScriptPath)

	// 检查脚本是否存在 (开发阶段常见错误)
	if _, err := os.Stat(scriptAbsPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("TS analyzer not found at: %s", scriptAbsPath)
	}

	// 2. 构造命令: node <script> <target>
	// 这完全符合你的要求：运行第三方可执行文件 (node)，不侵入目标项目
	cmd := exec.Command("node", scriptAbsPath, targetPath)

	// 3. 捕获输出
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	// 4. 执行
	err := cmd.Run()
	if err != nil {
		return nil, fmt.Errorf("node exec failed: %v | stderr: %s", err, stderr.String())
	}

	// 5. 解析 JSON
	var rawChunks []struct {
		ID                string   `json:"id"`
		Type              int      `json:"type"` // TS Kind ID
		Skeleton          string   `json:"skeleton"`
		Body              string   `json:"body"`
		SymbolsReferenced []string `json:"symbols_referenced"`
	}

	if err := json.Unmarshal(out.Bytes(), &rawChunks); err != nil {
		// 如果输出不是 JSON，可能是脚本崩了打印了堆栈
		return nil, fmt.Errorf("json parse failed: %v | output: %s", err, out.String())
	}

	// 6. 转换模型
	var chunks []*models.Chunk
	for _, rc := range rawChunks {
		chunks = append(chunks, &models.Chunk{
			ID:                rc.ID,
			Type:              fmt.Sprintf("TS_Kind_%d", rc.Type), // 简单标记类型
			Skeleton:          rc.Skeleton,
			Body:              rc.Body,
			SymbolsDefined:    extractNameFromID(rc.ID), // 从 ID 反推名字
			SymbolsReferenced: rc.SymbolsReferenced,
			FilePath:          targetPath,
		})
	}

	return chunks, nil
}

// 辅助函数：从 ID "path/to/file.ts:FuncName" 中提取 "FuncName"
func extractNameFromID(id string) []string {
	// 修正：删除了未使用的 parts 变量
	// 假设 ID 是 "path:name"
	for i := len(id) - 1; i >= 0; i-- {
		if id[i] == ':' {
			return []string{id[i+1:]}
		}
	}
	return []string{"anonymous"}
}
