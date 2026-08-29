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

];

export function getTowerModifier(id: string): TowerModifierDefinition | undefined {
    return TOWER_MODIFIERS.find(m => m.id === id);
}
