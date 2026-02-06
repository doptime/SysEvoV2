package viztel

import (
	"fmt"

	"github.com/doptime/doptime/api"
)

var engine = NewAnalysisEngine()

// Ingest 数据接收端点 (High Throughput)
// 路由: POST /ouroboros/ingest
var Ingest = api.Api(func(req *TelemetryReq) (*struct{ Status string }, error) {

	// 1. 存入主流 (Raw Stream)
	if err := TelemetryStreamKey.RPush(req); err != nil {
		return nil, err
	}

	// 2. [Scenario Indexing] 如果包含场景标记，额外存入场景索引
	// 这一步对于后续 Diagnose 是必须的
	if markers, ok := req.Data["__markers__"]; ok && markers.Attrs != nil {
		// 检查是否有 SCENARIO_START / END
		// 实际项目中，前端会在每一帧或 Start 帧带上 ScenarioID
		// 这里假设我们从 context 或 marker 中提取 ScenarioID
		// 为了简化，我们假设前端通过 Header 或 req 字段传了 ScenarioID (DTO需扩展)
		// 或者根据 marker 中的 meta 信息
	}

	// 简化的索引逻辑：实际场景中可能需要更复杂的流处理
	// 这里演示基本逻辑

	return &struct{ Status string }{"ok"}, nil
})

// Diagnose 诊断端点 (On-Demand Analysis)
// 路由: POST /ouroboros/diagnose
var Diagnose = api.Api(func(req *DiagnoseReq) (*DiagnoseRes, error) {
	// 1. 从 Redis 获取该场景的所有帧
	// 注意：ScenarioIndexKey 需要 req.ScenarioID 填充
	frames, err := ScenarioIndexKey.SetArgs(req.ScenarioID).LRange(0, -1)
	if err != nil {
		return nil, err
	}

	if len(frames) == 0 {
		// 尝试从主流获取（回退逻辑，仅用于测试）
		// frames, _ = TelemetryStreamKey.LRange(0, -1)
		return nil, fmt.Errorf("no telemetry data found for scenario: %s", req.ScenarioID)
	}

	// 2. 执行核心分析
	report := engine.AnalyzeScenario(req.ScenarioID, frames)

	return report, nil
})
