import { TowerModifierDefinition } from './types';

/**
 * 塔改造注册表（本局同类塔生效）。
 * - towerId：仅对单一塔类型生效（如双管吸管 → 奶茶吸管）
 * - compatibleAttackTypes：按攻击类型生效（如分裂弹道 → 子弹/弹射类塔）
 * 改造卡拖到一座塔上确定对象，激活后本局所有同类型塔共享，重开清空。
 */
export const TOWER_MODIFIERS: TowerModifierDefinition[] = [
    {
        id: 'double_straw',
        name: '双管吸管',
        description: '本局所有奶茶吸管每轮连续戳击2次（每次70%伤害，攻击间隔+20%）',
        towerId: 'bubble_tea_straw',
        compatibleAttackTypes: ['thrust'],
        maxStacks: 1,
        changes: {
            repeatCount: 2,
            repeatDelay: 0.10,
            damageMultiplier: 0.7,
            intervalMultiplier: 1.2,
        },
    },
    {
        id: 'split',
        name: '分裂弹道',
        description: '本局所有同类塔的终结子弹向附近2个敌人分裂，分裂子弹造成50%伤害',
        compatibleAttackTypes: ['projectile', 'chain'],
        maxStacks: 1,
        changes: {},
    },
    {
        id: 'venom_bounce',
        name: '淬毒橡皮筋',
        description: '本局所有橡皮筋命中、弹射和分裂弹都会施加中毒（5/s，4秒）',
        towerId: 'rubberband',
        compatibleAttackTypes: ['chain'],
        maxStacks: 1,
        changes: {
            poisonDps: 5,
            poisonDuration: 4,
        },
    },
    {
        id: 'poison_burst',
        name: '毒爆',
        description: '中毒敌人死亡时爆炸，对附近敌人造成18点伤害',
        towerId: 'poison',
        compatibleAttackTypes: ['projectile'],
        maxStacks: 1,
        changes: {
            poisonExplosionDamage: 18,
            poisonExplosionRadius: 70,
        },
    },
    {
        id: 'core_power',
        name: '核心供电',
        description: '每个充电宝额外强化范围内所有奶茶吸管：攻速+35%，25%暴击造成2倍伤害',
        towerId: 'powerbank',
        compatibleAttackTypes: ['thrust'],
        maxStacks: 1,
        changes: {
            corePowerSpeedBonus: 0.35,
            corePowerCritChance: 0.25,
            corePowerCritMultiplier: 2,
        },
    },
    {
        id: 'thread_spool',
        name: '彩色线轴',
        description: '筷子同一次穿透命中的敌人会被彩线串联，剪刀命中其中一个时剪断整条线',
        towerId: 'chopsticks',
        compatibleAttackTypes: ['pierce'],
        maxStacks: 1,
        changes: {
            skewerChainTargets: 4,
            skewerDuration: 4,
            skewerCutDamageMultiplier: 0.8,
            maxSkewerChains: 3,
        },
    },

    // ===== 通用改造卡（商业化：解决构筑疲倦）=====
    // 设计意图：原改造卡全部绑定单一塔种，选定流派后其余改造卡与你无关，
    // 第 5 波成型后没有新决策可做，只能重复铺同型塔。
    // 通用改造不指定 towerId，按攻击类型匹配，保证后期每次抽牌都可能带来新组合。
    {
        id: 'overheat',
        name: '过热线圈',
        description: '攻速 +40%，但单次伤害 -15%（拖到任意塔，本局同类塔共享）',
        compatibleAttackTypes: ['projectile', 'chain', 'pierce', 'spray', 'thrust', 'spin', 'smash', 'sweep'],
        maxStacks: 2,
        changes: {
            intervalMultiplier: 0.7143,   // 1/1.4 ≈ 0.7143，即攻速 +40%
            damageMultiplier: 0.85,
        },
    },
    {
        id: 'long_barrel',
        name: '加长枪管',
        description: '射程 +30%，伤害 +10%（拖到任意攻击型塔，本局同类塔共享）',
        compatibleAttackTypes: ['projectile', 'chain', 'pierce', 'spray', 'thrust'],
        maxStacks: 2,
        changes: {
            rangeMultiplier: 1.3,
            damageMultiplier: 1.1,
        },
    },
    {
        id: 'wide_caliber',
        name: '加宽口径',
        description: '作用范围 +35%（拖到任意范围/横扫类塔，本局同类塔共享）',
        compatibleAttackTypes: ['spin', 'smash', 'sweep', 'spray'],
        maxStacks: 2,
        changes: {
            radiusMultiplier: 1.35,
            angleBonus: 25,
        },
    },
    {
        id: 'salvage_gear',
        name: '回收齿轮',
        description: '击杀返还 2 金币（拖到任意攻击型塔，本局同类塔共享）',
        compatibleAttackTypes: ['projectile', 'chain', 'pierce', 'spray', 'thrust', 'spin', 'smash', 'sweep'],
        maxStacks: 3,
        changes: {},   // 击杀返金由运行时按 modifier 存在与否判定，无数值字段
    },
    {
        id: 'pierce_tip',
        name: '穿刺弹头',
        description: '额外命中 1 个目标（拖到任意攻击型塔，本局同类塔共享）',
        compatibleAttackTypes: ['projectile', 'chain', 'pierce', 'spray', 'thrust', 'spin', 'smash', 'sweep'],
        maxStacks: 2,
        changes: {
            maxTargetsBonus: 1,
        },
    },
    {
        id: 'heavy_head',
        name: '加重弹头',
        description: '伤害 +35%，攻速 -20%（拖到任意攻击型塔，本局同类塔共享）',
        compatibleAttackTypes: ['projectile', 'chain', 'pierce', 'spray', 'thrust', 'spin', 'smash', 'sweep'],
        maxStacks: 2,
        changes: {
            damageMultiplier: 1.35,
            intervalMultiplier: 1.25,   // 攻速 -20% 等价于间隔 ×1.25
        },
    },
];

export function getTowerModifier(id: string): TowerModifierDefinition | undefined {
    return TOWER_MODIFIERS.find(m => m.id === id);
}
