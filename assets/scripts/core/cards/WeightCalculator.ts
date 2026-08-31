/**
 * cards/WeightCalculator.ts — 动态权重计算
 *
 * finalWeight = baseWeight × 条件倍率 + 额外权重 + 保底补偿
 * 保底机制(pity)由抽卡系统统一传入，避免每张卡各写一套。
 */

import { rng } from '../utils/SeededRandom';
import { GameSnapshot, WeightRule } from './types';
import { evaluateCondition } from './ConditionEvaluator';

export interface WeightInput {
    baseWeight: number;
    weightRules: WeightRule[];
    pityBonus?: number;        // 保底补偿（由抽卡系统统一计算后传入）
}

/** 计算单张卡的最终权重（非负） */
export function computeWeight(input: WeightInput, snap: GameSnapshot): number {
    let w = input.baseWeight + (input.pityBonus ?? 0);
    for (const rule of input.weightRules) {
        if (evaluateCondition(rule.condition, snap)) {
            if (rule.multiplier !== undefined) w *= rule.multiplier;
            if (rule.addWeight !== undefined) w += rule.addWeight;
        }
    }
    return Math.max(0, w);
}

/** 从加权池（[{item, weight}]）按权重随机抽取一个，返回其索引 */
export function weightedPick<T>(pool: { item: T; weight: number }[]): number {
    const total = pool.reduce((s, p) => s + Math.max(0, p.weight), 0);
    if (total <= 0) return -1;
    let r = rng.random() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= Math.max(0, pool[i].weight);
        if (r <= 0) return i;
    }
    return pool.length - 1;
}
