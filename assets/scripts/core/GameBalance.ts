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
export const INITIAL_GOLD = 30;
export const KILL_REWARD = 0;
export const WAVE_BONUSES = [30, 30, 30, 30, 30, 30, 30];

// ===== 倒计时 =====
// 关卡开头倒计时（秒）：给玩家时间建塔布防
export const LEVEL_START_COUNTDOWN = 5;

// ===== 治疗兵参数 =====
export const HEAL_RADIUS = 120;
export const HEAL_INTERVAL = 3.0;
export const HEAL_AMOUNT = 5;

// ===== BOSS 参数 =====
export const BOSS_SKILL_INTERVAL = 5.0;   // 每 5 秒尝试释放一次技能
export const BOSS_SKILL_CHANCE = 0.1;     // 技能有 10% 概率摧毁一座防御塔

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
    // Wave 1：12 只普通兵，HP=45，每隔 1.2s 一只（预计 15s）
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 45 },  { time: 1.2,  type: EnemyType.NORMAL, hp: 45 },
        { time: 2.4,  type: EnemyType.NORMAL, hp: 45 },  { time: 3.6,  type: EnemyType.NORMAL, hp: 45 },
        { time: 4.8,  type: EnemyType.NORMAL, hp: 45 },  { time: 6.0,  type: EnemyType.NORMAL, hp: 45 },
        { time: 7.2,  type: EnemyType.NORMAL, hp: 45 },  { time: 8.4,  type: EnemyType.NORMAL, hp: 45 },
        { time: 9.6,  type: EnemyType.NORMAL, hp: 45 },  { time: 10.8, type: EnemyType.NORMAL, hp: 45 },
        { time: 12.0, type: EnemyType.NORMAL, hp: 45 },  { time: 13.2, type: EnemyType.NORMAL, hp: 45 },
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
    // Wave 3：18 只，3 普通 + 1 治疗循环穿插（13 普通 HP=160 + 5 治疗 HP=200），每隔 0.9s 一只（预计 20s）
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 160 },  { time: 0.9,  type: EnemyType.NORMAL, hp: 160 },
        { time: 1.8,  type: EnemyType.NORMAL, hp: 160 },  { time: 2.7,  type: EnemyType.HEALER, hp: 200 },
        { time: 3.6,  type: EnemyType.NORMAL, hp: 160 },  { time: 4.5,  type: EnemyType.NORMAL, hp: 160 },
        { time: 5.4,  type: EnemyType.NORMAL, hp: 160 },  { time: 6.3,  type: EnemyType.HEALER, hp: 200 },
        { time: 7.2,  type: EnemyType.NORMAL, hp: 160 },  { time: 8.1,  type: EnemyType.NORMAL, hp: 160 },
        { time: 9.0,  type: EnemyType.NORMAL, hp: 160 },  { time: 9.9,  type: EnemyType.HEALER, hp: 200 },
        { time: 10.8, type: EnemyType.NORMAL, hp: 160 },  { time: 11.7, type: EnemyType.NORMAL, hp: 160 },
        { time: 12.6, type: EnemyType.NORMAL, hp: 160 },  { time: 13.5, type: EnemyType.HEALER, hp: 200 },
        { time: 14.4, type: EnemyType.NORMAL, hp: 160 },  { time: 15.3, type: EnemyType.NORMAL, hp: 160 },
    ]},
    // Wave 4（最终波）：16 普通(HP=240) + 3 治疗(HP=200) + 2 精英(HP=350) 穿插，每 0.8s 一只（约 25s）
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 240 },  { time: 0.8,  type: EnemyType.NORMAL, hp: 240 },
        { time: 1.6,  type: EnemyType.NORMAL, hp: 240 },  { time: 2.4,  type: EnemyType.HEALER, hp: 200 },
        { time: 3.2,  type: EnemyType.NORMAL, hp: 240 },  { time: 4.0,  type: EnemyType.NORMAL, hp: 240 },
        { time: 4.8,  type: EnemyType.NORMAL, hp: 240 },  { time: 5.6,  type: EnemyType.NORMAL, hp: 240 },
        { time: 6.4,  type: EnemyType.NORMAL, hp: 240 },  { time: 7.2,  type: EnemyType.HEALER, hp: 200 },
        { time: 8.0,  type: EnemyType.NORMAL, hp: 240 },  { time: 8.8,  type: EnemyType.NORMAL, hp: 240 },
        { time: 9.6,  type: EnemyType.NORMAL, hp: 240 },  { time: 10.4, type: EnemyType.NORMAL, hp: 240 },
        { time: 11.2, type: EnemyType.NORMAL, hp: 240 },  { time: 12.0, type: EnemyType.HEALER, hp: 200 },
        { time: 12.8, type: EnemyType.NORMAL, hp: 240 },  { time: 13.6, type: EnemyType.NORMAL, hp: 240 },
        { time: 14.4, type: EnemyType.ELITE,  hp: 300 },  { time: 15.2, type: EnemyType.NORMAL, hp: 240 },
        { time: 16.0, type: EnemyType.NORMAL, hp: 240 },  { time: 16.8, type: EnemyType.ELITE,  hp: 300 },
    ]},
    // Wave 5：18 只，普通 HP=340 + 2 治疗(HP=200) 穿插，每 0.75s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 340 },  { time: 0.75, type: EnemyType.NORMAL, hp: 340 },
        { time: 1.5,  type: EnemyType.NORMAL, hp: 340 },  { time: 2.25, type: EnemyType.NORMAL, hp: 340 },
        { time: 3.0,  type: EnemyType.HEALER, hp: 200 },  { time: 3.75, type: EnemyType.NORMAL, hp: 340 },
        { time: 4.5,  type: EnemyType.NORMAL, hp: 340 },  { time: 5.25, type: EnemyType.NORMAL, hp: 340 },
        { time: 6.0,  type: EnemyType.NORMAL, hp: 340 },  { time: 6.75, type: EnemyType.NORMAL, hp: 340 },
        { time: 7.5,  type: EnemyType.HEALER, hp: 200 },  { time: 8.25, type: EnemyType.NORMAL, hp: 340 },
        { time: 9.0,  type: EnemyType.NORMAL, hp: 340 },  { time: 9.75, type: EnemyType.NORMAL, hp: 340 },
        { time: 10.5, type: EnemyType.NORMAL, hp: 340 },  { time: 11.25,type: EnemyType.NORMAL, hp: 340 },
        { time: 12.0, type: EnemyType.NORMAL, hp: 340 },  { time: 12.75,type: EnemyType.NORMAL, hp: 340 },
        { time: 13.5, type: EnemyType.NORMAL, hp: 340 },  { time: 14.25,type: EnemyType.NORMAL, hp: 340 },
    ]},
    // Wave 6：20 只，普通 HP=460 + 3 治疗(HP=200) + 2 精英(HP=500)，每 0.7s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 460 },  { time: 0.7,  type: EnemyType.NORMAL, hp: 460 },
        { time: 1.4,  type: EnemyType.NORMAL, hp: 460 },  { time: 2.1,  type: EnemyType.HEALER, hp: 200 },
        { time: 2.8,  type: EnemyType.NORMAL, hp: 460 },  { time: 3.5,  type: EnemyType.NORMAL, hp: 460 },
        { time: 4.2,  type: EnemyType.NORMAL, hp: 460 },  { time: 4.9,  type: EnemyType.ELITE,  hp: 500 },
        { time: 5.6,  type: EnemyType.NORMAL, hp: 460 },  { time: 6.3,  type: EnemyType.NORMAL, hp: 460 },
        { time: 7.0,  type: EnemyType.HEALER, hp: 200 },  { time: 7.7,  type: EnemyType.NORMAL, hp: 460 },
        { time: 8.4,  type: EnemyType.NORMAL, hp: 460 },  { time: 9.1,  type: EnemyType.NORMAL, hp: 460 },
        { time: 9.8,  type: EnemyType.ELITE,  hp: 500 },  { time: 10.5, type: EnemyType.NORMAL, hp: 460 },
        { time: 11.2, type: EnemyType.NORMAL, hp: 460 },  { time: 11.9, type: EnemyType.HEALER, hp: 200 },
        { time: 12.6, type: EnemyType.NORMAL, hp: 460 },  { time: 13.3, type: EnemyType.NORMAL, hp: 460 },
        { time: 14.0, type: EnemyType.NORMAL, hp: 460 },  { time: 14.7, type: EnemyType.NORMAL, hp: 460 },
    ]},
    // Wave 7（最终波）：普通 HP=600 + 2 治疗 + 2 精英(HP=400) + 1 BOSS(HP=600，×10=6000)，每 0.7s 一只
    { entries: [
        { time: 0.0,  type: EnemyType.NORMAL, hp: 600 },  { time: 0.7,  type: EnemyType.NORMAL, hp: 600 },
        { time: 1.4,  type: EnemyType.NORMAL, hp: 600 },  { time: 2.1,  type: EnemyType.HEALER, hp: 200 },
        { time: 2.8,  type: EnemyType.NORMAL, hp: 600 },  { time: 3.5,  type: EnemyType.NORMAL, hp: 600 },
        { time: 4.2,  type: EnemyType.ELITE,  hp: 400 },  { time: 4.9,  type: EnemyType.NORMAL, hp: 600 },
        { time: 5.6,  type: EnemyType.NORMAL, hp: 600 },  { time: 6.3,  type: EnemyType.NORMAL, hp: 600 },
        { time: 7.0,  type: EnemyType.NORMAL, hp: 600 },  { time: 7.7,  type: EnemyType.HEALER, hp: 200 },
        { time: 8.4,  type: EnemyType.BOSS,   hp: 600 },  { time: 9.1,  type: EnemyType.NORMAL, hp: 600 },
        { time: 9.8,  type: EnemyType.NORMAL, hp: 600 },  { time: 10.5, type: EnemyType.ELITE,  hp: 400 },
        { time: 11.2, type: EnemyType.NORMAL, hp: 600 },  { time: 11.9, type: EnemyType.NORMAL, hp: 600 },
        { time: 12.6, type: EnemyType.NORMAL, hp: 600 },  { time: 13.3, type: EnemyType.NORMAL, hp: 600 },
        { time: 14.0, type: EnemyType.NORMAL, hp: 600 },  { time: 14.7, type: EnemyType.NORMAL, hp: 600 },
        { time: 15.4, type: EnemyType.NORMAL, hp: 600 },
    ]},
];
