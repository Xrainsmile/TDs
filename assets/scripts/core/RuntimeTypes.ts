import { Graphics, Node } from 'cc';
import { EnemyType } from './Constants';
import { TowerDef } from './GameBalance';

/** 单塔有效属性（解析全局 roguelike buff + 二星固定强化 + 随机词缀 后的结果） */
export interface TowerParams {
    damage: number;
    interval: number;
    range: number;
    poisonDps: number;
    poisonDuration: number;
    slowMultiplier: number;
    slowDuration: number;
    vulnerable: number;
    executeBonus: number;
    rapid: boolean;
    critChance: number;
    critMultiplier: number;
    thrustRepeatCount?: number;
    thrustRepeatDelay?: number;
    poisonOnHitDps?: number;
    poisonOnHitDuration?: number;
}

/** 伤害归因标签：战斗系统只负责提供事实，试玩记录器负责聚合。 */
export interface DamageAttribution {
    sourceType: 'tower' | 'status' | 'mechanism' | 'tactic' | 'unknown';
    sourceId: string;
    sourceName: string;
    towerId?: string;
    towerName?: string;
    mechanismId: string;
    mechanismName: string;
    isCrit?: boolean;
    isOverload?: boolean;
}

export interface EnemyBuffRuntime {
    timer: number;
    dps: number;
    chainId?: number;
    damageSource?: DamageAttribution;
}

/** 词缀 id（每种塔 3 个专属正向词缀） */
export type AffixId =
    | 'rapid' | 'heavy' | 'execute'
    | 'deepfreeze' | 'linger' | 'vulnerable'
    | 'virulent' | 'persistent' | 'contagious';

/** thrust 戳击动画状态机 */
export interface ThrustState {
    active: boolean;
    phase: 'extend' | 'pause' | 'retract' | 'repeatWait' | 'idle';
    timer: number;
    dirX: number;
    dirY: number;
    damaged: boolean;
    strikeIndex: number;
    totalStrikes: number;
    repeatDelay: number;
}

/** spin 旋斩通道状态机 */
export interface SpinState {
    active: boolean;
    timer: number;
    tickTimer: number;
}

/** 塔运行时状态（合并系统使用） */
export interface TowerRuntime {
    node: Node;
    def: TowerDef;
    star: number;
    affix: AffixId | null;

    attackCount: number;
    disabledTimer: number;
    auraSpeedMul: number;
    corePowered: boolean;
    corePowerCritChance: number;
    corePowerCritMultiplier: number;
    corePowerRing?: Node | null;
    corePowerLink?: Node | null;
    corePowerLinkGfx?: Graphics | null;
    corePowerLinkPhase: number;

    straw?: Node | null;
    doubleStrawMarker?: Node | null;
    thrust?: ThrustState | null;
    thrustDebug?: Graphics | null;

    spin?: SpinState | null;
    spinRing?: Node | null;
}

/** 敌人运行时数据（定义在配置表之外，因为含运行时状态） */
export interface EnemyRuntime {
    node: Node;
    bossHpRing?: Node | null;
    bossHpRingGfx?: Graphics | null;
    hp: number;
    maxHp: number;
    slowTimer: number;
    slowMultiplier: number;
    vulnerable: number;
    vulnerableTimer: number;
    type: EnemyType;
    healTimer: number;
    healCd: number;
    extraTimer: number;
    pathIdx: number;
    bossEnraged: boolean;
    buffs: Record<string, EnemyBuffRuntime>;
}

/** pierce 缝衣针飞行弹体 */
export interface PierceShot {
    node: Node;
    fromX: number;
    fromY: number;
    dirX: number;
    dirY: number;
    speed: number;
    traveled: number;
    range: number;
    halfW: number;
    damage: number;
    maxTargets: number;
    hitCount: number;
    hitSet: Set<EnemyRuntime>;
    targetSet: Set<EnemyRuntime>;
    sourceTowerId: string;
    sourceTowerName: string;
}
