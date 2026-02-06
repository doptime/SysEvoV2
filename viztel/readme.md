# VizTel 开发指南 (Developer Guide)

**版本**: 2.1 (Integrity Focus)
**核心哲学**: 将不可观测的体验（手感、音画同步、逻辑状态）转化为可度量的工程指标。

---

## 1. 系统概览 (Overview)

VizTel 不仅仅是一个埋点库，它是一个**数字神经系统**。它由三个部分组成：

1. **感知 (Sensing - Frontend)**:
* **Visual**: 监控 DOM 元素的物理属性（位置、大小、层级）。
* **Logic**: 监控内存中的变量（分数、物理引擎推力）。
* **Audio**: 监控 Web Audio 的能量输出（RMS/Peak）。
* *数据格式*: 所有数据均被压缩为 **K线 (OHLC)** 格式。


2. **编排 (Orchestration - Frontend)**:
* **ATP 协议**: 执行精确的时间轴动作（点击、拖拽）。
* **Mock**: 隔离网络副作用。
* **Marker**: 在执行动作时，向数据流中注入“因果标记”。


3. **诊断 (Diagnosis - Backend)**:
* **相关性分析**: 检查 Input (动作) 与 Output (画面/声音) 的方差相关性。
* **死锁检测**: 有输入但无输出 = `NO_RESPONSE`。
* **音画同步**: 动作发生后，声音能量是否及时响应。



---

## 2. 前端集成指南 (Frontend Integration)

前端核心位于 `src/visual-telemetry`。支持 React 和原生 JS。

### 2.1 初始化运行时

在应用的入口文件（如 `layout.tsx` 或 `App.tsx`）启动遥测引擎。

```typescript
import { telemetry, audioTelemetry } from '@/visual-telemetry';

// 1. 启动 DOM 和 逻辑 感知
useEffect(() => {
    telemetry.start();
    return () => telemetry.stop();
}, []);

// 2. (可选) 启动 听觉 感知
// 需在用户交互后或 AudioContext 创建时调用
function initAudio() {
    const ctx = new AudioContext();
    // 挂载到主音量节点
    audioTelemetry.mount(ctx, myGameMasterGainNode);
}

```

### 2.2 视觉埋点 (Visual Telemetry)

监控 UI 元素的“物理权重”和“注意力位序”。

**React 方式 (推荐):**
使用 `useTrack` Hook。它会自动生成 `data-vt-*` 属性。

```tsx
import { useTrack, TelemetryScope } from '@/visual-telemetry';

export const MyButton = () => {
    // ID 会自动拼接 Scope: "menu/submit_btn"
    // watch: 显式监控 opacity 变化
    // boost: 人为提升该按钮在热力图中的权重
    const trackProps = useTrack('submit_btn', { 
        watch: ['opacity'], 
        boost: 'high' 
    });

    return <button {...trackProps}>Click Me</button>;
};

// 使用 Scope 包裹
<TelemetryScope name="menu">
    <MyButton />
</TelemetryScope>

```

### 2.3 逻辑埋点 (Virtual Telemetry)

监控内存中的数值变化（如游戏分数、物理速度）。解决了“画面显示 100 分，但逻辑是 99 分”的分歧问题。

**单值绑定:**

```tsx
import { useSignalBinding } from '@/visual-telemetry';

function ScoreBoard({ score }) {
    // 当 score 变化时，自动推送到通道 "hud/score:value"
    useSignalBinding('hud/score', 'value', score);
    
    return <div>{score}</div>;
}

```

**高频绑定 (如 requestAnimationFrame):**

```tsx
import { useSignalRef } from '@/visual-telemetry';

function GameLoop() {
    // 创建一个带阈值的 Ref，变化超过 0.1 才上报，节省带宽
    const speedRef = useSignalRef('ship', 'speed', { threshold: 0.1 });

    useFrame(() => {
        // 赋值即上报
        speedRef.current = ship.velocity.length(); 
    });
}

```

### 2.4 自动化编排 (Orchestration)

不要写脆弱的 E2E 测试代码。使用 **ATP (Action Timeline Protocol)** 描述剧本。

```typescript
import { choreography } from '@/visual-telemetry';

async function runTest() {
    await choreography.execute({
        op: "EXECUTE_CHOREOGRAPHY",
        scenario_id: "test_drag_drop",
        strategy: "human_like", // 使用贝塞尔曲线模拟真人鼠标轨迹
        timeline: [
            // 1. 移动并注入标记 "START"
            { offset_ms: 0, action: "POINTER_MOVE", params: { target: "item/1" }, marker: "START" },
            // 2. 拖拽
            { offset_ms: 500, action: "DRAG", params: { target: "item/1", endX: 500, endY: 500 } },
            // 3. 结束并注入标记 "END"
            { offset_ms: 1500, action: "WAIT", params: { timeout: 200 }, marker: "END" }
        ]
    });
}

```

---

## 3. 后端集成指南 (Backend Integration)

后端使用 Golang + Redis。核心在于接收数据流并运行诊断引擎。

### 3.1 核心接口 (API)

* **POST** `/ouroboros/ingest`: 高吞吐数据接收。
* **POST** `/ouroboros/diagnose`: 触发针对特定场景的分析报告。

### 3.2 诊断引擎配置

在 `viztel/analysis.go` 中，你可以调整诊断的灵敏度。

```go
engine := viztel.NewAnalysisEngine()
// 设置音频静音阈值 (0.05 = 5% 音量)
engine.ThresholdAudioPeak = 0.05 
// 设置输入判定阈值
engine.ThresholdInputVar = 0.01

```

### 3.3 如何解读诊断报告

调用 `Diagnose` 接口后，你会得到如下 JSON 报告。以下是关键字段的人类解读：

```json
{
  "scenario_id": "test_drag_drop",
  "score": 80.0,
  "intervals": [
    {
      "name": "START -> END",
      "verdict": "NO_RESPONSE", 
      "message": "Deadlock detected: Input active but Output frozen"
    }
  ],
  "audio_sync": {
    "sync_events": [
      {
        "marker": "COLLISION",
        "verdict": "FAIL_LAG",
        "latency_ms": 450
      }
    ]
  }
}

```

* **NO_RESPONSE (死锁)**: 你的脚本在疯狂点击/拖拽 (`InputVariance` 高)，但屏幕像素权重没有变化 (`OutputVariance` 低)。**这是一个 Bug。**
* **CHAOTIC (混沌)**: 输入和输出都在变，但完全不相关（相关系数低）。可能是 UI 乱跳。
* **FAIL_SILENT (失聪)**: 触发了 `COLLISION` 标记，但音频能量 K 线是平的。
* **FAIL_LAG (音画延迟)**: 声音在动作发生 200ms 后才出现。

---

## 4. 最佳实践 (Best Practices)

### 4.1 "最小作用量"原则

* **不要** 为了埋点重构业务代码。
* **要** 使用 `useSignalBinding` 悄悄地挂载在现有 State 上。

### 4.2 "Ouroboros" (衔尾蛇) 闭环

开发流程应该是：

1. **Dev**: 编写功能。
2. **Orchestrate**: 编写一个简单的 ATP 剧本（如“点击购买”）。
3. **Run**: 在无头浏览器中运行剧本。
4. **Diagnose**: 后端分析报告返回 `NO_RESPONSE` 或 `AV_DESYNC`。
5. **Fix**: 修复代码，由 CI 自动重复上述步骤。

### 4.3 混合遥测 (Hybrid Telemetry)

对于复杂组件（如带有数字显示的卡片），同时监控 **Visual** 和 **Virtual**：

```tsx
// 既监控 DOM 位置/透明度，又监控内部数据准确性
const { domProps, bindSignal } = useHybridTelemetry('card', { watch: ['opacity'] });
bindSignal('score', currentScore);

return <div {...domProps}>{currentScore}</div>;

```

---

## 5. 常见问题 (FAQ)

**Q: 为什么我需要 Audio Telemetry？**
A: 在无头浏览器测试中，传统工具无法听到声音。VizTel 通过分析 `AudioContext` 的能量流，能发现“静音Bug”或“音效延迟”，这对于游戏开发至关重要。

**Q: K 线数据是什么？**
A: 为了减少带宽，我们不发送每一帧的数据。我们将 100ms 内的数据聚合为 **Open(开始值), High(最高值), Low(最低值), Close(结束值)**。这足以还原波动趋势。

**Q: Rank (位序) 是什么？**
A: 它是元素在屏幕上的“注意力排名”。Rank 1 代表最显眼（最大、最中心、最不透明）。如果你的“支付按钮” Rank 变成了 50，说明它被遮挡或挤到边缘了。