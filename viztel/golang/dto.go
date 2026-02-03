package viztel

import "math"

// =============================================================================
// Core Data Types (Mirror Frontend TelemetryPayloadSchema.ts)
// =============================================================================

// Metric 对应前端 K线 AggregatedMetric (Universal K-Line)
type Metric struct {
	O   float64 `json:"o" msgpack:"o"`               // Open
	H   float64 `json:"h" msgpack:"h"`               // High
	L   float64 `json:"l" msgpack:"l"`               // Low
	C   float64 `json:"c" msgpack:"c"`               // Close
	Cnt int     `json:"cnt,omitempty" msgpack:"cnt"` // [Sedimentation] 样本计数
}

// IsEmpty checks if metric has valid data
func (m *Metric) IsEmpty() bool {
	return m == nil || m.O == -1
}

// Activity returns total activity (Range + |Delta|)
func (m *Metric) Activity() float64 {
	if m.IsEmpty() {
		return 0
	}
	return (m.H - m.L) + (math.Abs(m.C - m.O))
}

// ElementData 对应前端 ElementTelemetry
type ElementData struct {
	W     *Metric            `json:"w,omitempty" msgpack:"w"` // Visual Weight (DOM)
	R     *Metric            `json:"r,omitempty" msgpack:"r"` // Rank (DOM)
	Attrs map[string]*Metric `json:"a,omitempty" msgpack:"a"` // Attributes/Virtual/Audio
}

// TelemetryReq (Frame) 是核心传输单元
type TelemetryReq struct {
	// [Context Injection]
	UserID   string `json:"@@sub" msgpack:"uid"`
	ClientIP string `json:"@@remoteAddr" msgpack:"ip"`

	// [Payload]
	Timestamp int64                   `json:"ts" msgpack:"ts" validate:"required"`
	Duration  int                     `json:"dur" msgpack:"dur"`
	Sources   []string                `json:"sources,omitempty" msgpack:"src"` // "dom", "virtual", "audio"
	Data      map[string]*ElementData `json:"data" msgpack:"data"`
}

// =============================================================================
// Diagnosis Report Types
// =============================================================================

type DiagnoseReq struct {
	UserID     string `json:"@@sub" msgpack:"uid"`
	ScenarioID string `json:"scenario_id" validate:"required"`
}

type DiagnoseRes struct {
	ScenarioID string               `json:"scenario_id"`
	Score      float64              `json:"score"` // 0-100 Health Score
	Intervals  []*IntervalDiagnosis `json:"intervals"`
	AudioSync  *AudioSyncReport     `json:"audio_sync,omitempty"` // [New] 音画同步报告
	Alerts     []string             `json:"alerts"`
}

type IntervalDiagnosis struct {
	Name           string  `json:"name"`
	Duration       int64   `json:"duration"`
	InputVariance  float64 `json:"input_var"`
	OutputVariance float64 `json:"output_var"`
	Correlation    float64 `json:"correlation"`
	Verdict        string  `json:"verdict"` // HEALTHY, NO_RESPONSE, AV_DESYNC...
	Message        string  `json:"message"`
}

type AudioSyncReport struct {
	SyncEvents []AVSyncEvent `json:"sync_events"`
}

type AVSyncEvent struct {
	ActionMarker string  `json:"marker"`
	LatencyMs    float64 `json:"latency_ms"`
	IsSilent     bool    `json:"is_silent"` // True if peak energy < threshold
	Verdict      string  `json:"verdict"`   // PASS, FAIL_SILENT, FAIL_LAG
}
