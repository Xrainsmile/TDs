import { TowerType, EnemyType } from '../core/Constants';

/** 塔配置 */
export interface TowerConfig {
    type: TowerType;
    name: string;
    cost: number;
    upgradeCostMultiplier: number;
    base: {
        attackRange: number;
        attackDamage: number;
        attackInterval: number;
    };
    growth: {
        attackRange: number;
        attackDamage: number;
        attackInterval: number;
    };
}

/** 敌人配置 */
export interface EnemyConfig {
    type: EnemyType;
    name: string;
    hp: number;
    moveSpeed: number;
    killGold: number;
    livesCost: number;
}

/** 单个波次中的敌人组 */
export interface WaveEnemyConfig {
    enemyType: EnemyType;
    count: number;
    interval: number;
    delay: number;
}

/** 一整波 */
export interface LevelWaveConfig {
    waveIndex: number;
    enemies: WaveEnemyConfig[];
}

/** 关卡配置 */
export interface LevelConfig {
    levelId: number;
    levelName: string;
    initialGold: number;
    initialLives: number;
    pathPoints: { x: number; y: number }[];
    buildSlots: { x: number; y: number }[];
    waves: LevelWaveConfig[];
}
