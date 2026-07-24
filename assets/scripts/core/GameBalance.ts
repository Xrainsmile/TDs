import { _decorator, Vec3, Color } from 'cc';

/**
 * GameBalance.ts — 塔防游戏所有静态数值配置
 *
 * 从 SceneInitializer.ts 抽出，方便独立调参与 AI 辅助开发时定位。
 * SceneInitializer 通过 import 引用这些常量和注册表。
 */

// ===== 地图设计尺寸（竖屏：宽 520 × 高 720，与横屏 720×520 同尺寸旋转）=====
export const MAP_DESIGN_WIDTH = 520;
export const MAP_DESIGN_HEIGHT = 720;

// ===== 路径：竖屏蛇形（10个waypoint，入口顶部中央→基地底部中央）=====
// 中央走廊 x∈[-120,120]，转角在 x=±120；塔位布置在走廊两侧与转角内外侧，互不重叠
export const PATH_WAYPOINTS: Vec3[] = [
    new Vec3(0, 330, 0),     // 入口（顶部中央）
    new Vec3(120, 330, 0),
    new Vec3(120, 150, 0),
    new Vec3(-120, 150, 0),
    new Vec3(-120, -30, 0),
    new Vec3(120, -30, 0),
    new Vec3(120, -210, 0),
    new Vec3(-120, -210, 0),
    new Vec3(-120, -330, 0),
    new Vec3(0, -330, 0),    // 基地（底部中央）
];

// ===== 基础数值 =====
export const ENEMY_SPEED = 80;
export const BULLET_SPEED = 500;

// ===== 金币 =====
export const INITIAL_GOLD = 260;
export const KILL_REWARD = 15;
export const WAVE_BONUSES = [50, 60, 70, 80];

// ===== 自爆 =====
export const EXPLOSION_RADIUS = 60;
export const EXPLOSION_DAMAGE = 80;

// ===== 关卡倒计时 =====
export const LEVEL_START_COUNTDOWN = 5;

// ===== 建造点：20个地基（竖屏：两侧各一列 + 道路转角内外侧）=====
// 两侧塔位各保留一列（x=±225，6 行）；其余放在道路转角的内/外侧（x=±60 内侧 / x=±185 外侧，4 个转角 y 层级）
// 全部位于 MapRoot 局部坐标，整体等比缩放；与路径走廊留有清晰间距，且距屏幕边缘 ≥16px
export const SLOT_POSITIONS: Vec3[] = [
    // 左侧列（x=-225）
    new Vec3(-225, 290, 0),
    new Vec3(-225, 175, 0),
    new Vec3(-225, -10, 0),
    new Vec3(-225, -80, 0),
    new Vec3(-225, -190, 0),
    new Vec3(-225, -310, 0),

    // 右侧列（x=225）
    new Vec3(225, 290, 0),
    new Vec3(225, 175, 0),
    new Vec3(225, -10, 0),
    new Vec3(225, -80, 0),
    new Vec3(225, -190, 0),
    new Vec3(225, -310, 0),

    // 转角内侧（x=±60）
    new Vec3(60, 240, 0),
    new Vec3(60, -120, 0),
    new Vec3(-60, 60, 0),
    new Vec3(-60, -270, 0),

    // 转角外侧（x=±185）
    new Vec3(185, 60, 0),
    new Vec3(185, -270, 0),
    new Vec3(-185, 240, 0),
    new Vec3(-185, -120, 0),
];

// ===== 治疗兵参数 =====
export const HEAL_RADIUS = 120;
export const HEAL_INTERVAL = 3.0;
export const HEAL_AMOUNT = 5;

// ===== 类型定义 =====
export type TowerAttackKind = 'bullet' | 'instant';

export interface TowerDef {
    id: string;
    name: string;
    cost: number;
    range: number;
    interval: number;
    damage: number;
    attackKind: TowerAttackKind;
    color: Color;
    rangeColor: Color;
    buttonPos: Vec3;
    applyInstant?: (enemy: any) => void;
    onBulletHit?: (enemy: any) => void;
}

export interface EnemyDef {
    id: string;
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
    type: string;
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
    // Wave 1：12 只普通兵，HP=45，每隔 1.2s 一只（预计 15s）
    { entries: [
        { time: 0.0,  type: 'normal', hp: 45 },  { time: 1.2,  type: 'normal', hp: 45 },
        { time: 2.4,  type: 'normal', hp: 45 },  { time: 3.6,  type: 'normal', hp: 45 },
        { time: 4.8,  type: 'normal', hp: 45 },  { time: 6.0,  type: 'normal', hp: 45 },
        { time: 7.2,  type: 'normal', hp: 45 },  { time: 8.4,  type: 'normal', hp: 45 },
        { time: 9.6,  type: 'normal', hp: 45 },  { time: 10.8, type: 'normal', hp: 45 },
        { time: 12.0, type: 'normal', hp: 45 },  { time: 13.2, type: 'normal', hp: 45 },
    ]},
    // Wave 2：15 只普通兵，HP=130，每隔 1.0s 一只（预计 18s）
    { entries: [
        { time: 0.0,  type: 'normal', hp: 130 },  { time: 1.0,  type: 'normal', hp: 130 },
        { time: 2.0,  type: 'normal', hp: 130 },  { time: 3.0,  type: 'normal', hp: 130 },
        { time: 4.0,  type: 'normal', hp: 130 },  { time: 5.0,  type: 'normal', hp: 130 },
        { time: 6.0,  type: 'normal', hp: 130 },  { time: 7.0,  type: 'normal', hp: 130 },
        { time: 8.0,  type: 'normal', hp: 130 },  { time: 9.0,  type: 'normal', hp: 130 },
        { time: 10.0, type: 'normal', hp: 130 },  { time: 11.0, type: 'normal', hp: 130 },
        { time: 12.0, type: 'normal', hp: 130 },  { time: 13.0, type: 'normal', hp: 130 },
        { time: 14.0, type: 'normal', hp: 130 },
    ]},
    // Wave 3：18 只，3 普通 + 1 治疗循环穿插（13 普通 HP=160 + 5 治疗 HP=200），每隔 0.9s 一只（预计 20s）
    { entries: [
        { time: 0.0,  type: 'normal', hp: 160 },  { time: 0.9,  type: 'normal', hp: 160 },
        { time: 1.8,  type: 'normal', hp: 160 },  { time: 2.7,  type: 'healer', hp: 200 },
        { time: 3.6,  type: 'normal', hp: 160 },  { time: 4.5,  type: 'normal', hp: 160 },
        { time: 5.4,  type: 'normal', hp: 160 },  { time: 6.3,  type: 'healer', hp: 200 },
        { time: 7.2,  type: 'normal', hp: 160 },  { time: 8.1,  type: 'normal', hp: 160 },
        { time: 9.0,  type: 'normal', hp: 160 },  { time: 9.9,  type: 'healer', hp: 200 },
        { time: 10.8, type: 'normal', hp: 160 },  { time: 11.7, type: 'normal', hp: 160 },
        { time: 12.6, type: 'normal', hp: 160 },  { time: 13.5, type: 'healer', hp: 200 },
        { time: 14.4, type: 'normal', hp: 160 },  { time: 15.3, type: 'normal', hp: 160 },
    ]},
    // Wave 4：20 只普通兵，HP=240，每隔 0.8s 一只（预计 22s）
    { entries: [
        { time: 0.0,  type: 'normal', hp: 240 },  { time: 0.8,  type: 'normal', hp: 240 },
        { time: 1.6,  type: 'normal', hp: 240 },  { time: 2.4,  type: 'normal', hp: 240 },
        { time: 3.2,  type: 'normal', hp: 240 },  { time: 4.0,  type: 'normal', hp: 240 },
        { time: 4.8,  type: 'normal', hp: 240 },  { time: 5.6,  type: 'normal', hp: 240 },
        { time: 6.4,  type: 'normal', hp: 240 },  { time: 7.2,  type: 'normal', hp: 240 },
        { time: 8.0,  type: 'normal', hp: 240 },  { time: 8.8,  type: 'normal', hp: 240 },
        { time: 9.6,  type: 'normal', hp: 240 },  { time: 10.4, type: 'normal', hp: 240 },
        { time: 11.2, type: 'normal', hp: 240 },  { time: 12.0, type: 'normal', hp: 240 },
        { time: 12.8, type: 'normal', hp: 240 },  { time: 13.6, type: 'normal', hp: 240 },
        { time: 14.4, type: 'normal', hp: 240 },  { time: 15.2, type: 'normal', hp: 240 },
    ]},
];
