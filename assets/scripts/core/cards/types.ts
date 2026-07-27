/**
 * cards/types.ts — 卡牌/强化统一数据模型（公共字段 + 两类子结构）
 *
 * 设计目标：抽卡（五选二）与波后三选一（Buff）共用同一套基础字段，
 * 通过 systemType 区分；效果用配置（EffectDefinition）描述，取代直接写 apply 函数，
 * 便于存档、配置、调试、统计与后续编辑器。
 *
 * 本目录为新增数据层，未接入运行主流程（SceneInitializer 仍用旧 RoguelikeCards），
 * 作为后续大规模扩展（几十张卡）的基础。
 */

/** 比较运算符 */
export type CompareOp = '>=' | '=' | '<=';

/** 游戏标签（元素/机制/流派等，配置驱动，用 string 保持扩展灵活） */
export type GameTag = string;

/** 构筑路线（与 RoguelikeCards.BuildPath 同义，此处作为新数据层规范来源） */
export type BuildPath =
    | 'firepower'   // 火力
    | 'poison'      // 剧毒
    | 'control'     // 控制
    | 'general';    // 通用

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Tier = 1 | 2 | 3;

// ====================================================================
// 一、结构化条件 Condition
// ====================================================================
export type Condition =
    | { type: 'hasTower'; towerId?: string; tag?: GameTag; count: number; operator: CompareOp }
    | { type: 'hasBuff'; buffId: string; stacks: number }
    | { type: 'hasTag'; tag: GameTag; count: number }
    | { type: 'wave'; value: number; operator: CompareOp }
    | { type: 'buildPath'; path: BuildPath }
    | { type: 'boardState'; state: 'hasEmptyTile' | 'hasLockedTile' | 'boardFull' };

// ====================================================================
// 二、动态权重规则 WeightRule
// ====================================================================
export interface WeightRule {
    condition: Condition;
    multiplier?: number;     // 满足条件时乘以该倍率
    addWeight?: number;      // 满足条件时额外加权重
}

// ====================================================================
// 三、效果配置 EffectDefinition（替代 apply 函数）
// ====================================================================
export type EffectType =
    | 'spawnTower'
    | 'unlockTile'
    | 'modifyStat'
    | 'addStatus'
    | 'dealDamage'
    | 'modifyProjectile'
    | 'triggerReaction'
    | 'grantGold'
    | 'addModifier'
    | 'changeRule'
    | 'custom';

export type EffectTarget =
    | { type: 'self' }
    | { type: 'allTowers' }
    | { type: 'towerType'; towerId: string }
    | { type: 'enemy' }
    | { type: 'enemyWithStatus'; status: string }
    | { type: 'battlefield' }
    | { type: 'tile'; tileType: 'empty' | 'locked' | 'occupied' };

export interface EffectDefinition {
    effectType: EffectType;
    target: EffectTarget;
    value?: number;
    valueType?: 'flat' | 'percent';
    duration?: number;
    chance?: number;
    parameters?: Record<string, string | number | boolean>;
    effectId?: string;       // 仅 effectType='custom' 使用，由代码注册对应处理器
}

// ====================================================================
// 四、基础定义 BaseOptionDefinition
// ====================================================================
export interface BaseOptionDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;

    systemType: 'drawCard' | 'waveBuff';
    contentType: string;

    rarity: Rarity;
    tier: Tier;
    buildPaths: BuildPath[];
    tags: GameTag[];

    unlockConditions: Condition[];
    excludeConditions: Condition[];
    weightRules: WeightRule[];

    minWave: number;
    maxWave?: number;
    maxStacks: number;

    baseWeight: number;
    effects: EffectDefinition[];

    // 预留字段
    enabled?: boolean;       // 是否进入正式牌池
    debugOnly?: boolean;     // 是否仅供测试
    version?: number;        // 配置版本
    sortOrder?: number;      // 图鉴/编辑器排序
    localizationKey?: string;// 多语言文案键
}

// ====================================================================
// 五、五选二卡牌 DrawCardDefinition
// ====================================================================
export type DrawCardContentType = 'tower' | 'tool' | 'modifier' | 'tactic';
export type DrawCardTargetType =
    | 'emptyTile'
    | 'lockedTile'
    | 'tower'
    | 'enemy'
    | 'battlefield'
    | 'instant';
export type DrawCardPlayTiming = 'preBattle' | 'inBattle' | 'anytime';

export interface DrawCardDefinition extends BaseOptionDefinition {
    systemType: 'drawCard';
    contentType: DrawCardContentType;

    targetType: DrawCardTargetType;
    playTiming: DrawCardPlayTiming;
    consumeOnUse: boolean;
    targetConditions: Condition[];

    towerId?: string;            // contentType='tower' 时指向塔定义
    modifierSlotCost?: number;   // contentType='modifier' 时占用词缀槽数
}

// ====================================================================
// 六、波后三选一 WaveBuffDefinition
// ====================================================================
export type WaveBuffContentType =
    | 'general'
    | 'element'
    | 'fusion'
    | 'mechanic'
    | 'branch'
    | 'capstone';
export type WaveBuffScope = 'global' | 'element' | 'buildPath' | 'towerType';

export interface WaveBuffDefinition extends BaseOptionDefinition {
    systemType: 'waveBuff';
    contentType: WaveBuffContentType;

    scope: WaveBuffScope;
    branchGroup?: string;       // contentType='branch' 时确定流派分支（互斥）
    permanent: true;            // 三选一选中后直接加入本局构筑，恒为 true
}

// ====================================================================
// 七、执行器上下文（由运行主流程实现并注入）
// ====================================================================
/** 条件/权重评估所需的对局快照（运行主流程在评估时提供） */
export interface GameSnapshot {
    towers: { id: string; tags: GameTag[] }[];
    buffStacks: Record<string, number>;     // buffId -> 已选层数
    selectedBuffIds: string[];
    currentWave: number;
    buildPaths: BuildPath[];
    board: { hasEmptyTile: boolean; hasLockedTile: boolean; boardFull: boolean };
}

/** 效果执行所需的对局上下文（运行主流程实现具体棋盘/塔操作） */
export interface EffectContext {
    towerStats: import('../RoguelikeCards').TowerStats;
    spawnTower?(towerId: string, params?: Record<string, string | number | boolean>): void;
    unlockTile?(params?: Record<string, string | number | boolean>): void;
    modifyTowerStat?(towerId: string, stat: string, value: number, valueType?: 'flat' | 'percent'): void;
    addStatusToEnemies?(status: string, duration: number, chance?: number): void;
    dealDamageToEnemies?(amount: number, params?: Record<string, string | number | boolean>): void;
    modifyProjectile?(params: Record<string, string | number | boolean>): void;
    triggerReaction?(params: Record<string, string | number | boolean>): void;
    grantGold?(amount: number): void;
    addModifierToTower?(towerId: string, modifierId: string): void;
    changeRule?(params: Record<string, string | number | boolean>): void;
    custom?(effectId: string, effect: EffectDefinition): void;
}
