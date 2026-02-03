package viztel

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

// AnalysisEngine 核心诊断逻辑
type AnalysisEngine struct {
	// 配置阈值 (可从 Config 注入)
	ThresholdInputVar  float64
	ThresholdOutputVar float64
	ThresholdAudioPeak float64 // 0.0 ~ 1.0 (RMS)
}

func NewAnalysisEngine() *AnalysisEngine {
	return &AnalysisEngine{
		ThresholdInputVar:  0.01,
		ThresholdOutputVar: 0.001,
		ThresholdAudioPeak: 0.05, // 5% 能量视为有声
	}
}

// AnalyzeScenario 执行全维诊断
func (e *AnalysisEngine) AnalyzeScenario(scenarioID string, frames []*TelemetryReq) *DiagnoseRes {
	report := &DiagnoseRes{
		ScenarioID: scenarioID,
		Intervals:  make([]*IntervalDiagnosis, 0),
		Alerts:     make([]string, 0),
	}

	markers := e.extractMarkers(frames)

	// 1. Audio Analysis (Whole Scenario)
	audioReport := e.analyzeAudioSync(frames, markers)
	report.AudioSync = audioReport

	// 2. Interval Analysis (Input/Output Correlation)
	for i := 0; i < len(markers)-1; i++ {
		start := markers[i]
		end := markers[i+1]

		// 忽略极短区间
		if end.Ts-start.Ts < 50 {
			continue
		}

		intervalFrames := e.filterFrames(frames, start.Ts, end.Ts)
		if len(intervalFrames) < 2 {
			continue
		}

		// A. 计算方差
		inputVar := e.calculateSignalVariance(intervalFrames, []string{"__cursor__", "__input__"})
		outputVar := e.calculateSignalVariance(intervalFrames, nil) // Auto-detect output
		corr := e.computeCorrelation(intervalFrames)

		diagnosis := &IntervalDiagnosis{
			Name:           fmt.Sprintf("%s -> %s", start.Name, end.Name),
			Duration:       end.Ts - start.Ts,
			InputVariance:  inputVar,
			OutputVariance: outputVar,
			Correlation:    corr,
		}

		// B. 裁决 (Verdict)
		e.judgeInterval(diagnosis)

		report.Intervals = append(report.Intervals, diagnosis)

		if diagnosis.Verdict != "HEALTHY" && diagnosis.Verdict != "IDLE" {
			report.Alerts = append(report.Alerts, fmt.Sprintf("[%s] %s: %s", diagnosis.Name, diagnosis.Verdict, diagnosis.Message))
		}
	}

	// 3. Score Calculation
	e.calculateScore(report)

	return report
}

// === Logic Implementations ===

func (e *AnalysisEngine) judgeInterval(d *IntervalDiagnosis) {
	hasInput := d.InputVariance > e.ThresholdInputVar
	hasOutput := d.OutputVariance > e.ThresholdOutputVar

	if hasInput && !hasOutput {
		d.Verdict = "NO_RESPONSE"
		d.Message = "Deadlock detected: Input active but Output frozen"
	} else if !hasInput && hasOutput {
		d.Verdict = "AUTONOMOUS"
		d.Message = "Animation or Timer active"
	} else if !hasInput && !hasOutput {
		d.Verdict = "IDLE"
	} else {
		// Both active, check correlation (Optional advanced logic)
		d.Verdict = "HEALTHY"
	}
}

func (e *AnalysisEngine) analyzeAudioSync(frames []*TelemetryReq, markers []markerPoint) *AudioSyncReport {
	res := &AudioSyncReport{SyncEvents: []AVSyncEvent{}}

	// 提取 Audio 能量流
	var audioStream []struct {
		ts   int64
		peak float64
	}
	for _, f := range frames {
		if node, ok := f.Data["__system__/audio"]; ok && node.Attrs != nil {
			// 优先使用 peak_level, 其次 energy_rms
			if val, ok := node.Attrs["peak_level"]; ok {
				audioStream = append(audioStream, struct {
					ts   int64
					peak float64
				}{f.Timestamp, val.H})
			} else if val, ok := node.Attrs["energy_rms"]; ok {
				audioStream = append(audioStream, struct {
					ts   int64
					peak float64
				}{f.Timestamp, val.H})
			}
		}
	}

	if len(audioStream) == 0 {
		return res // No audio data captured
	}

	// 检查关键动作后的声音
	criticalActions := []string{"COLLISION", "EXPLOSION", "SUCCESS", "FAIL", "CLICK"}

	for _, m := range markers {
		isCritical := false
		upperName := strings.ToUpper(m.Name)
		for _, key := range criticalActions {
			if strings.Contains(upperName, key) {
				isCritical = true
				break
			}
		}
		if !isCritical {
			continue
		}

		// 在 Marker 后 300ms 内寻找最大能量
		maxEnergy := 0.0
		peakTs := int64(0)
		windowEnd := m.Ts + 300

		for _, frame := range audioStream {
			if frame.ts >= m.Ts && frame.ts <= windowEnd {
				if frame.peak > maxEnergy {
					maxEnergy = frame.peak
					peakTs = frame.ts
				}
			}
		}

		event := AVSyncEvent{
			ActionMarker: m.Name,
			LatencyMs:    float64(peakTs - m.Ts),
			IsSilent:     maxEnergy < e.ThresholdAudioPeak,
		}

		if event.IsSilent {
			event.Verdict = "FAIL_SILENT"
		} else if event.LatencyMs > 200 { // 200ms 阈值
			event.Verdict = "FAIL_LAG"
		} else {
			event.Verdict = "PASS"
		}

		res.SyncEvents = append(res.SyncEvents, event)
	}
	return res
}

// === Helpers ===

type markerPoint struct {
	Name string
	Ts   int64
}

func (e *AnalysisEngine) extractMarkers(frames []*TelemetryReq) []markerPoint {
	var points []markerPoint
	for _, f := range frames {
		if mData, ok := f.Data["__markers__"]; ok && mData.Attrs != nil {
			for name, metric := range mData.Attrs {
				if metric.C > 0 { // Timestamp stored in Close
					points = append(points, markerPoint{Name: name, Ts: int64(metric.C)})
				}
			}
		}
	}
	sort.Slice(points, func(i, j int) bool { return points[i].Ts < points[j].Ts })
	return points
}

func (e *AnalysisEngine) filterFrames(frames []*TelemetryReq, start, end int64) []*TelemetryReq {
	var res []*TelemetryReq
	for _, f := range frames {
		if f.Timestamp >= start && f.Timestamp <= end {
			res = append(res, f)
		}
	}
	return res
}

func (e *AnalysisEngine) calculateSignalVariance(frames []*TelemetryReq, targetIDs []string) float64 {
	var vals []float64
	for _, f := range frames {
		sum := 0.0
		count := 0
		for id, data := range f.Data {
			isTarget := false
			if targetIDs == nil {
				if !strings.HasPrefix(id, "__") {
					isTarget = true
				} // Auto output
			} else {
				for _, t := range targetIDs {
					if id == t {
						isTarget = true
						break
					}
				}
			}

			if isTarget {
				if data.W != nil {
					sum += data.W.Activity()
					count++
				}
				for _, m := range data.Attrs {
					sum += m.Activity()
					count++
				}
			}
		}
		if count > 0 {
			vals = append(vals, sum)
		} else {
			vals = append(vals, 0)
		}
	}
	return e.variance(vals)
}

func (e *AnalysisEngine) variance(nums []float64) float64 {
	if len(nums) < 2 {
		return 0
	}
	mean := 0.0
	for _, n := range nums {
		mean += n
	}
	mean /= float64(len(nums))
	v := 0.0
	for _, n := range nums {
		v += (n - mean) * (n - mean)
	}
	return v / float64(len(nums))
}

// 简化版 Correlation，仅作为占位，完整版参考上文 user 代码
func (e *AnalysisEngine) computeCorrelation(frames []*TelemetryReq) float64 { return 0.5 }

func (e *AnalysisEngine) calculateScore(r *DiagnoseRes) {
	fails := 0
	for _, i := range r.Intervals {
		if i.Verdict == "NO_RESPONSE" {
			fails++
		}
	}
	if r.AudioSync != nil {
		for _, s := range r.AudioSync.SyncEvents {
			if s.Verdict != "PASS" {
				fails++
			}
		}
	}
	total := len(r.Intervals)
	if total == 0 {
		total = 1
	}
	r.Score = math.Max(0, 100.0-(float64(fails)/float64(total))*50.0)
}
