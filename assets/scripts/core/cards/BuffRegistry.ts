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
    // —— 低权重通用兜底：不再作为三选一主角 ——
    {
        id: 'damage', name: '攻击伤害 +10%', description: '所有塔伤害小幅提升', icon: 'atk',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['fallback', 'damage'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 3, baseWeight: 18,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.1, valueType: 'percent', parameters: { stat: 'damage' } }],
    },
    {
        id: 'speed', name: '攻速 +12%', description: '所有塔攻击速度小幅提升', icon: 'spd',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['firepower'], tags: ['fallback', 'speed'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 3, baseWeight: 18,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.12, valueType: 'percent', parameters: { stat: 'speed' } }],
    },
    {
        id: 'range', name: '安全距离', description: '所有塔范围 +8%，稳住漏怪风险', icon: 'rng',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['role:survival', 'range'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 3, baseWeight: 70,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.08, valueType: 'percent', parameters: { stat: 'range' } }],
    },

    // —— 稳牌：救下一波，但不明显改写流派 ——
    {
        id: 'field_repair', name: '应急维修', description: '基地回复1点生命，并获得10金币', icon: 'rep',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['role:survival', 'repair'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 3, baseWeight: 85,
        effects: [
            { effectType: 'custom', target: { type: 'self' }, value: 1, effectId: 'repairBase' },
            { effectType: 'grantGold', target: { type: 'self' }, value: 10 },
        ],
    },
    {
        id: 'healSuppress', name: '治疗抑制', description: '命中治疗兵使其沉默，针对治疗波的稳牌', icon: 'sil',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'common', tier: 1, buildPaths: ['general'], tags: ['role:survival', 'heal', 'silence'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 3, baseWeight: 75,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.4, valueType: 'percent', parameters: { stat: 'healSuppression' } }],
    },
    {
        id: 'slow', name: '缓速弹幕', description: '所有子弹附带减速，帮你拖住下一波', icon: 'slo',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['control'], tags: ['role:survival', 'control', 'slow'],
        unlockConditions: [{ type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' }],
        excludeConditions: [],
        weightRules: [{ condition: { type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' }, multiplier: 1.3 }],
        minWave: 1, maxStacks: 3, baseWeight: 80,
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'slow' } }],
    },

    // —— 流派牌：让已露头的 build 往一个方向深化 ——
    {
        id: 'straw_close_combat', name: '短管猛戳', description: '奶茶吸管伤害+25%，但射程-8%', icon: 'bob',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'towerType', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['firepower'], tags: ['role:build', 'thrust', 'bubble_tea_straw'],
        unlockConditions: [{ type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' }],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'bubble_tea_straw', count: 2, operator: '>=' }, multiplier: 1.35 },
        ],
        minWave: 1, maxStacks: 1, baseWeight: 90,
        buildId: 'milk_tea_power',
        effects: [
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'bubble_tea_straw' }, value: 0.25, valueType: 'percent', parameters: { stat: 'strawDamage' } },
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'bubble_tea_straw' }, value: 0.08, valueType: 'percent', parameters: { stat: 'strawRangePenalty' } },
        ],
    },
    {
        id: 'core_overdrive', name: '高压供电', description: '被核心供电的奶茶吸管额外+25%伤害、+10%暴击', icon: 'vol',
        systemType: 'waveBuff', contentType: 'fusion', scope: 'towerType', permanent: true,
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['role:build', 'core_power', 'bubble_tea_straw', 'powerbank'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'powerbank', count: 1, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'bubble_tea_straw', count: 2, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 2, maxStacks: 2, baseWeight: 85,
        buildId: 'milk_tea_power',
        effects: [
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'bubble_tea_straw' }, value: 0.25, valueType: 'percent', parameters: { stat: 'corePoweredDamage' } },
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'bubble_tea_straw' }, value: 0.10, valueType: 'percent', parameters: { stat: 'corePoweredCrit' } },
        ],
    },
    {
        id: 'overload_double_tap', name: '过载双击', description: '被核心供电的奶茶吸管，第二次戳击必定暴击', icon: 'odt',
        systemType: 'waveBuff', contentType: 'capstone', scope: 'towerType', permanent: true,
        rarity: 'epic', tier: 3, buildPaths: ['firepower'], tags: ['role:build', 'core_power', 'double_straw', 'bubble_tea_straw', 'powerbank'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'bubble_tea_straw', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'powerbank', count: 1, operator: '>=' },
            { type: 'hasModifier', towerId: 'powerbank', modifierId: 'core_power', stacks: 1 },
            { type: 'hasModifier', towerId: 'bubble_tea_straw', modifierId: 'double_straw', stacks: 1 },
            { type: 'hasCorePoweredTower', towerId: 'bubble_tea_straw', count: 2, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'bubble_tea_straw', count: 2, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 5, maxStacks: 1, baseWeight: 78,
        buildId: 'milk_tea_power',
        effects: [
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'bubble_tea_straw' }, value: 1, parameters: { stat: 'corePoweredSecondStrikeCrit' } },
        ],
    },
    {
        id: 'extended_thread', name: '加长线轴', description: '彩线额外连接2个敌人，缝合持续时间+1.5秒', icon: 'thr',
        systemType: 'waveBuff', contentType: 'fusion', scope: 'towerType', permanent: true,
        rarity: 'rare', tier: 2, buildPaths: ['firepower'], tags: ['role:build', 'needle', 'scissors', 'stitch', 'thread_spool'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'needle', count: 1, operator: '>=' },
            { type: 'hasModifier', towerId: 'needle', modifierId: 'thread_spool', stacks: 1 },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'scissors', count: 1, operator: '>=' }, multiplier: 1.35 },
        ],
        minWave: 2, maxStacks: 1, baseWeight: 88,
        buildId: 'stitch_cut',
        effects: [
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'needle' }, value: 2, parameters: { stat: 'stitchChainTargets' } },
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'needle' }, value: 1.5, parameters: { stat: 'stitchDuration' } },
        ],
    },
    {
        id: 'decisive_cut', name: '利落裁口', description: '剪线引爆伤害+50%，让剪刀成为缝合链的爆点', icon: 'cut',
        systemType: 'waveBuff', contentType: 'capstone', scope: 'towerType', permanent: true,
        rarity: 'epic', tier: 3, buildPaths: ['firepower'], tags: ['role:build', 'needle', 'scissors', 'stitch', 'burst'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'needle', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'scissors', count: 1, operator: '>=' },
            { type: 'hasModifier', towerId: 'needle', modifierId: 'thread_spool', stacks: 1 },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasBuff', buffId: 'extended_thread', stacks: 1 }, multiplier: 1.35 },
        ],
        minWave: 3, maxStacks: 2, baseWeight: 94,
        buildId: 'stitch_cut',
        effects: [
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'needle' }, value: 0.5, valueType: 'percent', parameters: { stat: 'stitchCutDamage' } },
        ],
    },
    {
        id: 'toxic_residue', name: '毒液残留', description: '毒爆会给爆炸范围内敌人留下持续毒', icon: 'tox',
        systemType: 'waveBuff', contentType: 'fusion', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['poison'], tags: ['role:build', 'poison', 'burst'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasBuff', buffId: 'toxic_residue', stacks: 1 }, multiplier: 1.25 },
        ],
        minWave: 2, maxStacks: 3, baseWeight: 90,
        buildId: 'poison_burst',
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'poisonResidue' } }],
    },
    {
        id: 'concentrated_burst', name: '浓缩毒爆', description: '毒爆伤害+35%，半径+10%', icon: 'pbx',
        systemType: 'waveBuff', contentType: 'fusion', scope: 'element', permanent: true,
        rarity: 'rare', tier: 2, buildPaths: ['poison'], tags: ['role:build', 'poison', 'burst'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'rubberband', count: 1, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [],
        minWave: 3, maxStacks: 3, baseWeight: 78,
        buildId: 'poison_burst',
        effects: [
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.35, valueType: 'percent', parameters: { stat: 'poisonBurstDamage' } },
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.10, valueType: 'percent', parameters: { stat: 'poisonBurstRadius' } },
        ],
    },
    {
        id: 'shatter_slow', name: '冻结破甲', description: '锅铲攻击减速敌人时伤害+40%', icon: 'sha',
        systemType: 'waveBuff', contentType: 'fusion', scope: 'towerType', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['control'], tags: ['role:build', 'control', 'spatula', 'slow'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'spatula', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [],
        minWave: 2, maxStacks: 3, baseWeight: 88,
        buildId: 'control_burst',
        effects: [{ effectType: 'modifyStat', target: { type: 'towerType', towerId: 'spatula' }, value: 0.40, valueType: 'percent', parameters: { stat: 'smashSlowedDamage' } }],
    },
    {
        id: 'brush_weakspot', name: '刷洗破绽', description: '牙刷命中减速敌人时，使其额外易伤20%', icon: 'brk',
        systemType: 'waveBuff', contentType: 'fusion', scope: 'towerType', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['control'], tags: ['role:build', 'control', 'toothbrush', 'slow'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'toothbrush', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasTower', towerId: 'spatula', count: 1, operator: '>=' }, multiplier: 1.25 },
        ],
        minWave: 2, maxStacks: 3, baseWeight: 86,
        buildId: 'control_burst',
        effects: [{ effectType: 'modifyStat', target: { type: 'towerType', towerId: 'toothbrush' }, value: 0.20, valueType: 'percent', parameters: { stat: 'brushSlowVulnerable' } }],
    },
    {
        id: 'heavy_spatula', name: '重击预热', description: '锅铲砸击半径+25%，但攻击间隔+15%', icon: 'hvy',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'towerType', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['control'], tags: ['role:build', 'control', 'spatula'],
        unlockConditions: [{ type: 'hasTower', towerId: 'spatula', count: 1, operator: '>=' }],
        excludeConditions: [], weightRules: [],
        minWave: 2, maxStacks: 2, baseWeight: 70,
        buildId: 'control_burst',
        effects: [
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'spatula' }, value: 0.25, valueType: 'percent', parameters: { stat: 'smashRadius' } },
            { effectType: 'modifyStat', target: { type: 'towerType', towerId: 'spatula' }, value: 0.15, valueType: 'percent', parameters: { stat: 'smashIntervalPenalty' } },
        ],
    },
    {
        id: 'shard_detonation', name: '碎裂爆破', description: '锅铲命中被牙刷刷洗的敌人时，触发一次小范围爆破', icon: 'det',
        systemType: 'waveBuff', contentType: 'capstone', scope: 'element', permanent: true,
        rarity: 'epic', tier: 3, buildPaths: ['control'], tags: ['role:build', 'control', 'spatula', 'toothbrush', 'slow', 'burst'],
        unlockConditions: [
            { type: 'hasTower', towerId: 'spatula', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'toothbrush', count: 1, operator: '>=' },
            { type: 'hasTower', towerId: 'slow', count: 1, operator: '>=' },
            { type: 'hasBuff', buffId: 'brush_weakspot', stacks: 1 },
        ],
        excludeConditions: [], weightRules: [
            { condition: { type: 'hasBuff', buffId: 'shatter_slow', stacks: 1 }, multiplier: 1.25 },
        ],
        minWave: 3, maxStacks: 2, baseWeight: 92,
        buildId: 'control_burst',
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'smashBrushedBurst' } }],
    },
    {
        id: 'splash', name: '溅射爆炸', description: '主弹命中后爆炸 AOE，适合杀虫喷雾扩散', icon: 'spl',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['poison'], tags: ['role:build', 'poison', 'splash'],
        unlockConditions: [{ type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' }],
        excludeConditions: [],
        weightRules: [{ condition: { type: 'hasBuff', buffId: 'splash', stacks: 1 }, multiplier: 1.2 }],
        minWave: 1, maxStacks: 3, baseWeight: 62,
        buildId: 'poison_burst',
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'splash' } }],
    },
    {
        id: 'bleed', name: '出血暴击', description: '概率施加出血，攻击出血敌人有暴击机会', icon: 'ble',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'element', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['poison'], tags: ['role:build', 'poison', 'bleed'],
        unlockConditions: [{ type: 'hasTower', towerId: 'poison', count: 1, operator: '>=' }],
        excludeConditions: [],
        weightRules: [{ condition: { type: 'hasBuff', buffId: 'bleed', stacks: 1 }, multiplier: 1.2 }],
        minWave: 1, maxStacks: 3, baseWeight: 58,
        buildId: 'poison_burst',
        effects: [{ effectType: 'modifyStat', target: { type: 'allTowers' }, value: 1, parameters: { stat: 'bleed' } }],
    },

    // —— 贪牌：给明显收益，同时带代价 ——
    {
        id: 'borrowed_expansion', name: '借款扩建', description: '立即获得90金币，但全局攻速-3%', icon: 'loan',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['general'], tags: ['role:greed', 'economy'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 1, maxStacks: 2, baseWeight: 90,
        effects: [
            { effectType: 'grantGold', target: { type: 'self' }, value: 90 },
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: -0.03, valueType: 'percent', parameters: { stat: 'speed' } },
        ],
    },
    {
        id: 'glass_cannon', name: '孤注一掷', description: '基地失去1点生命，所有塔伤害+22%', icon: 'risk',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['firepower'], tags: ['role:greed', 'damage'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 2, maxStacks: 2, baseWeight: 82,
        effects: [
            { effectType: 'custom', target: { type: 'self' }, value: 1, effectId: 'hurtBase' },
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.22, valueType: 'percent', parameters: { stat: 'damage' } },
        ],
    },
    {
        id: 'overextend_range', name: '压线布防', description: '所有塔范围+18%，但伤害-8%', icon: 'line',
        systemType: 'waveBuff', contentType: 'general', scope: 'global', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['general'], tags: ['role:greed', 'range'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 2, maxStacks: 2, baseWeight: 72,
        effects: [
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.18, valueType: 'percent', parameters: { stat: 'range' } },
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: -0.08, valueType: 'percent', parameters: { stat: 'damage' } },
        ],
    },

    // —— 高风险高回报：代价真实可感、回报有质变感、结果有波动 ——
    {
        id: 'caffeine_overdrive', name: '咖啡因过载', description: 'BOSS波塔伤害+60%，非BOSS波塔伤害-25%', icon: 'caf',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'global', permanent: true,
        rarity: 'epic', tier: 2, buildPaths: ['firepower'], tags: ['role:greed', 'boss', 'damage'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 3, maxStacks: 1, baseWeight: 76,
        effects: [
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: 0.6, valueType: 'percent', parameters: { stat: 'bossWaveDamage' } },
            { effectType: 'modifyStat', target: { type: 'allTowers' }, value: -0.25, valueType: 'percent', parameters: { stat: 'nonBossWaveDamage' } },
        ],
    },
    {
        id: 'double_or_nothing', name: '双倍或全无', description: '下一波零漏怪+150金币；每漏1只额外-1命', icon: 'dbl',
        systemType: 'waveBuff', contentType: 'mechanic', scope: 'global', permanent: true,
        rarity: 'rare', tier: 1, buildPaths: ['general'], tags: ['role:greed', 'economy', 'gamble'],
        unlockConditions: [], excludeConditions: [], weightRules: [],
        minWave: 2, maxStacks: 3, baseWeight: 80,
        effects: [
            { effectType: 'custom', target: { type: 'self' }, value: 150, effectId: 'doubleOrNothing' },
        ],
    },
];

/** 按 id 取 Buff 定义 */
export function getWaveBuff(id: string): WaveBuffDefinition | undefined {
    return WAVE_BUFFS.find(b => b.id === id);
}
