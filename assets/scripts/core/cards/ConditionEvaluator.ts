/**
 * cards/ConditionEvaluator.ts — 结构化条件评估
 *
 * 统一判断：前置(unlockConditions)、互斥(excludeConditions)、目标合法性(targetConditions)、
 * 权重规则(weightRules.condition)。所有 Condition 经同一入口评估，避免每张卡各写一套判断。
 */

import { Condition, GameSnapshot, GameTag } from './types';

/** 统计某标签数量：场上带该标签的塔数量 + 已选且该 id 即标签的 Buff 数量 */
function countTag(tag: GameTag, snap: GameSnapshot): number {
    let n = 0;
    for (const t of snap.towers) {
        if (t.tags.indexOf(tag) >= 0) n++;
    }
    // 若某已选 Buff 的 id 恰为该 tag（如分支 id='storm'），也计入
    if (snap.selectedBuffIds.indexOf(tag) >= 0) n++;
    return n;
}

function cmp(actual: number, op: '>=' | '=' | '<=', expected: number): boolean {
    if (op === '>=') return actual >= expected;
    if (op === '=') return actual === expected;
    return actual <= expected;
}

/** 评估单条条件 */
export function evaluateCondition(cond: Condition, snap: GameSnapshot): boolean {
    switch (cond.type) {
        case 'hasTower': {
            let count = 0;
            for (const t of snap.towers) {
                if (cond.towerId && t.id !== cond.towerId) continue;
                if (cond.tag && t.tags.indexOf(cond.tag) < 0) continue;
                count++;
            }
            return cmp(count, cond.operator, cond.count);
        }
        case 'hasBuff': {
            const stacks = snap.buffStacks[cond.buffId] ?? 0;
            return stacks >= cond.stacks;
        }
        case 'hasModifier': {
            const stacks = snap.towerModifierStacks[cond.towerId]?.[cond.modifierId] ?? 0;
            return stacks >= cond.stacks;
        }
        case 'hasTag': {
            return countTag(cond.tag, snap) >= cond.count;
        }
        case 'wave': {
            return cmp(snap.currentWave, cond.operator, cond.value);
        }
        case 'buildPath': {
            return snap.buildPaths.indexOf(cond.path) >= 0;
        }
        case 'boardState': {
            if (cond.state === 'hasEmptyTile') return snap.board.hasEmptyTile;
            if (cond.state === 'hasLockedTile') return snap.board.hasLockedTile;
            return snap.board.boardFull;
        }
    }
    return false;
}

/** 评估条件列表（全部满足才通过，空列表视为通过） */
export function evaluateAll(conds: Condition[], snap: GameSnapshot): boolean {
    for (const c of conds) {
        if (!evaluateCondition(c, snap)) return false;
    }
    return true;
}

/** 是否满足前置（解锁） */
export function meetsUnlock(def: { unlockConditions: Condition[] }, snap: GameSnapshot): boolean {
    return evaluateAll(def.unlockConditions, snap);
}

/** 是否触发互斥（任意一条互斥条件成立即视为互斥，应排除；空列表视为不互斥） */
export function triggersExclude(def: { excludeConditions: Condition[] }, snap: GameSnapshot): boolean {
    // 空列表 → 无互斥规则 → 返回 false（注意：不能用 evaluateAll，空数组会空真返回 true）
    return def.excludeConditions.some(c => evaluateCondition(c, snap));
}
