// src/visual-telemetry/DOMTelemetryRuntime.ts
// [Manifest]
// Role: The Sensing Engine (Phase 1)
// Philosophy: "Code is Context. The runtime is the sole source of visual truth."

import { computeVisualWeight, ElementPhysicalState } from './VisualAttentionModel';
import { TelemetryFrame, AggregatedMetric, ElementTelemetry } from './TelemetryPayloadSchema';
import { VirtualChannelManager } from './VirtualChannelManager';

interface ExtendedElementTelemetry extends ElementTelemetry {
    a?: Record<string, AggregatedMetric>;
}

interface RuntimeContext {
    element: HTMLElement;
    lastWeight: number;
    bufferWeight: AggregatedMetric;
    bufferRank: AggregatedMetric;
    watchedAttrs: string[]; 
    bufferAttrs: Record<string, AggregatedMetric>;
}

interface UnifiedTelemetryFrame extends TelemetryFrame {
    sources: ('dom' | 'virtual')[];
}

export class DOMTelemetryRuntime {
    private static instance: DOMTelemetryRuntime;
    private registry: Map<string, RuntimeContext> = new Map();
    private virtualChannel: VirtualChannelManager;
    
    private isActive: boolean = false;
    private observer: MutationObserver | null = null;
    private rafId: number | null = null;
    private lastFlushTime: number = 0;
    private readonly FLUSH_INTERVAL_MS = 100;

    private constructor() {
        this.virtualChannel = VirtualChannelManager.getInstance();
        // @fix: 使用箭头函数确保上下文
        this.observer = new MutationObserver(this.handleMutations);
    }

    static getInstance(): DOMTelemetryRuntime {
        if (!DOMTelemetryRuntime.instance) DOMTelemetryRuntime.instance = new DOMTelemetryRuntime();
        return DOMTelemetryRuntime.instance;
    }

    public start() {
        if (this.isActive) return;
        this.isActive = true;
        this.scanAndRegister(document.body);
        this.observer?.observe(document.body, {
            childList: true, subtree: true, attributes: true, 
            attributeFilter: ['data-vt-id', 'data-vt-watch', 'style', 'class']
        });
        this.lastFlushTime = performance.now();
        this.tick();
    }

    public stop() {
        this.isActive = false;
        if (this.observer) this.observer.disconnect();
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        // @fix: 停止时清理注册表，防止持有 DOM 引用导致内存泄露
        this.registry.clear();
    }

    // === Core Logic ===

    private handleMutations = (mutations: MutationRecord[]) => {
        mutations.forEach(m => {
            if (m.type === 'childList') {
                m.addedNodes.forEach(n => n instanceof HTMLElement && this.scanAndRegister(n));
                m.removedNodes.forEach(n => n instanceof HTMLElement && this.tryUnregister(n));
            } else if (m.type === 'attributes' && m.target instanceof HTMLElement) {
                this.tryRegister(m.target);
            }
        });
    }

    private tick = () => {
        if (!this.isActive) return;
        const now = performance.now();
        const viewport = { w: window.innerWidth, h: window.innerHeight };
        const snapshot: { id: string; weight: number }[] = [];
        
        this.registry.forEach((ctx, id) => {
            // @fix: 惰性清理 (防漏网之鱼)
            if (!ctx.element.isConnected) {
                this.registry.delete(id);
                return;
            }

            const rect = ctx.element.getBoundingClientRect();
            const style = window.getComputedStyle(ctx.element);
            const opacity = parseFloat(style.opacity || '1');
            const zIndex = parseInt(style.zIndex || '0', 10) || 0;

            const weight = computeVisualWeight({
                width: rect.width, height: rect.height, x: rect.x, y: rect.y,
                opacity, zIndex, viewportW: viewport.w, viewportH: viewport.h
            });

            ctx.lastWeight = weight;
            snapshot.push({ id, weight });

            // 属性采样
            ctx.watchedAttrs.forEach(attr => {
                let val = 0;
                if (attr === 'rotation') val = this.parseRotation(style.transform);
                else if (attr === 'scale') val = this.parseScale(style.transform);
                else {
                    const sVal = (style as any)[attr];
                    val = parseFloat(sVal) || 0;
                }
                this.updateMetric(ctx.bufferAttrs[attr], val);
            });
        });

        // Ranking
        snapshot.sort((a, b) => b.weight - a.weight);
        snapshot.forEach((item, index) => {
            const ctx = this.registry.get(item.id);
            if (ctx) {
                this.updateMetric(ctx.bufferWeight, item.weight);
                this.updateMetric(ctx.bufferRank, item.weight > 0 ? index + 1 : -1);
            }
        });

        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flush(now);
            this.lastFlushTime = now;
        }
        this.rafId = requestAnimationFrame(this.tick);
    }

    private flush(ts: number) {
        const payload: UnifiedTelemetryFrame = {
            ts: Math.floor(ts), dur: this.FLUSH_INTERVAL_MS,
            sources: [], data: {}
        };

        // DOM 数据提取
        this.registry.forEach((ctx, id) => {
            if (ctx.bufferWeight.o !== -1) {
                const node: ExtendedElementTelemetry = {
                    w: { ...ctx.bufferWeight },
                    r: { ...ctx.bufferRank }
                };
                if (ctx.watchedAttrs.length > 0) {
                    node.a = {};
                    ctx.watchedAttrs.forEach(a => {
                        node.a![a] = { ...ctx.bufferAttrs[a] };
                        ctx.bufferAttrs[a] = this.createEmptyMetric();
                    });
                }
                payload.data[id] = node;
                ctx.bufferWeight = this.createEmptyMetric();
                ctx.bufferRank = this.createEmptyMetric();
            }
        });

        if (Object.keys(payload.data).length > 0) payload.sources.push('dom');

        // Virtual Channel 合流
        const vData = this.virtualChannel.harvest();
        if (Object.keys(vData).length > 0) {
            payload.sources.push('virtual');
            for (const [tid, metrics] of Object.entries(vData)) {
                const target = (payload.data[tid] || { a: {} }) as ExtendedElementTelemetry;
                target.a = { ...target.a, ...metrics };
                payload.data[tid] = target;
            }
        }

        if (payload.sources.length > 0) {
            const tunnel = (window as any).__OUROBOROS_TUNNEL__ || (window as any).telemetryTunnel;
            tunnel?.(JSON.stringify(payload));
        }
    }

    // === Helpers ===

    private updateMetric(metric: AggregatedMetric, val: number) {
        if (metric.o === -1) metric.o = metric.h = metric.l = metric.c = val;
        else {
            metric.c = val;
            if (val > metric.h) metric.h = val;
            if (val < metric.l) metric.l = val;
        }
    }

    private createEmptyMetric = (): AggregatedMetric => ({ o: -1, h: -1, l: -1, c: -1 });

    private scanAndRegister(root: HTMLElement) {
        if (root.dataset.vtId) this.tryRegister(root);
        root.querySelectorAll<HTMLElement>('[data-vt-id]').forEach(el => this.tryRegister(el));
    }

    private tryRegister(el: HTMLElement) {
        const id = el.dataset.vtId;
        if (!id) return;
        const watch = el.dataset.vtWatch?.split(',').filter(Boolean) || [];
        const ctx = this.registry.get(id);
        if (ctx) {
            ctx.watchedAttrs = watch;
            return;
        }
        const bufferAttrs: Record<string, AggregatedMetric> = {};
        watch.forEach(a => bufferAttrs[a] = this.createEmptyMetric());
        this.registry.set(id, {
            element: el, lastWeight: 0,
            bufferWeight: this.createEmptyMetric(),
            bufferRank: this.createEmptyMetric(),
            watchedAttrs: watch, bufferAttrs
        });
    }

    private tryUnregister(node: Node) {
        if (!(node instanceof HTMLElement)) return;
        const id = node.dataset.vtId;
        if (id) this.registry.delete(id);
        node.querySelectorAll('[data-vt-id]').forEach(el => {
            const subId = (el as HTMLElement).dataset.vtId;
            if (subId) this.registry.delete(subId);
        });
    }

    private parseRotation(t: string): number {
        if (!t || t === 'none') return 0;
        const p = t.split('(')[1].split(')')[0].split(',');
        return Math.round(Math.atan2(parseFloat(p[1]), parseFloat(p[0])) * (180 / Math.PI));
    }

    private parseScale(t: string): number {
        if (!t || t === 'none') return 1;
        const p = t.split('(')[1].split(')')[0].split(',');
        return Math.sqrt(Math.pow(parseFloat(p[0]), 2) + Math.pow(parseFloat(p[1]), 2));
    }
}