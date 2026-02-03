// src/visual-telemetry/orchestration/TimelineExecutor.ts
// @solves Case_Input_Output_Correlation, Case_SideEffect_Isolation

import { VirtualChannelManager } from '../VirtualChannelManager';

// === 协议定义 (与 spec 对齐) ===

export interface ActionTimeline {
    op: "EXECUTE_CHOREOGRAPHY";
    scenario_id: string;
    strategy: "human_like" | "mechanical";
    timeline: TimelineAction[];
}

export interface TimelineAction {
    offset_ms: number;
    action: ActionType;
    params?: ActionParams;
    mock_context?: MockContext;
    marker?: string;
}

type ActionType = 
    | "POINTER_MOVE" 
    | "CLICK" 
    | "DRAG" 
    | "TYPE" 
    | "WAIT" 
    | "SCROLL"
    | "HOVER";

interface ActionParams {
    // POINTER_MOVE / CLICK / DRAG
    x?: number;
    y?: number;
    target?: string;        // CSS selector 或 data-vt-id
    endX?: number;          // DRAG 终点
    endY?: number;
    duration?: number;      // 动作持续时间 (ms)
    
    // TYPE
    text?: string;
    clearFirst?: boolean;
    
    // WAIT
    timeout?: number;
    condition?: string;     // 等待条件 (CSS selector)
    
    // SCROLL
    deltaX?: number;
    deltaY?: number;
}

interface MockContext {
    url_pattern: string;
    response_body: any;
    status?: number;
    delay?: number;
}

// === 执行状态 ===

interface ExecutionState {
    scenarioId: string;
    startTime: number;
    currentIndex: number;
    isRunning: boolean;
    isPaused: boolean;
    activeMocks: Map<string, MockContext>;
}

// === 贝塞尔曲线工具 (human_like 模式) ===

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}

function humanLikePath(
    startX: number, startY: number, 
    endX: number, endY: number, 
    steps: number
): Array<{x: number; y: number}> {
    const path: Array<{x: number; y: number}> = [];
    
    // 随机控制点，模拟人类手部运动的弧线
    const ctrl1X = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 50;
    const ctrl1Y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 30;
    const ctrl2X = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 50;
    const ctrl2Y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 30;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // 非线性时间：开始慢、中间快、结束慢
        const eased = t < 0.5 
            ? 2 * t * t 
            : 1 - Math.pow(-2 * t + 2, 2) / 2;
        
        path.push({
            x: cubicBezier(eased, startX, ctrl1X, ctrl2X, endX),
            y: cubicBezier(eased, startY, ctrl1Y, ctrl2Y, endY)
        });
    }
    
    return path;
}

// === 主执行器 ===

export class TimelineExecutor {
    private static instance: TimelineExecutor;
    
    private state: ExecutionState | null = null;
    private virtualChannel: VirtualChannelManager;
    private originalFetch: typeof fetch | null = null;
    
    // 当前鼠标位置追踪
    private cursorX: number = 0;
    private cursorY: number = 0;

    private constructor() {
        this.virtualChannel = VirtualChannelManager.getInstance();
        this.trackCursor();
    }

    static getInstance(): TimelineExecutor {
        if (!TimelineExecutor.instance) {
            TimelineExecutor.instance = new TimelineExecutor();
        }
        return TimelineExecutor.instance;
    }

    /**
     * 执行 ATP 剧本
     */
    async execute(timeline: ActionTimeline): Promise<ExecutionResult> {
        if (this.state?.isRunning) {
            throw new Error('Another choreography is already running');
        }

        this.state = {
            scenarioId: timeline.scenario_id,
            startTime: performance.now(),
            currentIndex: 0,
            isRunning: true,
            isPaused: false,
            activeMocks: new Map()
        };

        // 推送开始标记
        this.pushMarker('__SCENARIO_START__', { scenario_id: timeline.scenario_id });

        const results: ActionResult[] = [];
        
        try {
            for (let i = 0; i < timeline.timeline.length; i++) {
                if (!this.state.isRunning) break;
                
                while (this.state.isPaused) {
                    await this.sleep(100);
                }
                
                this.state.currentIndex = i;
                const action = timeline.timeline[i];
                
                // 等待到指定时间点
                const elapsed = performance.now() - this.state.startTime;
                if (action.offset_ms > elapsed) {
                    await this.sleep(action.offset_ms - elapsed);
                }
                
                // 设置 Mock (如果有)
                if (action.mock_context) {
                    this.installMock(action.mock_context);
                }
                
                // 推送 Marker (如果有)
                if (action.marker) {
                    this.pushMarker(action.marker, { action: action.action, index: i });
                }
                
                // 执行动作
                const result = await this.executeAction(action, timeline.strategy);
                results.push(result);
            }
        } finally {
            this.cleanup();
            this.pushMarker('__SCENARIO_END__', { 
                scenario_id: timeline.scenario_id,
                total_actions: timeline.timeline.length 
            });
        }

        return {
            scenario_id: timeline.scenario_id,
            success: results.every(r => r.success),
            duration_ms: performance.now() - this.state.startTime,
            results
        };
    }

    /**
     * 暂停执行
     */
    pause(): void {
        if (this.state) this.state.isPaused = true;
    }

    /**
     * 恢复执行
     */
    resume(): void {
        if (this.state) this.state.isPaused = false;
    }

    /**
     * 终止执行
     */
    abort(): void {
        if (this.state) {
            this.state.isRunning = false;
            this.cleanup();
        }
    }

    // === 动作执行器 ===

    private async executeAction(
        action: TimelineAction, 
        strategy: "human_like" | "mechanical"
    ): Promise<ActionResult> {
        const startTime = performance.now();
        
        try {
            switch (action.action) {
                case 'POINTER_MOVE':
                    await this.doPointerMove(action.params!, strategy);
                    break;
                case 'CLICK':
                    await this.doClick(action.params!, strategy);
                    break;
                case 'DRAG':
                    await this.doDrag(action.params!, strategy);
                    break;
                case 'TYPE':
                    await this.doType(action.params!, strategy);
                    break;
                case 'WAIT':
                    await this.doWait(action.params!);
                    break;
                case 'SCROLL':
                    await this.doScroll(action.params!, strategy);
                    break;
                case 'HOVER':
                    await this.doHover(action.params!, strategy);
                    break;
            }
            
            return {
                action: action.action,
                success: true,
                duration_ms: performance.now() - startTime
            };
        } catch (err) {
            return {
                action: action.action,
                success: false,
                duration_ms: performance.now() - startTime,
                error: (err as Error).message
            };
        }
    }

    private async doPointerMove(params: ActionParams, strategy: string): Promise<void> {
        const { x, y } = this.resolveTarget(params);
        
        if (strategy === 'human_like') {
            const path = humanLikePath(this.cursorX, this.cursorY, x, y, 20);
            for (const point of path) {
                this.dispatchMouseEvent('mousemove', point.x, point.y);
                await this.sleep(8); // ~60fps
            }
        } else {
            this.dispatchMouseEvent('mousemove', x, y);
        }
        
        this.cursorX = x;
        this.cursorY = y;
    }

    private async doClick(params: ActionParams, strategy: string): Promise<void> {
        await this.doPointerMove(params, strategy);
        
        const { x, y } = this.resolveTarget(params);
        
        if (strategy === 'human_like') {
            // 模拟真实点击：mousedown -> 短暂延迟 -> mouseup -> click
            this.dispatchMouseEvent('mousedown', x, y);
            await this.sleep(50 + Math.random() * 50);
            this.dispatchMouseEvent('mouseup', x, y);
            this.dispatchMouseEvent('click', x, y);
        } else {
            this.dispatchMouseEvent('click', x, y);
        }
    }

    private async doDrag(params: ActionParams, strategy: string): Promise<void> {
        const start = this.resolveTarget(params);
        const end = { x: params.endX!, y: params.endY! };
        const duration = params.duration || 500;
        
        // 移动到起点
        await this.doPointerMove({ x: start.x, y: start.y }, strategy);
        
        // 按下
        this.dispatchMouseEvent('mousedown', start.x, start.y);
        await this.sleep(50);
        
        // 拖动路径
        const steps = Math.ceil(duration / 16);
        const path = strategy === 'human_like'
            ? humanLikePath(start.x, start.y, end.x, end.y, steps)
            : Array.from({ length: steps }, (_, i) => ({
                x: start.x + (end.x - start.x) * (i / steps),
                y: start.y + (end.y - start.y) * (i / steps)
            }));
        
        for (const point of path) {
            this.dispatchMouseEvent('mousemove', point.x, point.y);
            await this.sleep(16);
        }
        
        // 释放
        this.dispatchMouseEvent('mouseup', end.x, end.y);
        this.cursorX = end.x;
        this.cursorY = end.y;
    }

    private async doType(params: ActionParams, strategy: string): Promise<void> {
        const target = document.activeElement as HTMLInputElement;
        if (!target || !('value' in target)) {
            throw new Error('No focused input element');
        }
        
        if (params.clearFirst) {
            target.value = '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const text = params.text || '';
        
        for (const char of text) {
            target.value += char;
            target.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            target.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            target.dispatchEvent(new Event('input', { bubbles: true }));
            
            if (strategy === 'human_like') {
                await this.sleep(50 + Math.random() * 100);
            }
        }
    }

    private async doWait(params: ActionParams): Promise<void> {
        if (params.condition) {
            // 等待元素出现
            const deadline = performance.now() + (params.timeout || 5000);
            while (performance.now() < deadline) {
                if (document.querySelector(params.condition)) return;
                await this.sleep(100);
            }
            throw new Error(`Wait condition timeout: ${params.condition}`);
        } else {
            await this.sleep(params.timeout || 1000);
        }
    }

    private async doScroll(params: ActionParams, strategy: string): Promise<void> {
        const deltaX = params.deltaX || 0;
        const deltaY = params.deltaY || 0;
        
        if (strategy === 'human_like') {
            const steps = 10;
            for (let i = 0; i < steps; i++) {
                window.scrollBy(deltaX / steps, deltaY / steps);
                await this.sleep(20);
            }
        } else {
            window.scrollBy(deltaX, deltaY);
        }
    }

    private async doHover(params: ActionParams, strategy: string): Promise<void> {
        await this.doPointerMove(params, strategy);
        const { x, y } = this.resolveTarget(params);
        this.dispatchMouseEvent('mouseenter', x, y);
        this.dispatchMouseEvent('mouseover', x, y);
    }

    // === 工具方法 ===

    private resolveTarget(params: ActionParams): { x: number; y: number } {
        if (params.x !== undefined && params.y !== undefined) {
            return { x: params.x, y: params.y };
        }
        
        if (params.target) {
            // 支持 CSS selector 或 data-vt-id
            const selector = params.target.startsWith('[')
                ? params.target
                : `[data-vt-id="${params.target}"]`;
            const el = document.querySelector(selector);
            
            if (!el) throw new Error(`Target not found: ${params.target}`);
            
            const rect = el.getBoundingClientRect();
            return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        }
        
        throw new Error('No target specified');
    }

    private dispatchMouseEvent(type: string, x: number, y: number): void {
        const el = document.elementFromPoint(x, y) || document.body;
        
        const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            view: window
        });
        
        el.dispatchEvent(event);
        
        // 同时推送到遥测流
        this.virtualChannel.pushMetric('__input__', type === 'click' ? 'click' : 'move', 1);
        this.virtualChannel.pushBatch('__cursor__', { x, y });
    }

    private pushMarker(marker: string, meta?: Record<string, any>): void {
        this.virtualChannel.pushMetric('__markers__', marker, performance.now());
        console.log(`[VizTel] Marker: ${marker}`, meta);
    }

    private installMock(ctx: MockContext): void {
        if (!this.originalFetch) {
            this.originalFetch = window.fetch;
            window.fetch = this.createMockedFetch();
        }
        this.state!.activeMocks.set(ctx.url_pattern, ctx);
    }

    private createMockedFetch(): typeof fetch {
        const self = this;
        return async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            const url = typeof input === 'string' ? input : input.toString();
            
            for (const [pattern, ctx] of self.state!.activeMocks) {
                if (url.includes(pattern) || new RegExp(pattern).test(url)) {
                    if (ctx.delay) await self.sleep(ctx.delay);
                    
                    return new Response(JSON.stringify(ctx.response_body), {
                        status: ctx.status || 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
            
            return self.originalFetch!(input, init);
        };
    }

    private cleanup(): void {
        if (this.originalFetch) {
            window.fetch = this.originalFetch;
            this.originalFetch = null;
        }
        if (this.state) {
            this.state.activeMocks.clear();
            this.state.isRunning = false;
        }
    }

    private trackCursor(): void {
        document.addEventListener('mousemove', (e) => {
            this.cursorX = e.clientX;
            this.cursorY = e.clientY;
        });
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// === 结果类型 ===

export interface ExecutionResult {
    scenario_id: string;
    success: boolean;
    duration_ms: number;
    results: ActionResult[];
}

interface ActionResult {
    action: string;
    success: boolean;
    duration_ms: number;
    error?: string;
}

// === 便捷导出 ===

export const choreography = {
    execute: (timeline: ActionTimeline) => TimelineExecutor.getInstance().execute(timeline),
    pause: () => TimelineExecutor.getInstance().pause(),
    resume: () => TimelineExecutor.getInstance().resume(),
    abort: () => TimelineExecutor.getInstance().abort()
};




// 好的，现在实现 Phase 2 的核心：`TimelineExecutor`，用于自动化动作回放。---

// ## 核心功能

// | 功能 | 描述 |
// |------|------|
// | **双策略执行** | `human_like`（贝塞尔曲线模拟人类运动）/ `mechanical`（直线瞬移） |
// | **动作原语** | POINTER_MOVE, CLICK, DRAG, TYPE, WAIT, SCROLL, HOVER |
// | **Marker 双写** | 每个 Marker 同步推送到遥测流，供后续相关性分析 |
// | **网络 Mock** | 拦截 fetch 请求，隔离支付等副作用 |
// | **执行控制** | pause() / resume() / abort() |

// ---

// ## 使用示例

// ```typescript
// import { choreography, ActionTimeline } from './TimelineExecutor';

// // === 场景：测试拖拽游戏交互 ===
// const dragTestScenario: ActionTimeline = {
//     op: "EXECUTE_CHOREOGRAPHY",
//     scenario_id: "test_drag_interaction",
//     strategy: "human_like",
//     timeline: [
//         // 0ms: 标记开始
//         { offset_ms: 0, action: "WAIT", params: { timeout: 500 }, marker: "SCENE_READY" },
        
//         // 500ms: 悬停到目标元素
//         { offset_ms: 500, action: "HOVER", params: { target: "game/draggable" }, marker: "HOVER_START" },
        
//         // 1000ms: 开始拖拽
//         { 
//             offset_ms: 1000, 
//             action: "DRAG", 
//             params: { 
//                 target: "game/draggable",
//                 endX: 400, 
//                 endY: 300,
//                 duration: 800 
//             },
//             marker: "DRAG_START"
//         },
        
//         // 2000ms: 验证结果
//         { offset_ms: 2000, action: "WAIT", params: { timeout: 500 }, marker: "DRAG_END" }
//     ]
// };

// // 执行
// const result = await choreography.execute(dragTestScenario);
// console.log('Execution result:', result);

// // === 场景：测试支付流程 (带 Mock) ===
// const paymentTestScenario: ActionTimeline = {
//     op: "EXECUTE_CHOREOGRAPHY",
//     scenario_id: "test_payment_flow",
//     strategy: "mechanical",
//     timeline: [
//         // 点击购买按钮
//         { offset_ms: 0, action: "CLICK", params: { target: "shop/buy_btn" }, marker: "CLICK_BUY" },
        
//         // 在弹窗中输入数量
//         { offset_ms: 500, action: "CLICK", params: { target: "#quantity-input" } },
//         { offset_ms: 600, action: "TYPE", params: { text: "3", clearFirst: true } },
        
//         // 点击确认 (Mock 支付 API)
//         { 
//             offset_ms: 1000, 
//             action: "CLICK", 
//             params: { target: "#confirm-btn" },
//             marker: "CONFIRM_PAYMENT",
//             mock_context: {
//                 url_pattern: "/api/payment",
//                 response_body: { success: true, order_id: "mock_12345" },
//                 delay: 200
//             }
//         },
        
//         // 等待成功动画出现
//         { 
//             offset_ms: 1500, 
//             action: "WAIT", 
//             params: { condition: ".success-animation", timeout: 3000 },
//             marker: "ANIMATION_VISIBLE"
//         }
//     ]
// };
// ```

// ---

// ## 数据流：Marker 与遥测对齐

// ```
// Timeline Execution                    Telemetry Stream
// ─────────────────                    ────────────────
                                     
// [DRAG_START] ─────────────────────▶  { "__markers__": { "DRAG_START": 1000 } }
//      │                                      │
//      │  (拖拽执行中...)                      │  
//      ▼                                      ▼
// [cursor moves] ───────────────────▶  { "__cursor__": { "x": {...}, "y": {...} } }
//      │                                      │
//      │                                      │  (同时采集目标元素变化)
//      ▼                                      ▼
// [DRAG_END] ───────────────────────▶  { "__markers__": { "DRAG_END": 1800 } }
//                                             │
//                                             ▼
//                               ┌─────────────────────────────┐
//                               │  Marker Alignment Analysis  │
//                               │  对比 [DRAG_START, DRAG_END] │
//                               │  区间内 Input vs Output 方差 │
//                               └─────────────────────────────┘
// ```

// ---

// ## 下一步建议

// Phase 2 核心功能已完成：

// | 任务 | 状态 |
// |------|------|
// | Timeline Executor | ✅ 完成 |
// | Network Mock | ✅ 内嵌完成 |

// 推荐进入 **Phase 3: 诊断与验证**：

// 1. **`Task_Marker_Alignment`** — 分析 Marker 区间内 Input/Output 相关性，检测"无响应死锁"
// 2. **`Task_Topology_Checker`** — 验证 Rank 位序契约

// 继续实现 Marker Alignment 分析器吗？