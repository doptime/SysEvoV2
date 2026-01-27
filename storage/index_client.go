package storage

import (
	"context"
	"fmt"

	"github.com/doptime/config/cfgredis"
	"github.com/doptime/redisdb"
)

// DirtyIndexClient 负责管理符号到 Chunk 的反向索引
// Key Schema: sys/idx/sym/{symbol} -> Set(ChunkIDs)
type DirtyIndexClient struct{}

var Indexer = &DirtyIndexClient{}

// AddSymbolLink 建立链接: Symbol -> ChunkID
func (c *DirtyIndexClient) AddSymbolLink(symbol string, chunkID string) error {
	// Key 分隔符使用 "/"
	key := fmt.Sprintf("sys/idx/sym/%s", symbol)

	// NewSetKey 必须指定两个泛型 [k, v]，这里都是 string
	// SAdd 返回 error
	return redisdb.NewSetKey[string, string](redisdb.WithKey(key)).SAdd(chunkID)
}

// GetSymbolLinks 查找链接: Symbol -> [ChunkID, ChunkID...]
func (c *DirtyIndexClient) GetSymbolLinks(symbol string) ([]string, error) {
	key := fmt.Sprintf("sys/idx/sym/%s", symbol)

	// SMembers 返回 []v, error
	return redisdb.NewSetKey[string, string](redisdb.WithKey(key)).SMembers()
}

// GetUnionLinks 使用 SUNION 一次性获取所有符号对应的 ChunkID 并去重
func (c *DirtyIndexClient) GetUnionLinks(symbols []string) ([]string, error) {
	if len(symbols) == 0 {
		return []string{}, nil
	}

	// 1. 构造所有 Key
	keys := make([]string, len(symbols))
	for i, sym := range symbols {
		// FIX: 确保前缀匹配 README (sys/idx/sym/)
		keys[i] = fmt.Sprintf("sys/idx/sym/%s", sym)
	}

	// 2. 调用 Redis SUNION 命令
	// 假设 redisdb 封装库支持 Do 或者直接支持 Sunion
	// 如果你的 redisdb 库没有直接暴露 Sunion，通常会有 Do 方法
	// 这里以通用 Redis 客户端写法为例：

	// 方式 A: 如果 redisdb 是基于 go-redis 的封装
	// return redisdb.Client.Sunion(context.Background(), keys...).Result()

	// 方式 B: 使用 doptime 框架常见的 SetKey 并不直接支持多 Key 操作，
	// 你可能需要通过底层的 client 执行。这里假设有一个全局 Client 或 RawClient
	// 假设 redisdb.GetClient() 返回底层 *redis.Client
	client, ok := cfgredis.Servers.Get("default")
	if !ok {
		return nil, fmt.Errorf("redis client not found")
	}

	cmd := client.SUnion(context.Background(), keys...)
	return cmd.Result()
}
