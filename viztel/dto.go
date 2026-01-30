package viztel

// Metric 对应前端 K线 的 AggregatedMetric (OHLC)
type Metric struct {
	O float64 `json:"o" msgpack:"o"` // Open
	H float64 `json:"h" msgpack:"h"` // High
	L float64 `json:"l" msgpack:"l"` // Low
	C float64 `json:"c" msgpack:"c"` // Close
}

// ElementData 对应前端的 ElementTelemetry
type ElementData struct {
	W     *Metric            `json:"w" msgpack:"w"` // Weight (绝对权重)
	R     *Metric            `json:"r" msgpack:"r"` // Rank (相对位序)// [新增] 具体的属性 K 线 (Opacity, Scale, X, Y 等)
	Attrs map[string]*Metric `json:"a,omitempty" msgpack:"a"`
}

// TelemetryReq 是 API 的主入口参数
// 对应前端的 TelemetryFrame
type TelemetryReq struct {
	// [Context Injection]
	// 核心：利用 @@sub 自动注入 UserID，前端无需传递，防篡改
	UserID string `json:"@@sub" msgpack:"uid"`

	// [Context Injection]
	// 注入客户端 IP，用于指纹记录
	ClientIP string `json:"@@remoteAddr" msgpack:"ip"`

	// [Payload]
	// 对应 JSON 中的 ts, dur, data
	Timestamp int64                   `json:"ts" msgpack:"ts" validate:"required"`
	Duration  int                     `json:"dur" msgpack:"dur"`
	Data      map[string]*ElementData `json:"data" msgpack:"data"` // Key 是 data-ouro-id
}

// TelemetryRes 简单的 API 响应
type TelemetryRes struct {
	Status string `json:"status"`
}
