// src/visual-telemetry/orchestration/TimelineExecutor.ts
// [Manifest]
// Role: The Actor (Phase 2)
// Philosophy: "Action is the seed of Causality. Markers are the timestamps of Intent."
// @solves Case_Input_Output_Correlation, Case_SideEffect_Isolation, Case_Singleton_Parallelism

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

// 使用 Symbol 确保原始 Fetch 的引用在全局是唯一的且不可篡改
const FETCH_ORIGINAL = Symbol('VizTelFetchOriginal');

// === Math Utilities (For Human-like Movement) ===

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const u = 1 - t;
    return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}

function humanLikePath(startX: number, startY: number, endX: number, endY: number, steps: number): Array<{x: number, y: number}> {
    const path: Array<{x: number, y: number}> = [];
    const ctrl1X = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 50;
    const ctrl1Y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 30;
    const ctrl2X = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 50;
    const ctrl2Y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 30;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
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
    
    // Cursor Tracking (Internal State)
    private cursorX: number = 0;
    private cursorY: number = 0;

    // @fix Case_Singleton_Parallelism: 允许注入 Channel 以支持并行测试隔离
    public constructor(channel?: VirtualChannelManager) {
        this.virtualChannel = channel || VirtualChannelManager.getInstance();
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

        // Start Marker: 显式注入因果起始
        this.pushMarker('__SCENARIO_START__', { id: timeline.scenario_id });

        try {
            for (const step of timeline.timeline) {
                if (!this.state.isRunning) break;
                
                while (this.state.isPaused) await this.sleep(100);

                const now = performance.now();
                const targetTime = this.state.startTime + step.offset_ms;
                if (targetTime > now) {
                    await this.sleep(targetTime - now);
                }

                if (step.mock_context) {
                    this.installMock(step.mock_context);
                }

                if (step.marker) {
                    this.pushMarker(step.marker, { action: step.action });
                }

                await this.dispatchAction(step, timeline.strategy);
            }
        } catch (e) {
            console.error('[Timeline] Execution Failed:', e);
            this.pushMarker('__SCENARIO_ERROR__', { error: String(e) });
            return false;
        } finally {
            // @fix Case_No_Completion_Signal: 无论成败，必须发送结束标记
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
        }
    }

    // === Simulation Primitives ===

    private async moveCursor(params: ActionParams, strategy: string) {
        const target = this.resolveCoordinates(params);
        if (!target) return;

        if (strategy === 'human_like') {
            const path = humanLikePath(this.cursorX, this.cursorY, target.x, target.y, 20); 
            for (const p of path) {
                this.dispatchMouseEvent('mousemove', p.x, p.y);
                this.cursorX = p.x; 
                this.cursorY = p.y;
                await this.sleep(16);
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
        this.virtualChannel.pushMetric('__input__', 'click', 1);
    }

    private async simulateDrag(params: ActionParams, strategy: string) {
        const start = this.resolveCoordinates(params);
        if (!start || params.endX === undefined || params.endY === undefined) return;

        await this.moveCursor({ x: start.x, y: start.y }, strategy);
        this.dispatchMouseEvent('mousedown', start.x, start.y);
        
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
            const start = performance.now();
            while (!document.querySelector(params.condition)) {
                if (performance.now() - start > 5000) throw new Error('Wait timeout');
                await this.sleep(100);
            }
        }
    }

    // === Side-Effect Isolation (Mocking) ===

    /**
     * [Isolation] 劫持 Fetch
     * @fix Case_Fetch_Mock_Leak: 使用 Symbol 永久保存原始引用，防止劫持链条断裂
     */
    private installMock(ctx: MockContext) {
        const win = window as any;
        
        // 1. 记录原始 Fetch (仅在第一次劫持时)
        if (!win[FETCH_ORIGINAL]) {
            win[FETCH_ORIGINAL] = win.fetch;
        }

        // 2. 覆盖全局 Fetch
        win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input.toString();
            // 实时检查当前状态中的 Mock 映射
            for (const [pattern, mock] of this.state?.activeMocks || []) {
                if (url.includes(pattern)) {
                    if (mock.delay) await this.sleep(mock.delay);
                    return new Response(JSON.stringify(mock.response_body), {
                        status: mock.status || 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
            // Fallback 到 Symbol 指向的真实原生 Fetch
            return win[FETCH_ORIGINAL](input, init);
        };
        
        this.state?.activeMocks.set(ctx.url_pattern, ctx);
    }

    private cleanup() {
        // @fix Case_Fetch_Mock_Leak: 强制归还原生 Fetch
        const win = window as any;
        if (win[FETCH_ORIGINAL]) {
            win.fetch = win[FETCH_ORIGINAL];
        }
        this.state = null;
    }

    // === Helpers ===

    private dispatchMouseEvent(type: string, x: number, y: number) {
        const el = document.elementFromPoint(x, y) || document.body;
        el.dispatchEvent(new MouseEvent(type, {
            bubbles: true, clientX: x, clientY: y, view: window
        }));
        
        if (type === 'mousemove') {
            this.virtualChannel.pushBatch('__cursor__', { x, y });
        }
    }

    private pushMarker(name: string, meta: any) {
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