/**
 * 全局事件名称
 */
export const GameEvents = {
    GAME_STATE_CHANGED: 'game-state-changed',
    GAME_START: 'game-start',
    GAME_OVER: 'game-over',
    VICTORY: 'victory',

    WAVE_START: 'wave-start',
    WAVE_END: 'wave-end',
    ALL_WAVES_CLEARED: 'all-waves-cleared',
    START_NEXT_WAVE: 'start-next-wave',

    GOLD_CHANGED: 'gold-changed',
    LIVES_CHANGED: 'lives-changed',
    NOT_ENOUGH_GOLD: 'not-enough-gold',

    TOWER_PLACED: 'tower-placed',
    TOWER_UPGRADED: 'tower-upgraded',
    TOWER_SOLD: 'tower-sold',
    TOWER_SELECTED: 'tower-selected',
    TOWER_DESELECTED: 'tower-deselected',

    ENEMY_SPAWNED: 'enemy-spawned',
    ENEMY_KILLED: 'enemy-killed',
    ENEMY_REACHED_END: 'enemy-reached-end',

    ENEMIES_CLEARED: 'enemies-cleared',
} as const;
