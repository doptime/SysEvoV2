package viztel

import (
	"github.com/doptime/redisdb"
)

// TelemetryStreamKey 定义用户专属的遥测数据流 (List 结构)
// Path: "usr/telemetry/stream:<UserID>"
// 泛型: [v] ListKey 只需要一个类型参数，即存储的值类型
var TelemetryStreamKey = redisdb.NewListKey[*TelemetryReq](
	// 框架会自动解析 @sub 为当前用户的 ID
	redisdb.WithKey("usr/telemetry/stream:@sub"),
)
