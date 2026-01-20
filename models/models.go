package models

// Chunk 代表一个代码原子（函数/结构体/接口）
type Chunk struct {
	// 唯一标识符: "filepath:start_byte-end_byte"
	// msgpack: 数据库存储字段名
	ID string `json:"id" msgpack:"id"`

	// 类型: "Function", "Struct", "Interface"
	Type string `json:"type" msgpack:"type"`

	// 骨架: 仅签名 + 注释 (用于 Level 1 意图筛选)
	Skeleton string `json:"skeleton" msgpack:"skeleton"`

	// 全文: 完整的代码实现 (用于 Level 3 生成)
	Body string `json:"body" msgpack:"body"`

	// 符号表: 定义了什么符号
	SymbolsDefined []string `json:"symbols_defined" msgpack:"symbols_defined"`

	// 引用表: 调用了什么符号 (用于构建脏链接图)
	SymbolsReferenced []string `json:"symbols_referenced" msgpack:"symbols_referenced"`

	// 文件元数据: 用于增量更新检查
	FilePath  string `json:"file_path" msgpack:"file_path"`
	UpdatedAt int64  `json:"updated_at" msgpack:"updated_at"` // Unix Timestamp
}
