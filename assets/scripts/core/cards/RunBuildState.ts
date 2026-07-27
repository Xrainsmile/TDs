/**
 * cards/RunBuildState.ts — 本局构筑状态
 *
 * 记录本局获得的 Buff、分支、层数、流派标签。抽卡/三选一系统据此评估条件与权重，
 * 也作为存档/统计的数据源（配置化后可直接 JSON 序列化）。
 */

import { BaseOptionDefinition, BuildPath, GameTag } from './types';

export class RunBuildState {
    selectedBuffIds: string[] = [];
    buffStacks: Record<string, number> = {};   // buffId -> 已选层数
    branchGroups: string[] = [];               // 已确定的流派分支（互斥）
    buildTags: Set<GameTag> = new Set();       // 累积的流派标签
    buildPaths: Set<BuildPath> = new Set();    // 累积的构筑路线

    /** 选择一张卡/强化后记录（同时计入层数与标签） */
    record(def: BaseOptionDefinition): void {
        if (def.systemType === 'waveBuff') {
            this.selectedBuffIds.push(def.id);
            this.buffStacks[def.id] = (this.buffStacks[def.id] ?? 0) + 1;
            if (def.branchGroup && !this.branchGroups.includes(def.branchGroup)) {
                this.branchGroups.push(def.branchGroup);
            }
        }
        for (const tag of def.tags) this.buildTags.add(tag);
        for (const p of def.buildPaths) this.buildPaths.add(p);
    }

    hasBuff(buffId: string): boolean {
        return this.selectedBuffIds.includes(buffId);
    }

    stacksOf(buffId: string): number {
        return this.buffStacks[buffId] ?? 0;
    }

    /** 生成条件/权重评估所需的快照（注入到 ConditionEvaluator / WeightCalculator） */
    toSnapshot(board: { hasEmptyTile: boolean; hasLockedTile: boolean; boardFull: boolean }, towers: { id: string; tags: GameTag[] }[], currentWave: number) {
        return {
            towers,
            buffStacks: this.buffStacks,
            selectedBuffIds: this.selectedBuffIds,
            currentWave,
            buildPaths: Array.from(this.buildPaths),
            board,
        };
    }

    reset(): void {
        this.selectedBuffIds = [];
        this.buffStacks = {};
        this.branchGroups = [];
        this.buildTags.clear();
        this.buildPaths.clear();
    }
}
