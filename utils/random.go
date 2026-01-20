package utils

import (
	"math/rand"
)

// getRandomNFromMap 支持泛型，返回随机选择的N个键
func GetRandomNKeyFromMap[K comparable, V any](m map[K]*V, N int) []K {
	// 把 map 的 keys 存入切片中
	var keys []K
	for key := range m {
		keys = append(keys, key)
	}
	// 防止 N 大于 keys 的长度
	if N > len(keys) {
		N = len(keys)
	}

	// 随机挑选 N 个 keys
	var result []K
	for i := 0; i < N; i++ {
		// 生成一个随机索引
		index := rand.Intn(len(keys))
		result = append(result, keys[index])
		// 从 keys 中删除选中的 key，以免重复
		keys = append(keys[:index], keys[index+1:]...)
	}

	return result
}
func GetRandomNValueFromMap[K comparable, V any](m map[K]*V, N int) []*V {
	// 把 map 的 keys 存入切片中
	var keys []K
	for key := range m {
		keys = append(keys, key)
	}
	// 防止 N 大于 keys 的长度
	if N > len(keys) {
		N = len(keys)
	}

	// 随机挑选 N 个 keys
	var result []*V
	for i := 0; i < N; i++ {
		// 生成一个随机索引
		index := rand.Intn(len(keys))
		result = append(result, m[keys[index]])
		// 从 keys 中删除选中的 key，以免重复
		keys = append(keys[:index], keys[index+1:]...)
	}

	return result
}
