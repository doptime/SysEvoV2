package viztel

import (
	"time"

	"github.com/doptime/redisdb"
)

// TelemetryStreamKey 用户级原始数据流
// Path: "usr/telemetry/stream:<UserID>"
var TelemetryStreamKey = redisdb.NewListKey[*TelemetryReq](
	redisdb.WithKey("usr/telemetry/stream:@sub"),
	redisdb.WithTTL(2*time.Hour), // 短期存储，分析后即焚
)

// ScenarioIndexKey 场景索引 (用于快速提取特定场景的帧)
// Path: "usr/telemetry/scenario:<UserID>:<ScenarioID>"
var ScenarioIndexKey = redisdb.NewListKey[*TelemetryReq](
	redisdb.WithKey("usr/telemetry/scenario:@sub:?"),
	redisdb.WithTTL(24*time.Hour),
)
