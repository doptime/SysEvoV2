package utils

import (
	"encoding/json"
	"fmt"
	"math/big"
	"time"

	"github.com/cespare/xxhash/v2"
)

// 使用通用的Go struct值 -> 规范化JSON -> 计算hash
func GetCanonicalHash(args interface{}) (uint64, error) {
	// 先把结构序列化为map[string]interface{},然后再生成有序json
	data, err := toCanonicalMap(args)
	if err != nil {
		return 0, err
	}
	bs, err := json.Marshal(data)
	if err != nil {
		return 0, err
	}
	return xxhash.Sum64(bs), nil
}

// 将任意struct转换为map[string]interface{}并为JSON序列化排序键
func toCanonicalMap(val interface{}) (interface{}, error) {
	var tmp interface{}
	bs, err := json.Marshal(val)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(bs, &tmp); err != nil {
		return nil, err
	}
	return tmp, nil
}

func ID(v interface{}, Idlength ...int) string {
	IdLen := append(Idlength, 6)[0]
	var inputString string
	switch v := v.(type) {
	case string:
		inputString = v
	case []byte:
		inputString = string(v)
	default:
		inputString = fmt.Sprintf("%v", time.Now().UnixNano())
	}

	// 使用 xxhash 计算哈希
	hashValue := xxhash.Sum64String(inputString)

	// 生成大整数并转为 base62 编码的字符串
	result := new(big.Int).SetUint64(uint64(hashValue)).Text(62)[:IdLen]

	return result
}
