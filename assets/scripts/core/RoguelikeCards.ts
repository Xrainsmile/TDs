/**
 * RoguelikeCards.ts — 塔属性累加器（TowerStats）与构筑路线类型（BuildPath）
 *
 * 卡牌/强化定义已迁移到 assets/scripts/core/cards/（统一数据层）：
 * - BuffRegistry（波后三选一 WaveBuffDefinition）
 * - CardRegistry（五选二 DrawCardDefinition）
 * - ConditionEvaluator / WeightCalculator / EffectExecutor / RunBuildState
 * 本文件仅保留运行主流程仍依赖的 TowerStats 与 BuildPath，旧 BuffOption /
 * ROGUELIKE_BUFFS / getBuffDisplay 已废弃移除。
 */

/** 全局塔属性（roguelike 加成累计，加法叠加不复利） */
export class TowerStats {
    damageBonus = 0;       // 伤害加成（0.1 = +10%，累加）
    speedBonus = 0;         // 攻速加成（0.05 = +5%，累加）
    rangeBonus = 0;         // 范围加成（0.1 = +10%，累加）
    healSuppression = 0;    // 治疗抑制（0.1 = 抑制10%，累加）
    splashLevel = 0;        // 溅射等级（0=未解锁，>0=主弹命中后爆炸 AOE）
    bleedLevel = 0;         // 出血等级（0=未解锁，>0=概率施加出血+暴击）
    slowLevel = 0;          // 减速等级（>0 时所有子弹附带减速）
    strawDamageBonus = 0;   // 奶茶吸管专属伤害加成
    strawRangePenalty = 0;  // 奶茶吸管射程代价（0.1 = -10%）
    corePoweredDamageBonus = 0; // 被核心供电选中的奶茶吸管额外伤害
    corePoweredCritBonus = 0;   // 被核心供电选中的奶茶吸管额外暴击率
    corePoweredSecondStrikeCrit = false; // 过载双击：供电奶茶第二戳必定暴击
    poisonBurstDamageBonus = 0; // 毒爆伤害加成
    poisonBurstRadiusBonus = 0; // 毒爆半径加成
    poisonResidueLevel = 0;     // 毒爆后残留施毒等级
    smashSlowedDamageBonus = 0; // 锅铲攻击减速目标的额外伤害
    smashRadiusBonus = 0;       // 锅铲砸击半径加成
    smashIntervalPenalty = 0;   // 锅铲攻速代价（攻击间隔增加）
    brushSlowVulnerableBonus = 0; // 牙刷命中减速目标时附加易伤
    smashBrushedBurstLevel = 0;   // 锅铲命中刷洗目标时触发小爆破
    stitchChainTargetBonus = 0;   // 加长线轴：每条缝合链额外连接目标数
    stitchDurationBonus = 0;      // 加长线轴：缝合持续时间加成（秒）
    stitchCutDamageBonus = 0;     // 锋利裁口：剪线伤害倍率加成

    // 最终倍率 = 1 + 累计加成（加法叠加）
    get damageMultiplier() { return 1 + this.damageBonus; }
    get speedMultiplier() { return 1 + this.speedBonus; }
    get rangeMultiplier() { return 1 + this.rangeBonus; }
    get healMultiplier() { return Math.max(0, 1 - this.healSuppression); }

    // 溅射 AOE 参数（随等级提升）
    // Lv1: 半径 43 / 30%；Lv2: 51 / 40%；Lv3: 59 / 50%
    get splashRadius() { return 35 + this.splashLevel * 8; }       // 基础 35px，每级 +8
    get splashDamage() { return 0.2 + this.splashLevel * 0.1; }    // 主弹伤害的 20%+10%/级

    // 出血参数（随等级提升）
    get bleedChance() { return 0.05 + this.bleedLevel * 0.05; }    // 5%+5%/级
    get bleedDuration() { return 2.0; }                             // 固定 2 秒
    get critChance() { return 0.3 + this.bleedLevel * 0.1; }       // 暴击率 30%+10%/级
    get critMultiplier() { return 2.0 + this.bleedLevel * 0.5; }   // 暴击倍率 2x+0.5/级

    // 减速参数（随等级提升，所有子弹附带减速）
    get slowMultiplier() { return Math.max(0.3, 0.85 - this.slowLevel * 0.05); }
    get slowDuration() { return 1.5 + this.slowLevel * 0.5; }

    reset(): void {
        this.damageBonus = 0;
        this.speedBonus = 0;
        this.rangeBonus = 0;
        this.healSuppression = 0;
        this.splashLevel = 0;
        this.bleedLevel = 0;
        this.slowLevel = 0;
        this.strawDamageBonus = 0;
        this.strawRangePenalty = 0;
        this.corePoweredDamageBonus = 0;
        this.corePoweredCritBonus = 0;
        this.corePoweredSecondStrikeCrit = false;
        this.poisonBurstDamageBonus = 0;
        this.poisonBurstRadiusBonus = 0;
        this.poisonResidueLevel = 0;
        this.smashSlowedDamageBonus = 0;
        this.smashRadiusBonus = 0;
        this.smashIntervalPenalty = 0;
        this.brushSlowVulnerableBonus = 0;
        this.smashBrushedBurstLevel = 0;
        this.stitchChainTargetBonus = 0;
        this.stitchDurationBonus = 0;
        this.stitchCutDamageBonus = 0;
    }
}

/** 构筑路线类型 */
export type BuildPath =
    | 'firepower'   // 火力路线
    | 'poison'      // 剧毒路线
    | 'control'     // 控制路线
    | 'general';    // 通用（不计入主构筑路线）
