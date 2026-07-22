/**
 * 全局事件名称定义
 * 使用常量字符串避免硬编码，方便维护与重构
 */
export class EventNames {
    // --- 游戏状态 ---
    public static readonly GAME_STATE_CHANGED = 'game-state-changed';
    public static readonly GAME_START = 'game-start';
    public static readonly GAME_OVER = 'game-over';
    public static readonly VICTORY = 'victory';

    // --- 波次 ---
    public static readonly WAVE_START = 'wave-start';
    public static readonly WAVE_END = 'wave-end';
    public static readonly ALL_WAVES_CLEARED = 'all-waves-cleared';

    // --- 经济 ---
    public static readonly GOLD_CHANGED = 'gold-changed';
    public static readonly LIVES_CHANGED = 'lives-changed';
    public static readonly NOT_ENOUGH_GOLD = 'not-enough-gold';

    // --- 塔 ---
    public static readonly TOWER_PLACED = 'tower-placed';
    public static readonly TOWER_UPGRADED = 'tower-upgraded';
    public static readonly TOWER_SOLD = 'tower-sold';
    public static readonly TOWER_SELECTED = 'tower-selected';
    public static readonly TOWER_DESELECTED = 'tower-deselected';

    // --- 敌人 ---
    public static readonly ENEMY_SPAWNED = 'enemy-spawned';
    public static readonly ENEMY_KILLED = 'enemy-killed';
    public static readonly ENEMY_REACHED_END = 'enemy-reached-end';
}
