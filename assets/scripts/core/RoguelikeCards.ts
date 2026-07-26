/**
 * RoguelikeCards.ts — 肉鸽卡牌系统（塔属性 + buff 池 + 卡牌展示）
 *
 * 从 SceneInitializer.ts 抽出，集中管理：
 * - TowerStats：全局塔属性与 roguelike 加成累计
 * - BuffOption / ROGUELIKE_BUFFS：7 种 buff 选项定义
 * - BuildPath：构筑路线类型（firepower / poison / control / general）
 * - getBuffDisplay：根据当前加成动态生成卡片上展示的名称/描述
 *
 * SceneInitializer 通过 import 引用这些定义与函数。
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
    get bleedChance() { return 0.05 + this.bleedLevel * 0.05; }     // 5%+5%/级
    get bleedDuration() { return 2.0; }                               // 固定 2 秒
    get critChance() { return 0.3 + this.bleedLevel * 0.1; }       // 暴击率 30%+10%/级
    get critMultiplier() { return 2.0 + this.bleedLevel * 0.5; }    // 暴击倍率 2x+0.5/级

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
    }
}

/** 构筑路线类型 */
export type BuildPath =
    | 'firepower'   // 火力路线
    | 'poison'      // 剧毒路线
    | 'control'     // 控制路线
    | 'general';    // 通用（不计入主构筑路线）

/** Roguelike buff 选项定义 */
export interface BuffOption {
    id: string;
    name: string;          // 显示名
    desc: string;          // 描述
    apply: (stats: TowerStats) => void;

    path: BuildPath;       // 所属构筑路线
    tier: number;          // 卡牌层级
    requires: string[];    // 必须已选择的前置卡牌
    excludes: string[];    // 选择后互斥的卡牌
    minWave: number;       // 最早出现波次
    maxStacks: number;     // 本局最多选择次数
}

/** 7 种 buff（每次随机选 3 种，玩家三选一） */
export const ROGUELIKE_BUFFS: BuffOption[] = [
    {
        id: 'damage', name: '攻击伤害 +10%', desc: '所有塔伤害提升',
        apply: s => { s.damageBonus += 0.1; },
        path: 'firepower', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
    {
        id: 'speed', name: '攻速 +15%', desc: '所有塔攻击速度提升',
        apply: s => { s.speedBonus += 0.15; },
        path: 'firepower', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
    {
        id: 'range', name: '范围 +10%', desc: '所有塔攻击范围提升',
        apply: s => { s.rangeBonus += 0.1; },
        path: 'general', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
    {
        id: 'healSuppress', name: '治疗抑制', desc: '命中治疗兵使其沉默2秒，并削弱其治疗量',
        apply: s => { s.healSuppression += 0.4; },
        path: 'general', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
    {
        id: 'splash',
        name: '溅射爆炸',
        desc: '',  // 动态生成，见 getBuffDisplay
        apply: s => { s.splashLevel += 1; },
        path: 'poison', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
    {
        id: 'bleed',
        name: '出血',
        desc: '',  // 动态生成，见 getBuffDisplay
        apply: s => { s.bleedLevel += 1; },
        path: 'poison', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
    {
        id: 'slow',
        name: '减速强化',
        desc: '',  // 动态生成，见 getBuffDisplay
        apply: s => { s.slowLevel += 1; },
        path: 'control', tier: 1, requires: [], excludes: [], minWave: 1, maxStacks: 99,
    },
];

/** 获取 buff 在卡片上显示的名称和描述（展示选择前→选择后的数值变化） */
export function getBuffDisplay(buff: BuffOption, stats: TowerStats): { name: string; desc: string } {
    // 模拟选择后的 stats（浅拷贝）
    const after = new TowerStats();
    after.damageBonus = stats.damageBonus;
    after.speedBonus = stats.speedBonus;
    after.rangeBonus = stats.rangeBonus;
    after.healSuppression = stats.healSuppression;
    after.splashLevel = stats.splashLevel;
    after.bleedLevel = stats.bleedLevel;
    after.slowLevel = stats.slowLevel;
    buff.apply(after);

    if (buff.id === 'damage') {
        return {
            name: '攻击伤害 +10%',
            desc: `伤害倍率 ${stats.damageMultiplier.toFixed(1)}x → ${after.damageMultiplier.toFixed(1)}x`,
        };
    }
    if (buff.id === 'speed') {
        return {
            name: '攻速 +15%',
            desc: `攻速倍率 ${Math.round(stats.speedMultiplier * 100)}% → ${Math.round(after.speedMultiplier * 100)}%`,
        };
    }
    if (buff.id === 'range') {
        return {
            name: '范围 +10%',
            desc: `范围倍率 ${Math.round(stats.rangeMultiplier * 100)}% → ${Math.round(after.rangeMultiplier * 100)}%`,
        };
    }
    if (buff.id === 'healSuppress') {
        return {
            name: '治疗抑制',
            desc: `命中沉默 2s + 抑制 ${Math.round(stats.healSuppression * 100)}% → ${Math.round(after.healSuppression * 100)}%`,
        };
    }
    if (buff.id === 'splash') {
        if (stats.splashLevel === 0) {
            return {
                name: '溅射爆炸',
                desc: `解锁：命中后爆炸 ${after.splashRadius}px / ${Math.round(after.splashDamage * 100)}% 伤害`,
            };
        }
        return {
            name: `溅射强化 Lv${after.splashLevel}`,
            desc: `${stats.splashRadius}px / ${Math.round(stats.splashDamage * 100)}% → ${after.splashRadius}px / ${Math.round(after.splashDamage * 100)}%`,
        };
    }
    if (buff.id === 'bleed') {
        if (stats.bleedLevel === 0) {
            return {
                name: '出血',
                desc: `解锁：${Math.round(after.bleedChance * 100)}%施加出血 / ${Math.round(after.critChance * 100)}%暴击 / ${after.critMultiplier}x暴伤`,
            };
        }
        return {
            name: `出血强化 Lv${after.bleedLevel}`,
            desc: `${Math.round(stats.bleedChance * 100)}%/${Math.round(stats.critChance * 100)}%/${stats.critMultiplier}x → ${Math.round(after.bleedChance * 100)}%/${Math.round(after.critChance * 100)}%/${after.critMultiplier}x`,
        };
    }
    if (buff.id === 'slow') {
        if (stats.slowLevel === 0) {
            return {
                name: '减速强化',
                desc: `解锁：所有子弹附带减速 ${Math.round(after.slowMultiplier * 100)}% / ${after.slowDuration.toFixed(1)}s`,
            };
        }
        return {
            name: `减速强化 Lv${after.slowLevel}`,
            desc: `${Math.round(stats.slowMultiplier * 100)}% / ${stats.slowDuration.toFixed(1)}s → ${Math.round(after.slowMultiplier * 100)}% / ${after.slowDuration.toFixed(1)}s`,
        };
    }
    return { name: buff.name, desc: buff.desc };
}
