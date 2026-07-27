/**
 * cards/BuffRegistry.ts — 波后三选一强化注册表（WaveBuffDefinition）
 *
 * 将旧 RoguelikeCards.ROGUELIKE_BUFFS 的 7 个 Buff 迁移到新的结构化定义，
 * 作为数据层落地的示范。旧系统仍可运行；后续 SceneInitializer 接入时改读本注册表。
 *
 * 迁移说明：
 * - apply(s) 函数 → effects: [{effectType:'modifyStat', parameters:{stat}, value, valueType:'percent'}]
 * - requires/excludes 字符串数组 → unlockConditions/excludeConditions（当前均为空，留待扩展）
 * - 旧代码中"下一波有治疗兵时 healSuppress 加权"等运行期特殊加权，暂以 baseWeight 表达，
 *   运行期动态加权可在抽卡系统按快照注入 pityBonus / 扩展 Condition（如 nextWaveHasHealer）。
 */

import { WaveBuffDefinition } from './types';

export const WAVE_BUFFS: WaveBuffDefinition[] = [
    {
        id: 'damage', name: '攻击伤害 +10%', description: '所有塔伤害提升', icon: 'atk',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['damage'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.1, valueType: 'percent', parameters: { stat: 'damage' } }],
    },
    {
        id: 'speed', name: '攻速 +15%', description: '所有塔攻击速度提升', icon: 'spd',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['speed'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.15, valueType: 'percent', parameters: { stat: 'speed' } }],
    },
    {
        id: 'range', name: '范围 +10%', description: '所有塔攻击范围提升', icon: 'rng',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['range'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 100,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.1, valueType: 'percent', parameters: { stat: 'range' } }],
    },
    {
        id: 'healSuppress', name: '治疗抑制', description: '命中治疗兵使其沉默2秒，并削弱其治疗量', icon: 'sil',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['heal', 'silence'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 99, baseWeight: 120,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.4, valueType: 'percent', parameters: { stat: 'healSuppression' } }],
    },
    {
        id: 'splash', name: '溅射爆炸', description: '主弹命中后爆炸 AOE', icon: 'spl',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['poison'], tags: ['poison', 'splash'],
        // 减速塔较多时鼓励同流派深化（近似旧逻辑：slowTower>=2 时加权）
        unlockConditions: [], excludeConditions: [],
        weightRules: [
            { condition: { type: 'hasTower', tag: 'slow', count: 2, operator: '>=' }, multiplier: 1.5 },
            { condition: { type: 'hasBuff', buffId: 'splash', stacks: 1 }, multiplier: 1.3 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 80,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'splash' } }],
    },
    {
        id: 'bleed', name: '出血', description: '概率施加出血并暴击', icon: 'ble',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['poison'], tags: ['poison', 'bleed'],
        unlockConditions: [], excludeConditions: [],
        weightRules: [
            { condition: { type: 'hasBuff', buffId: 'bleed', stacks: 1 }, multiplier: 1.3 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 80,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'bleed' } }],
    },
    {
        id: 'slow', name: '减速强化', description: '所有子弹附带减速', icon: 'slo',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['control'], tags: ['control', 'slow'],
        unlockConditions: [], excludeConditions: [],
        weightRules: [
            { condition: { type: 'hasTower', tag: 'slow', count: 1, operator: '>=' }, multiplier: 1.3 },
        ],
        minWave: 1, maxStacks: 99, baseWeight: 80,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'slow' } }],
    },
];

/** 按 id 取 Buff 定义 */
export function getWaveBuff(id: string): WaveBuffDefinition | undefined {
    return WAVE_BUFFS.find(b => b.id === id);
}
