package storage

import (
	"sysevov2/models"

	"github.com/doptime/redisdb"
)

// ChunkStorage: 存储代码实体
// Key: sysevo/chunks
// Field: ChunkID
var ChunkStorage = redisdb.NewHashKey[string, *models.Chunk](
	redisdb.WithKey("sysevo/chunks"),
)

// FileMetaKey: 增量检查辅助 Key
// Key: sysevo/files/meta
// Field: FilePath
// Value: LastModifiedUnix
var FileMetaKey = redisdb.NewHashKey[string, int64](
	redisdb.WithKey("sysevo/files/meta"),
)
