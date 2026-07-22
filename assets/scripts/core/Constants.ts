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
}
