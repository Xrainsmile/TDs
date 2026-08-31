import { Vec3, Color } from 'cc';
import { EnemyType } from './Constants';

/**
 * GameBalance.ts — 塔防游戏所有静态数值配置
 *
 * 从 SceneInitializer.ts 抽出，方便独立调参与 AI 辅助开发时定位。
 * SceneInitializer 通过 import 引用这些常量和注册表。
 */

// ===== 地图几何已迁移至 MapConfig.ts =====
// 地图设计尺寸、道路 waypoints、入口/基地、塔位固定坐标与布局校验集中保存在
// assets/scripts/core/MapConfig.ts，本文件不再定义地图布局相关常量。

// ===== 基础数值 =====
export const ENEMY_SPEED = 80;
export const BULLET_SPEED = 500;

// ===== 金币 =====
export const INITIAL_GOLD = 50;   // 开局金币（0.3.2：30→50，缓解前期只能抽1轮导致W1必崩）
export const KILL_REWARD = 4;     // 每击杀一个敌人奖励（0.3.3：3→4，缓解后期输出跟不上血量成长）
// 波末奖励（0.3.3：整体上调，后期有资本补强，从 [20,20,25,25,40,40,40] 提升）
export const WAVE_BONUSES = [25, 30, 35, 40, 50, 55, 60];

// ===== 倒计时 =====
// 关卡开头倒计时（秒）：给玩家时间建塔布防
export const LEVEL_START_COUNTDOWN = 5;

// ===== 治疗兵参数 =====
export const HEAL_RADIUS = 120;
export const HEAL_INTERVAL = 3.0;
export const HEAL_AMOUNT = 10;
// 治疗抑制卡：命中治疗兵后使其进入沉默的持续时间（秒），期间无法治疗
export const HEAL_SILENCE = 2.0;

// ===== BOSS 参数 =====
export const BOSS_SKILL_INTERVAL = 5.0;   // 每 5 秒锁定一座塔释放技能
export const BOSS_LOCK_DURATION = 3.0;    // 锁定后玩家可应对的倒计时（秒）
export const BOSS_CEASEFIRE = 8.0;        // 一星塔未应对时的停火时长（秒）

// ===== 类型定义 =====
export type TowerAttackKind = 'bullet' | 'instant';

export interface TowerDef {
    id: string;
    name: string;
    cost: number;
    color: Color;
    rangeColor: Color;
    buttonPos: Vec3;

    // 攻击行为统一描述（伤害/射程/节奏/形态/状态效果）。
    // 旧字段 damage/range/interval 已迁移到 attack 下，避免两套独立数值配置。
    attack: AttackDefinition;

    // ===== 过渡期运行时开关（由 attack.attackType 在 normalizeTowerDef 中派生）=====
    // 下一阶段按 aimMode/maxTargets/maxHitsPerTarget 重写 fireBullet/applyTowerEffect/findTarget 后，
    // 将直接读取 attack 字段，这些派生字段会被移除。
    attackKind?: TowerAttackKind;   // 派生：'bullet' | 'instant'
    sweep?: boolean;                // 派生：attackType === 'sweep'
    bounce?: number;                // 派生：attackType === 'chain' 时的 maxTargets
    support?: boolean;              // 辅助塔：不攻击，提供攻速光环
    auraSpeedBonus?: number;        // 充电宝：光环攻速加成（0.25 = +25%）

    applyInstant?: (enemy: any) => void;
    onBulletHit?: (enemy: any) => void;
}

// ===== 攻击类型重定义（AttackDefinition）=====
// 取代旧的两态 attackKind: 'bullet' | 'instant'。
// 一座塔的攻击行为由一份 AttackDefinition 描述，覆盖攻击形态、射程、伤害节奏、
// 命中目标策略与附带的状态效果，便于后续肉鸽词缀/卡牌统一改写攻击行为。
export interface StatusEffectDefinition {
    type: 'BURN' | 'POISON' | 'FREEZE' | 'SLOW' | 'BLEED' | 'STUN' | 'CURSE' | 'MARK';
    duration: number;   // 持续时间（秒）；DOT/光环类 0 表示持续到目标死亡
    magnitude?: number; // 强度：减速倍率、DOT 每跳伤害、易伤倍率等
    stacks?: number;    // 叠加层数（默认 1）
    tickInterval?: number; // DOT 类每跳间隔（秒）
}

export interface AttackDefinition {
    attackType:
        | 'thrust'    // 突刺：单体近距直线
        | 'sweep'     // 横扫：扇形范围
        | 'spin'      // 旋斩：自身圆周范围
        | 'smash'     // 砸击：范围爆发
        | 'spray'     // 喷射：短距扇形持续
        | 'projectile'// 弹道：单体飞行物
        | 'scatter'   // 散射：一次多枚弹道
        | 'lob'       // 抛射：抛物线落点范围
        | 'pierce'    // 贯穿：直线穿透多目标
        | 'chain';    // 链击：弹射多目标

    rangeBand: 'contact' | 'short' | 'medium' | 'long';

    range: number;
    angle?: number;          // 扇形/横扫张角（度）
    width?: number;          // 直线/贯穿宽度
    radius?: number;         // 范围爆发/旋斩半径

    damage: number;
    attackInterval: number;  // 攻击间隔（秒）
    attackDuration?: number;  // 持续型（spray/spin）单次持续时长（秒）
    damageTick?: number;     // 持续型每跳伤害间隔（秒）

    maxTargets?: number;      // 同时命中目标数上限
    maxHitsPerTarget: number; // 同一目标最多命中次数
    canPierce?: boolean;      // 是否可穿透（pierce/scatter 用）

    aimMode:
        | 'nearest'           // 最近目标
        | 'first'             // 最前进（路径最前）目标
        | 'highestHp'         // 血量最高
        | 'unaffected'        // 尚未受本塔状态效果影响（软偏好：有则池内按 first，无则全体按 first）
        | 'mostEnemies'       // 目标最密集方向
        | 'fixedDirection';   // 固定方向（无索敌）

    statusEffects?: StatusEffectDefinition[];
    visualEffectId: string;
}

export interface EnemyDef {
    id: string;
    enemyType: EnemyType;
    name: string;
    speedMultiplier: number;
    hpMultiplier: number;
    color: Color;
    radius: number;
    onUpdate?: (enemy: any, dt: number, allEnemies: any[]) => void;
    drawExtra?: (gfx: any, def: EnemyDef) => void;
}

export interface SpawnEntry {
    time: number;
    type: EnemyType;
    hp: number;
}

export interface WaveConfig {
    entries: SpawnEntry[];
}

// ===== 塔按钮位置（竖屏：底部按钮坞横排，拖动塔的原始位置）=====
export const ATTACK_BUTTON_POS = new Vec3(-200, -405, 0);
export const SLOW_BUTTON_POS = new Vec3(0, -405, 0);
export const POISON_BUTTON_POS = new Vec3(200, -405, 0);

// ===== 波次配置 =====
export const WAVES: WaveConfig[] = [
    // Wave 1：12 只普通兵，HP=40，每隔 1.2s 一只（预计 15s）
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 40 },  { time: 1.2,  type: EnemyType.NORMAL, hp: 40 },
        { time: 2.4,  type: EnemyType.NORMAL, hp: 40 },  { time: 3.6,  type: EnemyType.NORMAL, hp: 40 },
        { time: 4.8,  type: EnemyType.NORMAL, hp: 40 },  { time: 6.0,  type: EnemyType.NORMAL, hp: 40 },
        { time: 7.2,  type: EnemyType.NORMAL, hp: 40 },  { time: 8.4,  type: EnemyType.NORMAL, hp: 40 },
        { time: 9.6,  type: EnemyType.NORMAL, hp: 40 },  { time: 10.8, type: EnemyType.NORMAL, hp: 40 },
        { time: 12.0, type: EnemyType.NORMAL, hp: 40 },  { time: 13.2, type: EnemyType.NORMAL, hp: 40 },
    ]},
    // Wave 2：15 只普通兵，HP=130，每隔 1.0s 一只（预计 18s）
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 130 },  { time: 1.0,  type: EnemyType.NORMAL, hp: 130 },
        { time: 2.0,  type: EnemyType.NORMAL, hp: 130 },  { time: 3.0,  type: EnemyType.NORMAL, hp: 130 },
        { time: 4.0,  type: EnemyType.NORMAL, hp: 130 },  { time: 5.0,  type: EnemyType.NORMAL, hp: 130 },
        { time: 6.0,  type: EnemyType.NORMAL, hp: 130 },  { time: 7.0,  type: EnemyType.NORMAL, hp: 130 },
        { time: 8.0,  type: EnemyType.NORMAL, hp: 130 },  { time: 9.0,  type: EnemyType.NORMAL, hp: 130 },
        { time: 10.0, type: EnemyType.NORMAL, hp: 130 },  { time: 11.0, type: EnemyType.NORMAL, hp: 130 },
        { time: 12.0, type: EnemyType.NORMAL, hp: 130 },  { time: 13.0, type: EnemyType.NORMAL, hp: 130 },
        { time: 14.0, type: EnemyType.NORMAL, hp: 130 },
    ]},
    // Wave 3：18 只，引入 2级(快速脆皮)。7×1级 + 6×2级 + 5×治疗，每 0.9s 一只（预计 17s）
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 160 },  { time: 0.9,  type: EnemyType.FAST,   hp: 160 },
        { time: 1.8,  type: EnemyType.NORMAL, hp: 160 },  { time: 2.7,  type: EnemyType.HEALER, hp: 200 },
        { time: 3.6,  type: EnemyType.FAST,   hp: 160 },  { time: 4.5,  type: EnemyType.NORMAL, hp: 160 },
        { time: 5.4,  type: EnemyType.FAST,   hp: 160 },  { time: 6.3,  type: EnemyType.HEALER, hp: 200 },
        { time: 7.2,  type: EnemyType.NORMAL, hp: 160 },  { time: 8.1,  type: EnemyType.FAST,   hp: 160 },
        { time: 9.0,  type: EnemyType.NORMAL, hp: 160 },  { time: 9.9,  type: EnemyType.HEALER, hp: 200 },
        { time: 10.8, type: EnemyType.FAST,   hp: 160 },  { time: 11.7, type: EnemyType.NORMAL, hp: 160 },
        { time: 12.6, type: EnemyType.FAST,   hp: 160 },  { time: 13.5, type: EnemyType.HEALER, hp: 200 },
        { time: 14.4, type: EnemyType.NORMAL, hp: 160 },  { time: 15.3, type: EnemyType.HEALER, hp: 200 },
    ]},
    // Wave 4：22 只，加入 2级(脆皮)+3级(重甲)+精英。8×1级+5×2级+4×3级+3×治疗+2×精英，每 0.8s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 240 },  { time: 0.8,  type: EnemyType.FAST,   hp: 240 },
        { time: 1.6,  type: EnemyType.NORMAL, hp: 240 },  { time: 2.4,  type: EnemyType.HEALER, hp: 200 },
        { time: 3.2,  type: EnemyType.TANK,   hp: 240 },  { time: 4.0,  type: EnemyType.FAST,   hp: 240 },
        { time: 4.8,  type: EnemyType.NORMAL, hp: 240 },  { time: 5.6,  type: EnemyType.ELITE,  hp: 300 },
        { time: 6.4,  type: EnemyType.FAST,   hp: 240 },  { time: 7.2,  type: EnemyType.NORMAL, hp: 240 },
        { time: 8.0,  type: EnemyType.TANK,   hp: 240 },  { time: 8.8,  type: EnemyType.FAST,   hp: 240 },
        { time: 9.6,  type: EnemyType.HEALER, hp: 200 },  { time: 10.4, type: EnemyType.NORMAL, hp: 240 },
        { time: 11.2, type: EnemyType.TANK,   hp: 240 },  { time: 12.0, type: EnemyType.FAST,   hp: 240 },
        { time: 12.8, type: EnemyType.ELITE,  hp: 300 },  { time: 13.6, type: EnemyType.NORMAL, hp: 240 },
        { time: 14.4, type: EnemyType.TANK,   hp: 240 },  { time: 15.2, type: EnemyType.HEALER, hp: 200 },
        { time: 16.0, type: EnemyType.NORMAL, hp: 240 },  { time: 16.8, type: EnemyType.NORMAL, hp: 240 },
    ]},
    // Wave 5：20 只，三档小兵+治疗。7×1级+6×2级+5×3级+2×治疗，每 0.75s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 280 },  { time: 0.75, type: EnemyType.FAST,   hp: 280 },
        { time: 1.5,  type: EnemyType.TANK,   hp: 280 },  { time: 2.25, type: EnemyType.NORMAL, hp: 280 },
        { time: 3.0,  type: EnemyType.HEALER, hp: 200 },  { time: 3.75, type: EnemyType.FAST,   hp: 280 },
        { time: 4.5,  type: EnemyType.NORMAL, hp: 280 },  { time: 5.25, type: EnemyType.TANK,   hp: 280 },
        { time: 6.0,  type: EnemyType.FAST,   hp: 280 },  { time: 6.75, type: EnemyType.NORMAL, hp: 280 },
        { time: 7.5,  type: EnemyType.HEALER, hp: 200 },  { time: 8.25, type: EnemyType.TANK,   hp: 280 },
        { time: 9.0,  type: EnemyType.FAST,   hp: 280 },  { time: 9.75, type: EnemyType.NORMAL, hp: 280 },
        { time: 10.5, type: EnemyType.TANK,   hp: 280 },  { time: 11.25,type: EnemyType.FAST,   hp: 280 },
        { time: 12.0, type: EnemyType.NORMAL, hp: 280 },  { time: 12.75,type: EnemyType.TANK,   hp: 280 },
        { time: 13.5, type: EnemyType.FAST,   hp: 280 },  { time: 14.25,type: EnemyType.NORMAL, hp: 280 },
    ]},
    // Wave 6：22 只，三档小兵+治疗+精英。7×1级+6×2级+4×3级+3×治疗+2×精英，每 0.7s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 360 },  { time: 0.7,  type: EnemyType.FAST,   hp: 360 },
        { time: 1.4,  type: EnemyType.TANK,   hp: 360 },  { time: 2.1,  type: EnemyType.HEALER, hp: 200 },
        { time: 2.8,  type: EnemyType.NORMAL, hp: 360 },  { time: 3.5,  type: EnemyType.FAST,   hp: 360 },
        { time: 4.2,  type: EnemyType.ELITE,  hp: 500 },  { time: 4.9,  type: EnemyType.TANK,   hp: 360 },
        { time: 5.6,  type: EnemyType.FAST,   hp: 360 },  { time: 6.3,  type: EnemyType.NORMAL, hp: 360 },
        { time: 7.0,  type: EnemyType.HEALER, hp: 200 },  { time: 7.7,  type: EnemyType.FAST,   hp: 360 },
        { time: 8.4,  type: EnemyType.TANK,   hp: 360 },  { time: 9.1,  type: EnemyType.NORMAL, hp: 360 },
        { time: 9.8,  type: EnemyType.ELITE,  hp: 500 },  { time: 10.5, type: EnemyType.FAST,   hp: 360 },
        { time: 11.2, type: EnemyType.TANK,   hp: 360 },  { time: 11.9, type: EnemyType.HEALER, hp: 200 },
        { time: 12.6, type: EnemyType.NORMAL, hp: 360 },  { time: 13.3, type: EnemyType.FAST,   hp: 360 },
        { time: 14.0, type: EnemyType.NORMAL, hp: 360 },  { time: 14.7, type: EnemyType.NORMAL, hp: 360 },
    ]},
    // Wave 7（最终波）：23 只，三档小兵+治疗+精英+BOSS。7×1级+6×2级+5×3级+2×治疗+2×精英+1×BOSS，每 0.7s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 430 },  { time: 0.7,  type: EnemyType.FAST,   hp: 430 },
        { time: 1.4,  type: EnemyType.NORMAL, hp: 430 },  { time: 2.1,  type: EnemyType.HEALER, hp: 200 },
        { time: 2.8,  type: EnemyType.TANK,   hp: 430 },  { time: 3.5,  type: EnemyType.FAST,   hp: 430 },
        { time: 4.2,  type: EnemyType.ELITE,  hp: 430 },  { time: 4.9,  type: EnemyType.NORMAL, hp: 430 },
        { time: 5.6,  type: EnemyType.FAST,   hp: 430 },  { time: 6.3,  type: EnemyType.TANK,   hp: 430 },
        { time: 7.0,  type: EnemyType.NORMAL, hp: 430 },  { time: 7.7,  type: EnemyType.HEALER, hp: 200 },
        { time: 8.4,  type: EnemyType.BOSS,   hp: 800 },  { time: 9.1,  type: EnemyType.FAST,   hp: 430 },
        { time: 9.8,  type: EnemyType.TANK,   hp: 430 },  { time: 10.5, type: EnemyType.ELITE,  hp: 430 },
        { time: 11.2, type: EnemyType.NORMAL, hp: 430 },  { time: 11.9, type: EnemyType.FAST,   hp: 430 },
        { time: 12.6, type: EnemyType.TANK,   hp: 430 },  { time: 13.3, type: EnemyType.NORMAL, hp: 430 },
        { time: 14.0, type: EnemyType.FAST,   hp: 430 },  { time: 14.7, type: EnemyType.TANK,   hp: 430 },
        { time: 15.4, type: EnemyType.NORMAL, hp: 430 },
    ]},
];
