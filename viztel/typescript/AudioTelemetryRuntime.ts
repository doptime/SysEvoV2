// src/visual-telemetry/AudioTelemetryRuntime.ts
// [Manifest]
// Role: The Ear (Sensing Phase)
// Philosophy: "Sound is Data. Silence is a Signal."
// @solves Case_Headless_Deafness, Case_AV_Desync

import { AggregatedMetric } from './TelemetryPayloadSchema';
import { VirtualChannelManager } from './VirtualChannelManager';

/**
 * 音频遥测运行时
 * 负责实时分析 AudioContext 的能量输出，生成听觉 K 线。
 */
export class AudioTelemetryRuntime {
    private static instance: AudioTelemetryRuntime;
    
    // Web Audio API 引用
    private context: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private dataArray: Uint8Array | null = null;
    
    // 运行状态
    private isActive: boolean = false;
    private rafId: number | null = null;
    
    // 采样配置
    private readonly FFT_SIZE = 256; // 低精度足以捕捉能量，性能开销小
    private readonly FLUSH_INTERVAL_MS = 100; // 10Hz 采样率 (与 Visual 对齐)
    private lastFlushTime: number = 0;

    // K 线缓冲区 (OHLC)
    private bufferRMS: AggregatedMetric;
    private bufferPeak: AggregatedMetric;

    private constructor() {
        this.bufferRMS = this.createEmptyMetric();
        this.bufferPeak = this.createEmptyMetric();
    }

    static getInstance(): AudioTelemetryRuntime {
        if (!AudioTelemetryRuntime.instance) {
            AudioTelemetryRuntime.instance = new AudioTelemetryRuntime();
        }
        return AudioTelemetryRuntime.instance;
    }

    /**
     * [Hook] 挂载到现有的 AudioContext
     * 建议在游戏初始化 Audio 系统时调用。
     * * @param ctx 目标 AudioContext
     * @param masterNode (可选) 主音量节点。如果不传，将尝试连接到 destination (可能无效，视浏览器策略而定)
     */
    public attach(ctx: AudioContext, masterNode?: AudioNode) {
        if (this.context === ctx) return;
        this.context = ctx;

        // 1. 创建分析器
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = this.FFT_SIZE;
        this.analyser.smoothingTimeConstant = 0.3; // 适度平滑
        
        // 预分配内存，避免 GC
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        // 2. 连接图谱
        // 理想情况: Source -> MasterGain -> [Analyser] -> Destination
        if (masterNode) {
            // 如果提供了主节点，分流连接 (Fan-out)
            masterNode.connect(this.analyser);
        } else {
            // 尝试拦截: 这是一个简化的假设，实际中通常需要业务层显式 connect
            console.warn('[VizTel] AudioTelemetry attached without master node. You must connect your master gain to AudioTelemetry.getInput()');
        }
        
        console.log('[VizTel] Audio Runtime attached.');
    }

    /**
     * [API] 获取输入节点
     * 业务层应将最终输出 connect 到此节点，以便进行分析。
     * 该节点会自动透传到 destination (如果需要) 或者仅仅作为旁路分析。
     * 这里设计为旁路模式 (Sidecar)，不影响原声音输出。
     */
    public getInput(): AnalyserNode | null {
        return this.analyser;
    }

    /**
     * [Lifecycle] 启动监听循环
     */
    public start() {
        if (this.isActive) return;
        
        if (!this.context) {
            console.warn('[VizTel] Cannot start AudioTelemetry: No AudioContext attached.');
            return;
        }

        this.isActive = true;
        this.lastFlushTime = performance.now();
        this.tick();
    }

    public stop() {
        this.isActive = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    // === The Ouroboros Loop (Hearing) ===

    private tick = () => {
        if (!this.isActive) return;

        const now = performance.now();

        // 1. 物理采样 (每一帧)
        if (this.analyser && this.dataArray) {
            // 获取时域数据 (波形)
            this.analyser.getByteTimeDomainData(this.dataArray);

            let sumSquares = 0;
            let peak = 0;

            // 计算 RMS 和 Peak
            for (let i = 0; i < this.dataArray.length; i++) {
                // dataArray 范围是 0-255，128 是静音中心
                const amplitude = (this.dataArray[i] - 128) / 128; // 归一化到 -1 ~ 1
                const absAmp = Math.abs(amplitude);
                
                sumSquares += amplitude * amplitude;
                if (absAmp > peak) peak = absAmp;
            }

            const rms = Math.sqrt(sumSquares / this.dataArray.length);

            // 更新 K 线缓冲区
            this.updateMetric(this.bufferRMS, rms);
            this.updateMetric(this.bufferPeak, peak);
        }

        // 2. 传输 (低频 Flush)
        if (now - this.lastFlushTime >= this.FLUSH_INTERVAL_MS) {
            this.flush(now);
            this.lastFlushTime = now;
        }

        this.rafId = requestAnimationFrame(this.tick);
    }

    private flush(timestamp: number) {
        // 只有当有数据时才发送
        if (this.bufferRMS.o !== -1) {
            // 通过 VirtualChannel 发送
            // 使用保留前缀 "__system__/audio"
            // 这会在 TelemetryFrame 中体现为: data["__system__/audio"] = { a: { energy_rms: {...}, peak: {...} } }
            
            VirtualChannelManager.getInstance().pushBatch('__system__/audio', {
                // 我们这里通过 hack 方式手动构造了 Metric 对象，
                // 但 pushBatch 接受的是 number。
                // 为了兼容现有 API，我们实际上需要 VirtualChannel 支持传入 Metric 对象，
                // 或者我们在此处直接调用 VirtualChannel 的底层存储（如果它是 public 的），
                // 或者我们在 VirtualChannel 中增加一个 pushMetricObject 方法。
                
                // 鉴于当前架构，我们用 Close 值代表当前瞬间，或 High 代表最大值。
                // 更好的做法是让 VirtualChannel 支持 AggregatedMetric。
                // 这里为了保持接口简单，我们推送 High 值 (最能反映"有没有声音")
                
                energy_rms: this.bufferRMS.h,
                peak_level: this.bufferPeak.h
            });

            // Reset buffers
            this.bufferRMS = this.createEmptyMetric();
            this.bufferPeak = this.createEmptyMetric();
        }
    }

    // === Helpers ===

    private updateMetric(metric: AggregatedMetric, value: number) {
        if (metric.o === -1) {
            metric.o = value;
            metric.h = value;
            metric.l = value;
            metric.c = value;
        } else {
            metric.c = value;
            if (value > metric.h) metric.h = value;
            if (value < metric.l) metric.l = value;
        }
    }

    private createEmptyMetric(): AggregatedMetric {
        return { o: -1, h: -1, l: -1, c: -1 };
    }
}

// === 便捷导出 ===
export const audioTelemetry = {
    /**
     * 挂载并自动连接 (Helper)
     * @param ctx AudioContext
     * @param masterGain 游戏的主音量节点
     */
    mount: (ctx: AudioContext, masterGain?: AudioNode) => {
        const runtime = AudioTelemetryRuntime.getInstance();
        runtime.attach(ctx, masterGain);
        runtime.start();
        return runtime;
    },
    
    /**
     * 获取分析节点 (用于手动连接)
     * usage: gameMasterGain.connect(audioTelemetry.node())
     */
    node: () => AudioTelemetryRuntime.getInstance().getInput()
};