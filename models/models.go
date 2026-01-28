package models

// 定义 Chunk 类型常量，用于跨语言统一
const (
	ChunkTypeFunction  = "Function"  // 独立函数
	ChunkTypeMethod    = "Method"    // 绑定到结构体/类的方法
	ChunkTypeStruct    = "Struct"    // 数据结构定义 (Go Struct)
	ChunkTypeInterface = "Interface" // 接口定义 (Go/TS Interface)
	ChunkTypeClass     = "Class"     // 类定义 (TS Class)
	ChunkTypeType      = "Type"      // 通用类型别名
)

// Chunk 代表一个代码原子（函数/结构体/接口）
type Chunk struct {
	// 唯一标识符: "filepath:start_byte-end_byte" 或 "filepath:Name"
	// msgpack: 数据库存储字段名
	ID string `json:"id" msgpack:"id"`

	// 类型: 使用上述常量
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
