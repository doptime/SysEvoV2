// src/visual-telemetry/orchestration/TimelineExecutor.ts
// [Manifest]
// Role: The Actor (Phase 2)
// Philosophy: "Action is the seed of Causality. Markers are the timestamps of Intent."
// @solves Case_Input_Output_Correlation, Case_SideEffect_Isolation

import { VirtualChannelManager } from '../VirtualChannelManager';

// === Protocol Definitions (ATP) ===

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
    
    // [Isolation] 副作用隔离配置
    mock_context?: MockContext;
    
    // [Causality] 诊断标记 (Input Truth)
    marker?: string;
}

type ActionType = 
    | "POINTER_MOVE" | "CLICK" | "DRAG" | "TYPE" | "WAIT" | "SCROLL" | "HOVER";

interface ActionParams {
    // Spatial
    x?: number; y?: number;
    target?: string;        // selector or data-vt-id
    endX?: number; endY?: number;
    
    // Temporal
    duration?: number;
    
    // Content
    text?: string;
    clearFirst?: boolean;
    
    // Condition
    timeout?: number;
    condition?: string;
}

interface MockContext {
    url_pattern: string;
    response_body: any;
    status?: number;
    delay?: number;
}

interface ExecutionState {
    scenarioId: string;
    startTime: number;
    isRunning: boolean;
    isPaused: boolean;
    activeMocks: Map<string, MockContext>;
}

// === Math Utilities (For Human-like Movement) ===

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}

function humanLikePath(startX: number, startY: number, endX: number, endY: number, steps: number): Array<{x: number, y: number}> {
    const path: Array<{x: number, y: number}> = [];
    // 随机扰动控制点，模拟手抖
    const ctrl1X = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 50;
    const ctrl1Y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 30;
    const ctrl2X = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 50;
    const ctrl2Y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 30;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Ease-in-out
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        path.push({
            x: cubicBezier(eased, startX, ctrl1X, ctrl2X, endX),
            y: cubicBezier(eased, startY, ctrl1Y, ctrl2Y, endY)
        });
    }
    return path;
}

// === Main Executor ===

export class TimelineExecutor {
    private static instance: TimelineExecutor;
    
    private state: ExecutionState | null = null;
    private virtualChannel: VirtualChannelManager;
    
    // Environment Control
    private originalFetch: typeof fetch | null = null;
    
    // Cursor Tracking (Internal State)
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
     * [Core] 执行剧本
     * 这是一个原子操作，执行期间会接管 Input 和 Network。
     */
    async execute(timeline: ActionTimeline): Promise<boolean> {
        if (this.state?.isRunning) {
            console.warn('[Timeline] Busy. Aborting previous run.');
            this.abort();
        }

        this.state = {
            scenarioId: timeline.scenario_id,
            startTime: performance.now(),
            isRunning: true,
            isPaused: false,
            activeMocks: new Map()
        };

        // Start Marker
        this.pushMarker('__SCENARIO_START__', { id: timeline.scenario_id });

        try {
            for (const step of timeline.timeline) {
                if (!this.state.isRunning) break;
                
                // Pause Control
                while (this.state.isPaused) await this.sleep(100);

                // Time Alignment
                const now = performance.now();
                const targetTime = this.state.startTime + step.offset_ms;
                if (targetTime > now) {
                    await this.sleep(targetTime - now);
                }

                // Apply Mocks
                if (step.mock_context) {
                    this.installMock(step.mock_context);
                }

                // Inject Marker (Truth Injection)
                if (step.marker) {
                    this.pushMarker(step.marker, { action: step.action });
                }

                // Execute Action
                await this.dispatchAction(step, timeline.strategy);
            }
        } catch (e) {
            console.error('[Timeline] Execution Failed:', e);
            this.pushMarker('__SCENARIO_ERROR__', { error: String(e) });
            return false;
        } finally {
            this.pushMarker('__SCENARIO_END__', { id: timeline.scenario_id });
            this.cleanup();
        }

        return true;
    }

    abort() {
        if (this.state) {
            this.state.isRunning = false;
            this.cleanup();
        }
    }

    // === Action Dispatcher ===

    private async dispatchAction(step: TimelineAction, strategy: "human_like" | "mechanical") {
        const params = step.params || {};
        
        switch (step.action) {
            case 'POINTER_MOVE':
                await this.moveCursor(params, strategy);
                break;
            case 'CLICK':
                await this.moveCursor(params, strategy);
                this.simulateClick(this.cursorX, this.cursorY);
                break;
            case 'DRAG':
                await this.simulateDrag(params, strategy);
                break;
            case 'TYPE':
                await this.simulateType(params, strategy);
                break;
            case 'WAIT':
                await this.wait(params);
                break;
            // ... SCROLL, HOVER implementation similar
        }
    }

    // === Simulation Primitives ===

    private async moveCursor(params: ActionParams, strategy: string) {
        const target = this.resolveCoordinates(params);
        if (!target) return;

        if (strategy === 'human_like') {
            const path = humanLikePath(this.cursorX, this.cursorY, target.x, target.y, 20); // ~300ms
            for (const p of path) {
                this.dispatchMouseEvent('mousemove', p.x, p.y);
                this.cursorX = p.x; 
                this.cursorY = p.y;
                await this.sleep(16); // 60fps
            }
        } else {
            this.dispatchMouseEvent('mousemove', target.x, target.y);
            this.cursorX = target.x;
            this.cursorY = target.y;
        }
    }

    private simulateClick(x: number, y: number) {
        this.dispatchMouseEvent('mousedown', x, y);
        this.dispatchMouseEvent('mouseup', x, y);
        this.dispatchMouseEvent('click', x, y);
        
        // [Causality] 记录物理点击事件到遥测流
        this.virtualChannel.pushMetric('__input__', 'click', 1);
    }

    private async simulateDrag(params: ActionParams, strategy: string) {
        const start = this.resolveCoordinates(params);
        if (!start || params.endX === undefined || params.endY === undefined) return;

        // Move to start
        await this.moveCursor({ x: start.x, y: start.y }, strategy);
        
        // Down
        this.dispatchMouseEvent('mousedown', start.x, start.y);
        
        // Move to end
        const duration = params.duration || 500;
        const steps = Math.max(10, Math.floor(duration / 16));
        
        const path = strategy === 'human_like'
            ? humanLikePath(start.x, start.y, params.endX, params.endY, steps)
            : this.linearPath(start.x, start.y, params.endX, params.endY, steps);

        for (const p of path) {
            this.dispatchMouseEvent('mousemove', p.x, p.y);
            this.cursorX = p.x;
            this.cursorY = p.y;
            await this.sleep(16);
        }

        // Up
        this.dispatchMouseEvent('mouseup', this.cursorX, this.cursorY);
    }

    private async simulateType(params: ActionParams, strategy: string) {
        const el = document.activeElement as HTMLInputElement;
        if (!el || typeof el.value === 'undefined') return;
        
        if (params.clearFirst) el.value = '';
        const text = params.text || '';

        for (const char of text) {
            el.value += char;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            if (strategy === 'human_like') await this.sleep(50 + Math.random() * 100);
        }
    }

    private async wait(params: ActionParams) {
        if (params.timeout) await this.sleep(params.timeout);
        if (params.condition) {
            // Simple polling for selector
            const start = performance.now();
            while (!document.querySelector(params.condition)) {
                if (performance.now() - start > 5000) throw new Error('Wait timeout');
                await this.sleep(100);
            }
        }
    }

    // === Side-Effect Isolation (Mocking) ===

    private installMock(ctx: MockContext) {
        if (!this.originalFetch) {
            this.originalFetch = window.fetch;
            // Override Fetch
            window.fetch = async (input, init) => {
                const url = input.toString();
                // Check active mocks
                for (const [pattern, mock] of this.state?.activeMocks || []) {
                    if (url.includes(pattern)) {
                        console.log(`[Timeline] Mock hit: ${url}`);
                        if (mock.delay) await this.sleep(mock.delay);
                        return new Response(JSON.stringify(mock.response_body), {
                            status: mock.status || 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
                // Fallback to original
                return this.originalFetch!(input, init);
            };
        }
        this.state?.activeMocks.set(ctx.url_pattern, ctx);
    }

    private cleanup() {
        if (this.originalFetch) {
            window.fetch = this.originalFetch;
            this.originalFetch = null;
        }
        this.state = null;
    }

    // === Helpers ===

    private dispatchMouseEvent(type: string, x: number, y: number) {
        const el = document.elementFromPoint(x, y) || document.body;
        el.dispatchEvent(new MouseEvent(type, {
            bubbles: true, clientX: x, clientY: y, view: window
        }));
        
        // [Causality] 记录游标位置
        if (type === 'mousemove') {
            // 使用 pushBatch 减少调用频次
            // 这里的 id '__cursor__' 是系统保留字
            this.virtualChannel.pushBatch('__cursor__', { x, y });
        }
    }

    private pushMarker(name: string, meta: any) {
        // Marker 本质上是一个时间戳信号，但在 Meta 中可以携带更多信息
        // 为了兼容 K 线，我们把 timestamp 作为 Value
        this.virtualChannel.pushMetric('__markers__', name, performance.now());
    }

    private resolveCoordinates(params: ActionParams): {x: number, y: number} | null {
        if (params.x !== undefined && params.y !== undefined) return { x: params.x, y: params.y };
        if (params.target) {
            const selector = params.target.startsWith('[') ? params.target : `[data-vt-id="${params.target}"]`;
            const el = document.querySelector(selector);
            if (el) {
                const rect = el.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
        }
        return null;
    }

    private linearPath(x1: number, y1: number, x2: number, y2: number, steps: number) {
        const path = [];
        for (let i = 0; i <= steps; i++) {
            path.push({
                x: x1 + (x2 - x1) * (i / steps),
                y: y1 + (y2 - y1) * (i / steps)
            });
        }
        return path;
    }

    private trackCursor() {
        document.addEventListener('mousemove', e => {
            // Only track when not running orchestration to update initial pos
            if (!this.state?.isRunning) {
                this.cursorX = e.clientX;
                this.cursorY = e.clientY;
            }
        });
    }

    private sleep(ms: number) {
        return new Promise(r => setTimeout(r, ms));
    }
}

// === Exports ===
export const choreography = TimelineExecutor.getInstance();