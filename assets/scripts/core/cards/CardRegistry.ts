/**
 * cards/CardRegistry.ts — 五选二卡牌注册表（DrawCardDefinition）
 *
 * 示范四类卡牌（tower/tool/modifier/tactic）的结构化定义。当前运行主流程仍由
 * SceneInitializer.buildHandCards 用 TOWER_REGISTRY + 锤子 + 词缀生成手牌；
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
        id: 'card_tower_bubble_tea_straw', name: '奶茶吸管', description: '贴身单体戳击：攻速快、伤害稳定', icon: 't_boba',
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
        rarity: 'common', tier: 1, buildPaths: ['control', 'firepower'], tags: ['tower', 'control', 'smash', 'spatula'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' }, multiplier: 1.25 },
            { condition: { type: 'hasTower', towerId: 'toothbrush', count: 1, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'spatula',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'spatula' } }],
    },
    {
        id: 'card_tower_needle', name: '缝衣针', description: '贯穿：直线穿透多目标', icon: 't_needle',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'pierce', 'needle', 'stitch'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'scissors', count: 1, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'needle',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'needle' } }],
    },
    {
        id: 'card_tower_scissors', name: '剪刀', description: '近距离剪击；优先剪断缝合目标', icon: 't_scissors',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'sweep', 'scissors', 'stitch'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'needle', count: 1, operator: '>=' }, multiplier: 1.35 },
            { condition: { type: 'hasModifier', towerId: 'needle', modifierId: 'thread_spool', stacks: 1 }, multiplier: 1.5 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 68,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'scissors',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'scissors' } }],
    },
    {
        id: 'card_tower_slow', name: '减速塔', description: '放置或升级减速塔', icon: 't_slo',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['control'], tags: ['tower', 'slow'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'spatula', count: 1, operator: '>=' }, multiplier: 1.25 },
            { condition: { type: 'hasTower', towerId: 'toothbrush', count: 1, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'slow',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'slow' } }],
    },
    {
        id: 'card_tower_poison', name: '杀虫喷雾', description: '优先喷洒尚未中毒的敌人', icon: 't_psn',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['poison'], tags: ['tower', 'poison'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' }, multiplier: 1.35 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'poison',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'poison' } }],
    },

    // —— tool：改变棋盘资源 ——
    {
        id: 'card_tool_hammer', name: '锤子', description: '敲开一个灰色格', icon: 'ham',
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
        id: 'card_mod_split', name: '分裂弹道', description: '拖到子弹/弹射类塔上：本局所有同类塔的终结子弹向附近2个敌人分裂50%伤害', icon: 'mod_spl',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['firepower', 'poison'], tags: ['modifier', 'split', 'bounce'],
        unlockConditions: [{ type: 'hasTower', count: 1, operator: '>=' }],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' }, multiplier: 1.6 },
            { condition: { type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' }, multiplier: 1.3 },
        ],
        minWave: 1, maxStacks: 1, baseWeight: 70,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', count: 1, operator: '>=' }],   // 池内出现需场上有塔（具体类型在拖放时校验）
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: '' }, parameters: { modifierId: 'split' } }],
    },
    {
        id: 'card_mod_double_straw', name: '双管吸管', description: '本局所有奶茶吸管每轮连续戳击2次（每次70%伤害，攻击间隔+20%）', icon: 'mod_ds',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['modifier', 'double_straw'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' },
            { type: 'wave', value: 2, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [],
        minWave: 2, maxStacks: 1, baseWeight: 60,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' }],
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: 'bubble_tea_straw' }, parameters: { modifierId: 'double_straw' } }],
    },
    {
        id: 'card_mod_venom_bounce', name: '淬毒橡皮筋', description: '拖到橡皮筋上：本局所有橡皮筋命中、弹射和分裂弹都会施加中毒', icon: 'mod_vb',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['poison'], tags: ['modifier', 'poison', 'bounce', 'venom_bounce'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' },
            { type: 'wave', value: 2, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'rubberband', count: 2, operator: '>=' }, multiplier: 1.4 },
        ],
        minWave: 2, maxStacks: 1, baseWeight: 65,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' }],
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: 'rubberband' }, parameters: { modifierId: 'venom_bounce' } }],
    },
    {
        id: 'card_mod_poison_burst', name: '毒爆', description: '拖到杀虫喷雾上：中毒敌人死亡时爆炸，对附近敌人造成伤害', icon: 'mod_pb',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['poison'], tags: ['modifier', 'poison', 'burst'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' },
            { type: 'wave', value: 3, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'rubberband', count: 2, operator: '>=' }, multiplier: 1.35 },
        ],
        minWave: 3, maxStacks: 1, baseWeight: 62,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' }],
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: 'poison' }, parameters: { modifierId: 'poison_burst' } }],
    },
    {
        id: 'card_mod_core_power', name: '核心供电', description: '拖到充电宝上：每个充电宝强化范围内所有奶茶吸管', icon: 'mod_cp',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['modifier', 'support', 'thrust', 'core_power'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'powerbank', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' },
            { type: 'wave', value: 2, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'bubble_tea_straw', count: 2, operator: '>=' }, multiplier: 1.35 },
        ],
        minWave: 2, maxStacks: 1, baseWeight: 68,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', towerId: 'powerbank', count: 1, operator: '>=' }],
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: 'powerbank' }, parameters: { modifierId: 'core_power' } }],
    },
    {
        id: 'card_mod_thread_spool', name: '彩色线轴', description: '拖到缝衣针上：同一次穿透命中的敌人会形成缝合链', icon: 'mod_thread',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['modifier', 'needle', 'stitch', 'thread_spool'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'needle', count: 1, operator: '>=' },
            { type: 'wave', value: 2, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'scissors', count: 1, operator: '>=' }, multiplier: 1.5 },
        ],
        minWave: 2, maxStacks: 1, baseWeight: 66,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        targetConditions: [{ type: 'hasTower', towerId: 'needle', count: 1, operator: '>=' }],
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: 'needle' }, parameters: { modifierId: 'thread_spool' } }],
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
        rarity: 'common', tier: 1, buildPaths: ['control', 'firepower'], tags: ['tower', 'control', 'sweep', 'toothbrush'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' }, multiplier: 1.25 },
            { condition: { type: 'hasTower', towerId: 'spatula', count: 1, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'toothbrush',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'toothbrush' } }],
    },
    {
        id: 'card_tower_powerbank', name: '充电宝', description: '范围内友方塔 +25% 攻速', icon: 'ho_pb',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['tower', 'support', 'powerbank'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' }, multiplier: 1.4 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true, targetConditions: [],
        towerId: 'powerbank',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'powerbank' } }],
    },
    {
        id: 'card_tower_rubberband', name: '橡皮筋', description: '子弹命中后弹射 2 次', icon: 'ho_rb',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower', 'poison'], tags: ['tower', 'bounce', 'rubberband'],
        unlockConditions: [], excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' }, multiplier: 1.35 },
        ],
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
