/**
 * cards/CardRegistry.ts — 五选二卡牌注册表（DrawCardDefinition）
 *
 * 示范四类卡牌（tower/tool/modifier/tactic）的结构化定义。当前运行主流程仍由
 * SceneInitializer.buildHandCards 用 TOWER_REGISTRY + 锄头 + 词缀生成手牌；
 * 接入新数据层后改读本注册表，即可用配置扩展几十张卡而无需改代码。
 *
 * towerId / modifierId 等由运行主流程在 spawnTower / addModifierToTower 时按 id 解析。
 */

import { DrawCardDefinition } from './types';

export const DRAW_CARDS: DrawCardDefinition[] = [
    // —— tower：放置或升级塔 ——
    {
        id: 'card_tower_attack', name: '攻击塔', description: '放置或升级攻击塔', icon: 't_atk',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['tower', 'attack'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true,
        towerId: 'attack',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'attack' } }],
    },
    {
        id: 'card_tower_slow', name: '减速塔', description: '放置或升级减速塔', icon: 't_slo',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['control'], tags: ['tower', 'slow'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true,
        towerId: 'slow',
        effects: [{ effectType: 'spawnTower', target: { type: 'tile', tileType: 'empty' }, parameters: { towerId: 'slow' } }],
    },
    {
        id: 'card_tower_poison', name: '毒塔', description: '放置或升级毒塔', icon: 't_psn',
        systemType: 'drawCard', contentType: 'tower',
        rarity: 'common', tier: 1, buildPaths: ['poison'], tags: ['tower', 'poison'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        targetType: 'emptyTile', playTiming: 'anytime', consumeOnUse: true,
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
        effects: [{ effectType: 'unlockTile', target: { type: 'tile', tileType: 'locked' } }],
    },

    // —— modifier：改造指定塔 ——
    {
        id: 'card_mod_split', name: '分裂弹道', description: '为指定塔附加分裂弹道', icon: 'mod_spl',
        systemType: 'drawCard', contentType: 'modifier',
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['modifier', 'split'],
        unlockConditions: [{ type: 'hasTower', count: 1, operator: '>=' }],
        excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 70,
        targetType: 'tower', playTiming: 'anytime', consumeOnUse: true, modifierSlotCost: 1,
        effects: [{ effectType: 'addModifier', target: { type: 'towerType', towerId: '' }, parameters: { modifierId: 'split' } }],
    },

    // —— tactic：即时战场效果 ——
    {
        id: 'card_tac_freeze', name: '全场冰冻', description: '冻结全场敌人 2 秒', icon: 'tac_frz',
        systemType: 'drawCard', contentType: 'tactic',
        rarity: 'epic', tier: 2, buildPaths: ['control'], tags: ['tactic', 'freeze'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 3, maxStacks: 5, baseWeight: 50,
        targetType: 'battlefield', playTiming: 'inBattle', consumeOnUse: true,
        effects: [{ effectType: 'addStatus', target: { type: 'battlefield' }, duration: 2, parameters: { status: 'freeze' } }],
    },
];

/** 按 id 取卡牌定义 */
export function getDrawCard(id: string): DrawCardDefinition | undefined {
    return DRAW_CARDS.find(c => c.id === id);
}
