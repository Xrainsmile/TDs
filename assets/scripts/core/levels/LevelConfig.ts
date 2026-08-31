/**
 * levels/LevelConfig.ts — 关卡配置层
 *
 * 设计目标：技术上按关卡拆配置（波次表 / 牌池 / 开放系统 / 数值倍率），
 * 玩家体验保持连续——线性推进，不做独立的「新手教程」入口。
 *
 * 一关只引入一个主要概念：
 *   第 1 关  操作教学：会选卡、放塔、看塔自动攻击（单路 / 3 波 / 仅基础塔）
 *   第 6 关  正常节奏：完整牌池与完整系统（= 原 Demo 基线）
 */

import { EnemyType } from '../Constants';
import { INITIAL_GOLD, WAVES, WaveConfig } from '../GameBalance';

/** 按关卡开放的系统开关 */
export interface LevelSystems {
    /** 同类塔合并（升星） */
    merge: boolean;
    /** 改造卡（modifier） */
    modifier: boolean;
    /** 战术 / 风险卡（tactic） */
    tactic: boolean;
    /** 波后三选一强化 */
    waveBuff: boolean;
    /** 起子（原「锤子」）与锁定格 */
    hammer: boolean;
}

export interface LevelConfig {
    id: number;
    name: string;
    waves: WaveConfig[];
    /** 牌池白名单（DrawCardDefinition.id）。空数组 = 使用全部卡牌。 */
    cardWhitelist: string[];
    /** 出怪分支数：1 = 单路，2 = 双路分叉 */
    branchCount: 1 | 2;
    /** 锁定格数量（0 = 全解锁）。按 MapConfig 的锁定顺序取前 N 个。 */
    lockedSlotCount: number;
    /** 敌人血量倍率（叠加在敌人注册表 hpMultiplier 之上） */
    hpMultiplier: number;
    /** 敌人速度倍率（<1 更慢，给新玩家观察时间） */
    enemySpeedMultiplier: number;
    /** 开局金币 */
    initialGold: number;
    /** 漏怪扣血（基地生命） */
    leakDamage: number;
    /** 新手保护：基地首次濒危时自动抵挡一次 */
    firstDeathShield: boolean;
    systems: LevelSystems;
}

// ===== 第 1 关：操作教学 =====
// 只教动作：选攻击塔 → 放到塔位 → 看塔自动攻击；起子激活灰格。
// 刻意不放：流派改造(modifier)、战术(tactic)、合并(merge)、精英/治疗敌人、双路线。
const LEVEL_1_WAVES: WaveConfig[] = [
    // 第 1 波：3 只慢速普通兵，间隔 2.5 秒（紧凑但可观察）
    { entries: [
        { time: 0.0, type: EnemyType.NORMAL, hp: 40 },
        { time: 2.5, type: EnemyType.NORMAL, hp: 40 },
        { time: 5.0, type: EnemyType.NORMAL, hp: 40 },
    ]},
    // 第 2 波：5 只，引导放置第二座同类塔
    { entries: [
        { time: 0.0, type: EnemyType.NORMAL, hp: 55 },
        { time: 2.0, type: EnemyType.NORMAL, hp: 55 },
        { time: 4.0, type: EnemyType.NORMAL, hp: 55 },
        { time: 6.0, type: EnemyType.NORMAL, hp: 55 },
        { time: 8.0, type: EnemyType.NORMAL, hp: 55 },
    ]},
    // 第 3 波：7 只，稍微有压力
    { entries: [
        { time: 0.0, type: EnemyType.NORMAL, hp: 70 },
        { time: 1.8, type: EnemyType.NORMAL, hp: 70 },
        { time: 3.6, type: EnemyType.NORMAL, hp: 70 },
        { time: 5.4, type: EnemyType.NORMAL, hp: 70 },
        { time: 7.2, type: EnemyType.NORMAL, hp: 70 },
        { time: 9.0, type: EnemyType.NORMAL, hp: 70 },
        { time: 10.8, type: EnemyType.NORMAL, hp: 70 },
    ]},
];

export const LEVELS: LevelConfig[] = [
    {
        id: 1,
        name: '第 1 关 · 操作教学',
        waves: LEVEL_1_WAVES,
        // 近战（奶茶吸管）+ 橡皮筋 + 减速塔，三种最直观的塔
        // 起子卡：地图大部分格为灰色需激活，教学关也要能抽到起子才能正常推进
        cardWhitelist: [
            'card_tower_bubble_tea_straw',
            'card_tower_rubberband',
            'card_tower_slow',
            'card_tool_hammer',   // 起子（原「锤子」）
        ],
        branchCount: 1,
        lockedSlotCount: 0,
        hpMultiplier: 1,
        enemySpeedMultiplier: 0.85,    // 略慢于正常，给新玩家观察时间
        initialGold: 80,               // 够抽 2~3 轮（25×3=75），需要合理规划
        leakDamage: 1,
        firstDeathShield: true,
        systems: { merge: false, modifier: false, tactic: false, waveBuff: true, hammer: true },
    },
    {
        id: 6,
        name: '第 6 关 · 正常节奏',
        waves: WAVES,
        cardWhitelist: [],          // 完整牌池
        branchCount: 2,
        lockedSlotCount: 12,        // 与 MapConfig 的 12 个锁定格一致
        hpMultiplier: 1,
        enemySpeedMultiplier: 1,
        initialGold: INITIAL_GOLD,
        leakDamage: 1,
        firstDeathShield: false,
        systems: { merge: true, modifier: true, tactic: true, waveBuff: true, hammer: true },
    },
];

/** 默认关卡：当前 Demo 即第 6 关（正常节奏） */
export const DEFAULT_LEVEL_ID = 6;

export function getLevel(id: number): LevelConfig {
    return LEVELS.find(l => l.id === id) ?? LEVELS.find(l => l.id === DEFAULT_LEVEL_ID)!;
}
