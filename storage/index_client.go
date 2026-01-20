package storage

import (
	"fmt"

	"github.com/doptime/redisdb"
)

// DirtyIndexClient 负责管理符号到 Chunk 的反向索引
// Key Schema: sysevo/idx/sym/{symbol} -> Set(ChunkIDs)
type DirtyIndexClient struct{}

var Indexer = &DirtyIndexClient{}

// AddSymbolLink 建立链接: Symbol -> ChunkID
func (c *DirtyIndexClient) AddSymbolLink(symbol string, chunkID string) error {
	// Key 分隔符使用 "/"
	key := fmt.Sprintf("sysevo/idx/sym/%s", symbol)

	// NewSetKey 必须指定两个泛型 [k, v]，这里都是 string
	// SAdd 返回 error
	return redisdb.NewSetKey[string, string](redisdb.WithKey(key)).SAdd(chunkID)
}

// GetSymbolLinks 查找链接: Symbol -> [ChunkID, ChunkID...]
func (c *DirtyIndexClient) GetSymbolLinks(symbol string) ([]string, error) {
	key := fmt.Sprintf("sysevo/idx/sym/%s", symbol)

	// SMembers 返回 []v, error
	return redisdb.NewSetKey[string, string](redisdb.WithKey(key)).SMembers()
}
