/**
 * cards/CardRegistry.ts — 五选二卡牌注册表（DrawCardDefinition）
 *
 * 示范四类卡牌（tower/tool/modifier/tactic）的结构化定义。当前运行主流程仍由
 * SceneInitializer.buildHandCards 用 TOWER_REGISTRY + 锄头 + 词缀生成手牌；
 * 接入新数据层后改读本注册表，即可用配置扩展几十张卡而无需改代码。
 *
 * towerId / modifierId 等由运行主流程在 spawnTower / addModifierToTower 时按 id 解析。
 *
 * targetConditions 填写约定（经 ConditionEvaluator.evaluateAll 判定，AND 语义，空数组=通过）：
 *  - tool/modifier：目标客观存在才可落地，如实填写（有灰格 / 有塔）。
 *  - tactic：作用于整个战场，无目标前置，留空。
 *  - tower：**刻意留空**。实际可用性是「有空格 OR 有同型塔可升级」（见
 *    SceneInitializer.refreshHandCardUsability），AND 语义的 targetConditions 表达不了这个 OR；
 *    若在此填 hasEmptyTile，会错误地让「棋盘已满但可升级」的情况判定为不可用。
 *    接入运行主流程时该判定仍由 refreshHandCardUsability 负责，或先给 Condition 增加 anyOf 组合子。
 */

import { DrawCardDefinition } from './types';

export const DRAW_CARDS: DrawCardDefinition[] = [
    // —— tower：放置或升级塔 ——
    {
        id: 'card_tower_bubble_tea_straw', name: '珍珠奶茶吸管', description: '贴身单体戳击：攻速快、伤害稳定', icon: 't_boba',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'thrust', 'bubble_tea_straw'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 80,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'bubble_tea_straw',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'bubble_tea_straw' } }],
    },
    {
        id: 'card_tower_whisk', name: '打蛋器', description: '旋斩：自身圆周范围持续伤害', icon: 't_whisk',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'spin', 'whisk'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'whisk',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'whisk' } }],
    },
    {
        id: 'card_tower_spatula', name: '锅铲', description: '砸击：敌群最密点范围爆发', icon: 't_spatula',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'smash', 'spatula'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'spatula',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'spatula' } }],
    },
    {
        id: 'card_tower_needle', name: '缝衣针', description: '贯穿：直线穿透多目标', icon: 't_needle',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'pierce', 'needle'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'needle',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'needle' } }],
    },
    {
        id: 'card_tower_slow', name: '减速塔', description: '放置或升级减速塔', icon: 't_slo',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['control'], tags: ['tower', 'slow'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'slow',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'slow' } }],
    },
    {
        id: 'card_tower_poison', name: '毒塔', description: '放置或升级毒塔', icon: 't_psn',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['poison'], tags: ['tower', 'poison'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'poison',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'poison' } }],
    },

    // —— tool：改变棋盘资源 ——
    {
        id: 'card_tool_hammer', name: '锄头', description: '解锁一个灰色格', icon: 'ham',
        systemType: 'drawCard', contentType: 'tool',
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['tool', 'unlock'],
        unlockConditions: [
            { type: 'boardState', state: 'hasLockedTile' },   // 无灰格则退出牌池
        ],
        excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'lockedTile', playTiming: 'anytime', consumeOnUse: true,
        targetConditions: [{ type: 'boardState', state: 'hasLockedTile' }],   // 落地目标必须是灰格
        effects: [{ effectType: 'unlockTile', target: { type: 'tile', tileType: 'locked' } }],
    },

    // —— modifier：改造指定塔 ——
    {
        id: 'card_mod_split', name: '分裂弹道', description: '指定塔的子弹命中后，向附近 2 个敌人分裂 50% 伤害的子弹（仅子弹类塔有效）', icon: 'mod_spl',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['modifier', 'split'],
        unlockConditions: [{ type: 'hasTower', count: 1, operator: '>=' }],
        excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', count: 1, operator: '>=' }],   // 需场上有塔可改造
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: '' }, parameters: { modifierId: 'split' } }],
    },

    // —— tactic：即时战场效果 ——
    {
        id: 'card_tac_freeze', name: '全场冰冻', description: '冻结全场敌人 2 秒', icon: 'tac_frz',
        systemType: 'drawCard', contentType: 'tactic',
        rarity: 'epic', tier: 2, buildPaths: ['control'], tags: ['tactic', 'freeze'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 3, maxStacks: 5, baseWeight: 50,
        targetType: 'battlefield', playTiming: 'inBattle', consumeOnUse: true, targetConditions: [],
        effects: [{ effectType: 'addStatus', target: { type: 'battlefield' }, duration: 2, parameters: { status: 'freeze' } }],
    },

    // ===== 家庭小物件 Demo 卡牌 =====
    {
        id: 'card_tower_toothbrush', name: '牙刷', description: '横扫范围内的所有敌人', icon: 'ho_tb',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'sweep', 'toothbrush'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'toothbrush',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'toothbrush' } }],
    },
    {
        id: 'card_tower_powerbank', name: '充电宝', description: '范围内友方塔 +25% 攻速', icon: 'ho_pb',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['tower', 'support', 'powerbank'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'powerbank',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'powerbank' } }],
    },
    {
        id: 'card_tower_rubberband', name: '橡皮筋', description: '子弹命中后弹射 2 次', icon: 'ho_rb',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'bounce', 'rubberband'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'rubberband',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'rubberband' } }],
    },
    {
        id: 'card_tac_tape', name: '胶带', description: '在落点放置减速区，持续 8 秒', icon: 'ho_tp',
        systemType: 'drawCard', contentType: 'tactic',
        rarity: 'rare', tier: 2, buildPaths: ['control'], tags: ['tactic', 'tape', 'slowzone'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 5, baseWeight: 45,
        targetType: 'battlefield', playTiming: 'inBattle', consumeOnUse: true, targetConditions: [],
        effects: [{
            effectType: 'custom', effectId: 'groundSlowZone', target: { type: 'battlefield' },
            parameters: { radius: 80, duration: 8, slowMultiplier: 0.6 },
        }],
    },
];

/** 按 id 取卡牌定义 */
export function getDrawCard(id: string): DrawCardDefinition | undefined {
    return DRAW_CARDS.find(c => c.id === id);
}
