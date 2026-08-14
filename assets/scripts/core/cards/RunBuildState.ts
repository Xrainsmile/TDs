/**
 * cards/RunBuildState.ts — 本局构筑状态
 *
 * 记录本局获得的 Buff、分支、层数、流派标签。抽卡/三选一系统据此评估条件与权重，
 * 也作为存档/统计的数据源（配置化后可直接 JSON 序列化）。
 */

import { BuildPath, DrawCardDefinition, GameTag, TowerModifierDefinition, WaveBuffDefinition } from './types';
import { TOWER_MODIFIERS } from './TowerModifierRegistry';

/**
 * 任意可选项定义（判别联合）。
 * 必须用联合而非 BaseOptionDefinition：后者的 systemType 是普通联合字段，
 * `def.systemType === 'waveBuff'` 无法把类型收窄到 WaveBuffDefinition，
 * 也就取不到只属于它的 branchGroup。
 */
export type AnyOptionDefinition = DrawCardDefinition | WaveBuffDefinition;

export class RunBuildState {
    selectedBuffIds: string[] = [];
    buffStacks: Record<string, number> = {};   // buffId -> 已选层数
    towerModifierStacks: Record<string, Record<string, number>> = {};  // towerId -> modifierId -> 层数（本局同类塔改造）
    drawStacks: Record<string, number> = {};   // 抽卡 id -> 本局获得次数（用于 maxStacks 退出牌池）
    branchGroups: string[] = [];               // 已确定的流派分支（互斥）
    buildTags: Set<GameTag> = new Set();       // 累积的流派标签
    buildPaths: Set<BuildPath> = new Set();    // 累积的构筑路线

    /** 选择一张卡/强化后记录（同时计入层数与标签） */
    record(def: AnyOptionDefinition): void {
        if (def.systemType === 'waveBuff') {
            this.selectedBuffIds.push(def.id);
            this.buffStacks[def.id] = (this.buffStacks[def.id] ?? 0) + 1;
            if (def.branchGroup && this.branchGroups.indexOf(def.branchGroup) < 0) {
                this.branchGroups.push(def.branchGroup);
            }
        }
        for (const tag of def.tags) this.buildTags.add(tag);
        for (const p of def.buildPaths) this.buildPaths.add(p);
    }

    hasBuff(buffId: string): boolean {
        return this.selectedBuffIds.indexOf(buffId) >= 0;
    }

    stacksOf(buffId: string): number {
        return this.buffStacks[buffId] ?? 0;
    }

    /** 生成条件/权重评估所需的快照（注入到 ConditionEvaluator / WeightCalculator） */
    toSnapshot(board: { hasEmptyTile: boolean; hasLockedTile: boolean; boardFull: boolean }, towers: { id: string; tags: GameTag[] }[], currentWave: number) {
        return {
            towers,
            buffStacks: this.buffStacks,
            towerModifierStacks: this.towerModifierStacks,
            selectedBuffIds: this.selectedBuffIds,
            currentWave,
            buildPaths: Array.from(this.buildPaths),
            board,
        };
    }

    // —— 本局同类塔改造状态（改造卡，非单塔 modifiers）——
    addTowerModifier(towerId: string, modifierId: string, maxStacks = 1): boolean {
        const towerMods = this.towerModifierStacks[towerId] ??= {};
        const current = towerMods[modifierId] ?? 0;
        if (current >= maxStacks) return false;
        towerMods[modifierId] = current + 1;
        return true;
    }

    hasTowerModifier(towerId: string, modifierId: string): boolean {
        return (this.towerModifierStacks[towerId]?.[modifierId] ?? 0) > 0;
    }

    modifierStacksOf(towerId: string, modifierId: string): number {
        return this.towerModifierStacks[towerId]?.[modifierId] ?? 0;
    }

    towerModifiersOf(towerId: string): TowerModifierDefinition[] {
        const ids = Object.keys(this.towerModifierStacks[towerId] ?? {});
        return TOWER_MODIFIERS.filter(m => ids.indexOf(m.id) >= 0);
    }

    // —— 抽卡计数（用于牌池 maxStacks 退出）——
    recordDrawCard(id: string): void {
        this.drawStacks[id] = (this.drawStacks[id] ?? 0) + 1;
    }

    drawStacksOf(id: string): number {
        return this.drawStacks[id] ?? 0;
    }

    reset(): void {
        this.selectedBuffIds = [];
        this.buffStacks = {};
        this.towerModifierStacks = {};
        this.drawStacks = {};
        this.branchGroups = [];
        this.buildTags.clear();
        this.buildPaths.clear();
    }
}
