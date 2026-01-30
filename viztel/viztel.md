强烈建议**另外创建一个独立的白皮书文档**（例如命名为 `docs/Project_Ouroboros_Whitepaper.md` 或 `docs/Automated_QA_Loop_Spec.md`）。

**理由如下：**

1. **关注点分离 (Separation of Concerns)**：
* `README.md` 是 **SysEvoV2** 本身（作为一个通用工具）的说明书，描述它是如何索引、筛选和修改代码的。
* 新的白皮书描述的是 **SysEvoV2 + 前端项目** 联合实施的一个**具体业务场景**（全自动游戏开发闭环）。不要把“工具的定义”和“工具的使用场景”混在一起。


2. **跨项目性质**：这个闭环涉及两个仓库（SysEvoV2 后端 + Liquid-Matrix 前端）。这个文档未来可能需要同时存在于两个项目中，或者作为一个顶层指导文档。独立文件更方便引用和分发。
3. **复杂度管理**：SysEvoV2 的 README 已经涉及了复杂的“菱形选择”逻辑。如果再加入前端 R3F 探针、Playwright 协议等细节，文档会变得不可读。

---

以下我为你起草的这份白皮书。它基于我们刚才讨论的 **“状态探针 + Minimax 128k”** 核心路径，将其工程化落地。

你可以将以下内容保存为 `docs/Operation_Ouroboros.md`（“衔尾蛇行动”——寓意自我吞噬、自我进化的完美闭环）。

---

# Project Ouroboros: 自动化游戏演进闭环白皮书

**版本**: v1.0 (Concept)
**日期**: 2026-01-28
**核心理念**: **State over Pixels** (状态重于像素) —— 利用大上下文模型 (Minimax 128k) 阅读 3D 引擎运行时状态，而非依赖视觉识别，实现高精度的自动化 Debug 与迭代。

---

## 1. 战略愿景 (Strategic Vision)

构建一条连接 **运行时 (Runtime)** 与 **开发时 (Devtime)** 的自动化高速公路。
打破“人工测试 -> 人工反馈 -> 人工修改”的低效循环，建立 **“探针捕获 -> AI 分析 -> 自动提交”** 的机器闭环。

**核心公式**:

> `R3F State Dump` (前端) + `Playwright` (驱动) -> `SysEvoV2` (大脑) = **Self-Healing Game**

---

## 2. 架构设计 (Architecture)

系统由 **三位一体** 构成：

### 2.1 The Probe (前端探针)

* **位置**: 前端项目 `components/debug/GameStateDumper.tsx`
* **职责**: 将 React Three Fiber (R3F) 和 Rapier 物理引擎的瞬时状态序列化为 JSON。
* **核心能力**:
* **Scene Graph**: 遍历 `scene.children`，提取物体坐标、旋转、缩放。
* **Physics State**: 提取 Rapier RigidBody 的 `velocity`, `mass`, `collider` 类型。
* **Game Logic**: 提取 React State (如 `score`, `isGameOver`, `levelConfig`)。
* **触发机制**:
* 被动触发: 监听 `window.postMessage('DUMP_STATE')`。
* 主动触发: 捕捉 `window.onerror` 或 React Error Boundary。





### 2.2 The Bridge (自动化桥梁)

* **位置**: 独立 Node.js 脚本或 Playwright 测试套件。
* **职责**: 模拟玩家行为，触发 Bug，搬运数据。
* **流程**:
1. 启动浏览器加载游戏。
2. 注入特定关卡配置 (`GameConfig.json`)。
3. 执行预定动作 (Action Replay) 或随机猴子测试 (Monkey Test)。
4. **断言监控**: 检测 FPS 下跌、Console 报错、关键逻辑异常（如玩家掉出地图）。
5. 异常发生时 -> **调用 Probe 获取 JSON** -> 打包发送给 SysEvoV2。



### 2.3 The Brain (SysEvoV2 适配)

* **位置**: SysEvoV2 后端。
* **职责**: 接收 Dump 数据，定位代码，生成修补。
* **Prompt 策略**:
* **Context**: 注入 `GameState.json` (作为事实依据) + 相关源码 (通过 Diamond Selection 筛选)。
* **Instruction**: "玩家在坐标 (x,y,z) 穿模了。当前的物理配置是 [PhysicsConfig]。请分析为何 Collider 失效，并修改对应的 React 组件代码。"



---

## 3. 数据协议标准 (Data Protocol)

为了确保 Minimax 能读懂，我们定义标准的 **Ouroboros Dump Schema**：

```json
{
  "meta": {
    "timestamp": 1700000000,
    "fps": 45,
    "resolution": "1920x1080",
    "url": "http://localhost:3000/level/7"
  },
  "error": {
    "message": "Uncaught Error: NaN detected in player position",
    "stack": "..."
  },
  "scene_graph": [
    {
      "name": "Player",
      "type": "Group",
      "position": { "x": 0, "y": -50, "z": 0 },
      "components": ["RigidBody", "Mesh"],
      "physics": {
        "velocity": { "x": 0, "y": -9.8, "z": 0 },
        "isSleeping": false
      }
    },
    {
      "name": "Floor_01",
      "type": "Mesh",
      "position": { "x": 0, "y": 0, "z": 0 },
      "material": "StandardMaterial"
    }
  ],
  "game_state": {
    "currentLevel": 7,
    "score": 100,
    "phase": "playing"
  }
}

```

---

## 4. 实施阶段 (Implementation Phases)

### Phase 1: 手动闭环 (The "Report" Button) [当前重点]

* **目标**: 跑通数据链路，不依赖自动化测试脚本。
* **功能**:
1. 前端增加一个半透明的 "🐞 Report Bug" 按钮。
2. 人工测试游戏，发现手感不对或 Bug 时点击。
3. 按钮触发 `GameStateDumper`，将 JSON 复制到剪贴板，或直接 POST 到 SysEvoV2 接口。
4. SysEvoV2 读取 JSON，自动分析并修改代码。



### Phase 2: 脚本化验证 (Scripted Verification)

* **目标**: 引入 Playwright，实现“无人值守”的回归测试。
* **功能**:
1. 编写 Playwright 脚本：`await page.evaluate(() => window.game.player.jump())`。
2. CI/CD 流水线中运行测试，自动生成 Bug Report。



### Phase 3: 生成式进化 (Generative Evolution)

* **目标**: AI 自行设计关卡 -> AI 自行测试 -> AI 自行修复。
* **功能**:
1. SysEvoV2 生成新的 `GameConfig.json`。
2. 自动启动 Phase 2 流程验证新关卡的可玩性。
3. 如果通过，发布；如果不通过，自动修补。



---

## 5. 对 SysEvoV2 的需求变更

为了支持 Ouroboros 计划，SysEvoV2 需要新增一个专门的 **Workflow 入口**：

* **新增模块**: `workflow/bug_fixer.go`
* **输入**: `BugReport` (包含 Ouroboros Dump JSON + 用户描述)。
* **逻辑**:
1. **解析 JSON**: 提取报错组件名（如 "Player"）作为关键词。
2. **L1 筛选**: 利用关键词在代码库中检索相关组件定义。
3. **Prompt 构建**: 将 JSON 压缩后放入 Context，不仅提供代码，还提供**运行时证据**。



---

**指令:**
本白皮书指导前端探针开发与后端工作流的对接。所有涉及到跨系统交互的字段定义，以此文档为准。