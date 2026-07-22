import { TowerType, EnemyType } from '../core/Constants';

/**
 * 塔/敌人/关卡数据接口定义
 * 用于类型安全地加载 JSON 配置
 */

export interface TowerConfigData {
    type: TowerType;
    name: string;
    cost: number;
    /** 每级升级费用倍率 */
    upgradeCostMultiplier: number;
    /** 基础属性 */
    base: {
        attackRange: number;
        attackDamage: number;
        attackInterval: number;
    };
    /** 每级属性增长倍率 */
    growth: {
        attackRange: number;
        attackDamage: number;
        attackInterval: number;
    };
}

export interface EnemyConfigData {
    type: EnemyType;
    name: string;
    hp: number;
    moveSpeed: number;
    killGold: number;
    livesCost: number;
}

export interface WaveEnemyConfig {
    enemyType: EnemyType;
    count: number;
    interval: number;
    delay: number;
}

export interface LevelWaveConfig {
    waveIndex: number;
    enemies: WaveEnemyConfig[];
}

export interface LevelConfigData {
    levelId: number;
    levelName: string;
    initialGold: number;
    initialLives: number;
    /** 路径点（世界坐标） */
    pathPoints: { x: number; y: number }[];
    /** 可放置塔的格子坐标列表 */
    buildSlots: { x: number; y: number }[];
    waves: LevelWaveConfig[];
}
