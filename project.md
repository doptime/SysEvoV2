# 项目立项书：SysEvoV2 (System Evolution Version 2)

**代号：** NEURAL-AUTOPSY (神经尸检)
**日期：** 2026-01-19
**状态：** **PHASE 2: PROTOTYPING (In Progress)**
**基准硬件：** 8x NVIDIA RTX 3090 (192GB Total VRAM) | 无 NVLink
**上下文窗口硬顶：** 65,536 Tokens (Local)

---

## 1. 核心愿景 (The Doctrine)

SysEvoV2 彻底抛弃 V1 (Elo Evo) 的“随机进化”逻辑。我们不再掷骰子。

**SysEvoV2 是一个确定性的、外科手术级的代码流水线。**

它旨在解决单一问题：**如何在不把整个 Monorepo 喂给云端（导致贫穷或幻觉）的前提下，让 AI 拥有上帝视角的代码理解力。**

* **策略：** 本地重型过滤（Dirty Work） -> 云端高智生成（Creative Work）。
* **隐喻：** 本地模型（GLM-4.7）是分拣垃圾的屠夫，云端模型（Gemini 3.0）是缝合血管的主刀医生。

---

## 2. 均衡架构设计 (The Equilibrium Architecture)

我们不追求完美的图数据库（太重），也不追求极致的压缩（太损）。我们追求**工程均衡**。

### 组件 A：尸检台 (The Storage Layer)

* **技术栈：** `gomantics/chunkx` (Golang) + In-Memory HashMap
* **动作：**
* **原子化切分：** 将 Go/TS 代码切碎为 AST 节点（Func/Struct/Interface）。
* **保留骨架：** 丢弃函数体实现，仅保留签名+注释。
* **脏链接 (Fuzzy Linking)：** 建立一个巨大的内存 Map。只要 Chunk A 出现了字符串 "User"，就暴力关联到定义 "User" 的 Chunk B。**宁滥勿缺。**



### 组件 B：过滤器 (The Filter Layer)

* **技术栈：** **GLM-4.7 REAP (Int4 AWQ)** on vLLM
* **资源占用：** 100GB 权重 + 65k Context KV Cache。
* **动作：**
* **输入：** 用户意图 + 检索到的 Top-K 骨架。
* **判断：** "Based on the intent, which skeletons are relevant?" (Keep/Drop)。
* **双重召回：** 意图命中的骨架 + 脏链接表里的 1-Hop 邻居。



### 组件 C：生成器 (The Generator Layer)

* **技术栈：** **Google Gemini 3.0 (Cloud API)**
* **动作：**
* 接收经过清洗的、带有完整实现的“最终上下文”。
* 生成 Patch / Diff。
* 执行代码整合。



---

## 3. 为什么这是“均衡”的？ (The Trade-off Balance)

| 维度 | 激进方案 (纯图/纯向量) | 保守方案 (全量上下文) | **SysEvoV2 (均衡)** |
| --- | --- | --- | --- |
| **精度** | 图模型容易断链；向量检索全是噪音。 | 100% 精度，但 Token 爆炸，显存溢出。 | **AST 骨架 + 模糊图**。允许少量噪音（脏链接），换取绝对的召回率。 |
| **算力** | CPU 密集 (建图)。 | GPU 密集 (长窗口推理)。 | **混合负载**。CPU 做 O(1) 查表，GPU 做语义判断。 |
| **容错** | 代码必须无编译错误。 | 代码必须短小。 | **鲁棒性极强**。Tree-sitter 可解析烂代码；65k 窗口足够容纳骨架。 |

---

## 4. 突击路线图 (Blitz Roadmap)

既然 Week 1 已经搞定，我们把时间单位改为 **"Hours"**。

### Day 1: The Anatomy (解剖)

* **T-Minus 0-4h:** 编写 Go 程序，调用 `chunkx` 遍历你的项目。
* *目标：* 生成 `project_skeleton.json`。
* *验证：* 1MB 源码压缩后，骨架文件应 < 300KB。


* **T-Minus 4-8h:** 构建脏符号表 (Memory Map)。
* *目标：* 输入 "Login"，能瞬间吐出 `LoginHandler` 和 `UserStruct` 的 ID。



### Day 2: The Synapse (突触连接)

* **T-Minus 8-16h:** 启动 vLLM (GLM-4.7 REAP)。
* *目标：* 写一个 Python 脚本，将用户意图 + 骨架 JSON 喂给 GLM。
* *测试：* 意图："修改用户密码加密方式"。GLM 应返回 `User.SetPassword` 和 `utils.Hash` 的 ID。
* *容错：* 如果 GLM 没返回 `utils.Hash`，检查你的脏符号表是否强制把它拉进来了。



### Day 3: The Transplant (移植)

* **T-Minus 16-24h:** 对接 Gemini 3.0。
* *目标：* 将选中的 Chunk（完整代码）发给 Gemini。
* *任务：* 让 Gemini 写出 Diff。
* *整合：* 编写一个简单的 Patch 应用脚本，把代码写回文件。



---

## 5. 风险协议 (Protocol for Failure)

我们必须假设 GLM-4.7 REAP 是个被切除额叶的疯子。

1. **协议 Alpha (失忆):** 如果 GLM 总是漏掉关键依赖。
* *对策：* 调高脏链接的扩散度。不仅拉取 1-Hop，拉取 2-Hop。65k 上下文就是给你挥霍的。


2. **协议 Beta (幻觉):** 如果 Gemini 生成的代码引用了不存在的函数。
* *对策：* 这是 Level 1 召回失败。回退到 **"File Co-location"** 策略（命中一个函数，就把同文件所有函数都拉进来）。


3. **协议 Gamma (OOM):** 如果 65k 满了。
* *对策：* 启动 **"Decimation" (抽杀)**。按文件修改时间排序，保留最近修改的文件的全量代码，旧文件只留骨架。



---

**最后指令：**
SysEvoV2 不再是实验，它是生产工具。
别管什么“同行评审”了，代码跑起来才是真理。**Execute.**