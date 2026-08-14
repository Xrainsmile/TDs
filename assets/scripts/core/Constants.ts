/**
 * 游戏全局常量
 */
export const GameConfig = {
    GRID_SIZE: 64,
    INITIAL_GOLD: 200,
    INITIAL_LIVES: 20,
    ENEMY_REACH_END_COST: 1,
    TOWER_SELL_RETURN_RATIO: 0.7,
} as const;

export enum GameState {
    MENU = 0,
    PREPARING = 1,
    WAVE_RUNNING = 2,
    WAVE_CLEARED = 3,
    GAME_OVER = 4,
    VICTORY = 5,
}

export enum TowerType {
    ARROW = 1,
    CANNON = 2,
    MAGIC = 3,
}

export enum EnemyType {
    NORMAL = 1,
    FAST = 2,
    TANK = 3,
    BOSS = 4,
    HEALER = 5,
    ELITE = 6,
}

// ===== 敌人战斗分级（EnemyType 映射，详见 SceneInitializer.ENEMY_REGISTRY）=====
//   NORMAL = 1级小兵（最弱）
//   FAST   = 2级小兵（中等）
//   TANK   = 3级小兵（小兵中最强）
//   ELITE  = 精英
//   BOSS   = boss
//   HEALER = 治疗兵（支援型，独立于战斗分级，不在 1~3 级小兵/精英/boss 序列内）
// 注：枚举成员名保持 NORMAL/FAST/TANK 不变，因 entities/Enemy.ts、
//     systems/EnemyController.ts、utils/PrefabFactory.ts（旧架构遗留）仍引用这些名字。
//     分级语义由 ENEMY_REGISTRY 中的 EnemyDef.name / hpMultiplier / speedMultiplier 表达。
