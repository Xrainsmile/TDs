import { Enemy } from '../../entities/Enemy';

/**
 * Buff 类型枚举
 */
export enum BuffType {
    BURN = 'burn',       // 火焰：持续伤害
    POISON = 'poison',   // 毒：持续伤害 + 可叠加
    FREEZE = 'freeze',   // 冰：完全冻结
    SLOW = 'slow',       // 减速
    BLEED = 'bleed',     // 流血：持续物理伤害
    STUN = 'stun',       // 眩晕：无法移动
    CURSE = 'curse',     // 诅咒：死亡时爆炸
    MARK = 'mark',       // 标记：受到额外伤害
}

/**
 * Buff 分类
 */
export enum BuffCategory {
    DOT = 'dot',         // 持续伤害
    CC = 'cc',           // 控制效果
    DEBUFF = 'debuff',   // 减益
    SPECIAL = 'special',  // 特殊
}

/**
 * Buff 配置数据
 */
export interface BuffConfig {
    type: BuffType;
    name: string;
    category: BuffCategory;
    duration: number;        // 持续时间（秒）
    tickInterval: number;   // DOT 间隔（秒），0 表示无 tick
    tickDamage: number;      // 每次 tick 伤害
    moveSpeedMultiplier: number; // 移速倍率（1=正常，0=冻结）
    maxStacks: number;       // 最大叠加层数（1=不可叠加）
    canRefresh: boolean;      // 是否刷新持续时间
    effectColor?: { r: number; g: number; b: number; a: number }; // 视觉效果颜色
}

/**
 * IBuff 接口 - 所有 Buff 的基类接口
 *
 * Buff 设计原则：
 * 1. Buff 只持有数据和时间，不直接操作 Enemy
 * 2. BuffSystem 统一管理所有 Buff 的更新
 * 3. Enemy 通过 StatusEffectManager 查询自身状态
 */
export interface IBuff {
    /** Buff 类型 */
    readonly type: BuffType;
    /** 当前层数 */
    stacks: number;
    /** 剩余时间 */
    remainingTime: number;
    /** 配置 */
    config: BuffConfig;
}
