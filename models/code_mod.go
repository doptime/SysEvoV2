package models

import "github.com/doptime/redisdb"

// CodeModification 代表对一个代码块的原子修改意图
// 这是 AI (Gemini) 输出的核心结构
type CodeModification struct {
	// 上下文关联
	GoalID   string `json:"goal_id" description:"The ID of the goal."`
	FilePath string `json:"file_path" description:"Required. The target file path."`

	// 核心定位: ChunkID
	// 格式: "path/to/file.go:FuncName" 或 "path/to/file.go:TypeName"
	// 如果是新增文件或全局追加，留空或使用 "EOF"
	TargetChunkID string `json:"target_chunk_id" description:"Required. The ID of the code chunk to modify. e.g. 'main.go:User.Save'."`

	// 变更类型
	ActionType string `json:"action_type" description:"One of: 'MODIFY', 'DELETE', 'CREATE_FILE'"`

	// 新代码内容
	// 必须是完整的 AST 节点代码（包含签名、注释和函数体）
	NewContent string `json:"new_content" description:"The complete new code for this chunk. Must be valid Go/TS code."`

	// 思维链 (CoT)
	Reasoning string `json:"reasoning" description:"Why this change is necessary."`

	// 系统字段
	EvolutionID string                                `json:"-"`
	SolutionKey *redisdb.HashKey[string, interface{}] `json:"-"` // 弱类型引用避免循环依赖
}

// Solution 代表针对一个目标的一组修改方案
type Solution struct {
	GoalID        string              `json:"goal_id"`
	Modifications []*CodeModification `json:"modifications"`
	EvolutionID   string              `json:"evolution_id"`
	Status        string              `json:"status"` // "PENDING", "APPLIED", "FAILED"
}
