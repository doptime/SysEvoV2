// src/ouroboros/VisualAttentionModel.ts

export interface ElementPhysicalState {
    width: number;
    height: number;
    x: number;
    y: number;
    opacity: number;
    zIndex: number;
    viewportW: number;
    viewportH: number;
}

/**
 * 计算单一元素的视觉绝对权重
 * 输入：物理状态
 * 输出：无量纲的权重整数
 */
export function computeVisualWeight(state: ElementPhysicalState): number {
    const { width, height, x, y, opacity, zIndex, viewportW, viewportH } = state;

    // 1. 面积权重 (Area Weight)
    const area = width * height;
    if (area <= 0) return 0;

    // 2. 位置衰减系数 (Position Decay Factor)
    // 基于中心距离的归一化计算 (0.5 ~ 1.0)
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // 计算相对于视口中心的归一化距离平方
    const normX = (centerX - viewportW / 2) / (viewportW / 2);
    const normY = (centerY - viewportH / 2) / (viewportH / 2);
    const distSquared = normX * normX + normY * normY;
    
    // 线性高斯模拟：中心权重最大，边缘衰减至 50%
    const positionFactor = Math.max(0.5, 1 - (distSquared * 0.5));

    // 3. 可见性系数 (Visibility Coefficient)
    // ZIndex 作为微量修正，用于处理相同面积重叠的情况
    const visibilityCoeff = opacity * (1 + (zIndex * 0.001));

    return Math.floor(area * positionFactor * visibilityCoeff);
}

/**
 * 计算相对位序 (Rank)
 * 这是一个简单的排序逻辑，但在模型层显式定义
 */
export function computeRank(targetWeight: number, allWeights: number[]): number {
    // Rank 1 based: 权重比 target 大的数量 + 1
    let rank = 1;
    for (const w of allWeights) {
        if (w > targetWeight) {
            rank++;
        }
    }
    return rank;
}