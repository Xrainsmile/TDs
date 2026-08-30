import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3, UIOpacity } from 'cc';
import { HUD } from '../ui/HUD';
import { EffectManager } from './EffectManager';
import { EnemyType } from './Constants';
import { TowerStats, BuildPath } from './RoguelikeCards';
// 新卡牌/强化统一数据层（assets/scripts/core/cards/）
import { WAVE_BUFFS } from './cards/BuffRegistry';
import { DRAW_CARDS } from './cards/CardRegistry';
import { meetsUnlock, triggersExclude } from './cards/ConditionEvaluator';
import { computeWeight } from './cards/WeightCalculator';
import { executeEffects } from './cards/EffectExecutor';
import { RunBuildState } from './cards/RunBuildState';
import { TOWER_MODIFIERS } from './cards/TowerModifierRegistry';
import { WaveBuffDefinition, GameSnapshot, EffectDefinition, DrawCardDefinition } from './cards/types';
import { TowerParamResolver } from './systems/TowerParamResolver';
import { ThrustSystem, ThrustSystemContext } from './systems/ThrustSystem';
import { PlaytestMetadata, PlaytestRecorder, PlaytestSnapshot } from './playtest/PlaytestRecorder';
import {
    ENEMY_SPEED, BULLET_SPEED,
    INITIAL_GOLD, KILL_REWARD, WAVE_BONUSES,
    LEVEL_START_COUNTDOWN,
    HEAL_RADIUS, HEAL_INTERVAL, HEAL_AMOUNT, HEAL_SILENCE,
    BOSS_SKILL_INTERVAL, BOSS_LOCK_DURATION, BOSS_CEASEFIRE,
    ATTACK_BUTTON_POS, SLOW_BUTTON_POS, POISON_BUTTON_POS,
    WAVES,
    type TowerDef, type EnemyDef, type SpawnEntry, type WaveConfig, type TowerAttackKind,
} from './GameBalance';
import {
    MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT, PATH_WAYPOINTS,
    PATH_BRANCHES, PATH_BRANCH_WAYPOINTS, BRANCH_COUNT,
    BUILD_CELLS, LOCKED_BUILD_CELL_KEYS,
    gridToLocal, CELL_SIZE, ROAD_WIDTH_RATIO, SLOT_SIZE_RATIO, GRID_COLS, GRID_ROWS,
} from './MapConfig';
import { buildMapArt, drawSlotMat, drawTowerBase } from './visuals/MapArt';
import * as VisualFactory from './visuals/VisualFactory';   // 表现层：按 visualEffectId 构建攻击视觉
import type { AffixId, DamageAttribution, EnemyRuntime, PierceShot, TowerParams, TowerRuntime } from './RuntimeTypes';

/** 手牌卡定义 */
interface CardDef {
    sourceId: string;       // 对应 DrawCardDefinition.id
    kind: 'tower' | 'hammer' | 'modifier' | 'tactic';
    towerId?: string;       // kind==='tower' 时的塔 id
    name: string;
    desc: string;
    color: Color;
}

interface SkewerChainRuntime {
    id: number;
    enemies: EnemyRuntime[];
    timer: number;
    duration: number;
    damage: number;
    sourceTowerId: string;
    sourceTowerName: string;
    lineNode: Node;
    lineGfx: Graphics;
}

const { ccclass } = _decorator;

// 开发模式开关：开启后运行地图校验（仅输出错误，不移动节点）
const DEBUG = true;
// 6×8 调试网格开关
const SHOW_GRID = false;

const THRUST_REST_SCALE = 0.16;  // 收回时吸管横向缩放（视觉上几乎贴回塔身）

// ============================================================
//  系统扩展约定：塔/敌人配置表
//  新增一种塔 → 在 TOWER_REGISTRY 注册一个 TowerDef
//  新增一种敌人 → 在 ENEMY_REGISTRY 注册一个 EnemyDef
//  注册后自动接入：按钮/外观/属性/攻击逻辑/移动逻辑/光环逻辑
//  详见 doc/extension-guide.md
// ============================================================


                               




/** 每种塔的 3 个专属正向词缀（合并升二星时随机获得其一） */
const TOWER_AFFIXES: Record<string, { id: AffixId; name: string; desc: string }[]> = {
    slow: [
        { id: 'deepfreeze', name: '深寒', desc: '减速更强' },
        { id: 'linger', name: '延滞', desc: '减速持续更久' },
        { id: 'vulnerable', name: '易伤', desc: '目标承受伤害+20%' },
    ],
    poison: [
        { id: 'virulent', name: '剧毒', desc: '毒伤+25%' },
        { id: 'persistent', name: '持久', desc: '中毒时间+50%' },
        { id: 'contagious', name: '传染', desc: '中毒敌人死亡概率传染邻敌' },
    ],
};




/**
 * 极简版 SceneInitializer
 *
 * 核心闭环：
 * 1. 波次系统：按配置生成多只敌人（数量+血量可配）
 * 2. 从左侧拖拽塔 → 松手时如果在建造点附近则放置，否则取消
 * 3. 能放置时蓝球外层显示光环
 * 4. 塔自动攻击范围内敌人 → 发射子弹 → 命中扣 HP → 死亡
 * 5. 放塔扣钱，击杀加钱
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {

    // 路径（直接从 GameBalance 引用，固定逻辑坐标）
    private get PATH_START() { return PATH_WAYPOINTS[0]; }
    private get PATH_END() { return PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1]; }

    /** 取敌人在其所属分支上的 waypoints 数组（双路分叉） */
    private waypointsOf(e: EnemyRuntime): Vec3[] {
        return PATH_BRANCH_WAYPOINTS[e.branch] ?? PATH_WAYPOINTS;
    }

    // 基础数值（从 GameBalance 引用）
    private get ENEMY_SPEED() { return ENEMY_SPEED; }
    private get BULLET_SPEED() { return BULLET_SPEED; }
    private get INITIAL_GOLD() { return INITIAL_GOLD; }
    private get KILL_REWARD() { return KILL_REWARD; }
    private get WAVE_BONUSES() { return WAVE_BONUSES; }
    private get LEVEL_START_COUNTDOWN() { return LEVEL_START_COUNTDOWN; }

    private get HEAL_RADIUS() { return HEAL_RADIUS; }
    private get HEAL_INTERVAL() { return HEAL_INTERVAL; }
    private get HEAL_AMOUNT() { return HEAL_AMOUNT; }
    private get HEAL_SILENCE() { return HEAL_SILENCE; }
    private get BOSS_SKILL_INTERVAL() { return BOSS_SKILL_INTERVAL; }
    private get BOSS_LOCK_DURATION() { return BOSS_LOCK_DURATION; }
    private get BOSS_CEASEFIRE() { return BOSS_CEASEFIRE; }

    // ===== 分裂弹道（改造卡 'split'）数值 =====
    private static readonly SPLIT_COUNT = 2;      // 终结命中时分裂的子弹数
    private static readonly SPLIT_DMG_MUL = 0.5;  // 分裂子弹伤害倍率
    private static readonly SPLIT_RADIUS = 150;   // 分裂索敌半径（命中点附近）

    // ===== 塔注册表（含闭包引用 this.towerStats，保留在 SceneInitializer）=====
    private readonly TOWER_REGISTRY: TowerDef[] = ([

        {
            id: 'slow',
            name: '减速塔',
            cost: 120,
            color: new Color(180, 80, 220, 255),
            rangeColor: new Color(180, 80, 220, 60),
            buttonPos: SLOW_BUTTON_POS,
            attack: {
                attackType: 'spray',   // 过渡占位：当前用 instant 分支施加减速，下一阶段改读 statusEffects
                rangeBand: 'medium',
                range: 200,
                damage: 0,
                attackInterval: 0.84,
                maxHitsPerTarget: 1,
                aimMode: 'unaffected',   // 优先未减速的敌人（软偏好，池内按 first）
                statusEffects: [
                    { type: 'SLOW', duration: 1.0, magnitude: 0.7 },
                    { type: 'MARK', duration: 1.0, magnitude: 1.2 },
                ],
                visualEffectId: 'slow_spray',
            },
        },
        {
            id: 'poison',
            name: '杀虫喷雾',
            cost: 140,
            color: new Color(100, 200, 50, 255),
            rangeColor: new Color(100, 200, 50, 60),
            buttonPos: POISON_BUTTON_POS,
            attack: {
                attackType: 'projectile',
                rangeBand: 'short',
                range: 144,
                damage: 10,
                attackInterval: 0.8,
                maxHitsPerTarget: 1,
                aimMode: 'unaffected',   // 优先未中毒的敌人，池内按 first
                statusEffects: [
                    { type: 'POISON', duration: 6.0, magnitude: 8, tickInterval: 1, stacks: 1 },
                ],
                visualEffectId: 'poison_shot',
            },
        },

        // ===== 家庭小物件 Demo 塔 =====
        {
            id: 'toothbrush',
            name: '牙刷',
            cost: 110,
            color: new Color(120, 220, 230, 255),
            rangeColor: new Color(120, 220, 230, 60),
            buttonPos: ATTACK_BUTTON_POS,   // 仅占位（本分支无拖拽塔坞，靠抽卡卡牌放置）
            attack: {
                attackType: 'sweep',
                rangeBand: 'short',
                range: 100,
                angle: 90,
                radius: 100,
                damage: 12,
                attackInterval: 0.7,
                maxHitsPerTarget: 1,
                aimMode: 'first',
                visualEffectId: 'sweep_brush',
            },
        },
        {
            id: 'powerbank',
            name: '充电宝',
            cost: 90,
            color: new Color(255, 180, 60, 255),
            rangeColor: new Color(255, 180, 60, 60),
            buttonPos: ATTACK_BUTTON_POS,
            support: true,          // 辅助塔：不攻击，提供攻速光环
            auraSpeedBonus: 0.25,   // 范围内其他塔 +25% 攻速
            attack: {
                attackType: 'thrust',  // 占位：辅助塔不攻击，attack 仅保留光环半径(range)供 updateAuras 读取
                rangeBand: 'short',
                range: 140,            // 光环半径
                damage: 0,
                attackInterval: 1,
                maxHitsPerTarget: 1,
                aimMode: 'fixedDirection',
                visualEffectId: 'none',
            },
        },
        {
            id: 'rubberband',
            name: '橡皮筋',
            cost: 100,
            color: new Color(255, 130, 170, 255),
            rangeColor: new Color(255, 130, 170, 60),
            buttonPos: ATTACK_BUTTON_POS,
            attack: {
                attackType: 'chain',
                rangeBand: 'short',
                range: 130,
                damage: 15,
                attackInterval: 0.6,
                maxTargets: 2,
                maxHitsPerTarget: 1,
                aimMode: 'first',
                visualEffectId: 'rubber_shot',
            },
        },
        {
            id: 'bubble_tea_straw',
            name: '奶茶吸管',
            cost: 100,
            color: new Color(235, 205, 160, 255),
            rangeColor: new Color(235, 205, 160, 60),
            buttonPos: ATTACK_BUTTON_POS,
            attack: {
                attackType: 'thrust',
                rangeBand: 'contact',
                range: 90,               // 贴身射程。必须 > 60（一格），否则够不到路径（原 55 永远无法攻击）
                width: 14,
                damage: 18,
                attackInterval: 0.54,
                attackDuration: 0.22,
                maxTargets: 1,
                maxHitsPerTarget: 1,
                aimMode: 'first',
                visualEffectId: 'bubble_tea_straw_thrust',
            },
        },
        {
            id: 'whisk',
            name: '打蛋器',
            cost: 120,
            color: new Color(150, 200, 255, 255),
            rangeColor: new Color(150, 200, 255, 60),
            buttonPos: ATTACK_BUTTON_POS,
            attack: {
                attackType: 'spin',
                rangeBand: 'short',
                range: 90,
                radius: 90,
                damage: 8,
                attackInterval: 1.2,
                attackDuration: 1.0,
                damageTick: 0.25,
                maxTargets: 99,
                maxHitsPerTarget: 99,
                aimMode: 'mostEnemies',
                visualEffectId: 'whisk_spin',
            },
        },
        {
            id: 'spatula',
            name: '锅铲',
            cost: 140,
            color: new Color(200, 140, 90, 255),
            rangeColor: new Color(200, 140, 90, 60),
            buttonPos: ATTACK_BUTTON_POS,
            attack: {
                attackType: 'smash',
                rangeBand: 'medium',
                range: 150,
                radius: 60,
                damage: 30,
                attackInterval: 1.5,
                maxTargets: 99,
                maxHitsPerTarget: 1,
                aimMode: 'mostEnemies',
                visualEffectId: 'spatula_smash',
            },
        },
        {
            id: 'chopsticks',
            name: '筷子',
            cost: 130,
            color: new Color(216, 176, 116, 255),
            rangeColor: new Color(206, 168, 110, 60),
            buttonPos: ATTACK_BUTTON_POS,
            attack: {
                attackType: 'pierce',
                rangeBand: 'medium',
                range: 180,
                width: 10,
                damage: 14,
                attackInterval: 0.9,
                maxTargets: 4,
                canPierce: true,
                maxHitsPerTarget: 1,
                aimMode: 'first',
                visualEffectId: 'chopsticks_pierce',
            },
        },
        {
            id: 'scissors',
            name: '剪刀',
            cost: 120,
            color: new Color(190, 210, 230, 255),
            rangeColor: new Color(190, 210, 230, 60),
            buttonPos: ATTACK_BUTTON_POS,
            attack: {
                attackType: 'sweep',
                rangeBand: 'contact',
                range: 105,
                angle: 80,
                radius: 105,
                damage: 11,
                attackInterval: 0.9,
                maxHitsPerTarget: 1,
                aimMode: 'first',
                visualEffectId: 'scissors_sweep',
            },
        },
    ] as TowerDef[]).map(SceneInitializer.normalizeTowerDef);

    // ===== 敌人注册表（含闭包引用 this.towerStats/HEAL_*，保留在 SceneInitializer）=====
    private readonly ENEMY_REGISTRY: EnemyDef[] = [
        {
            id: 'normal',
            enemyType: EnemyType.NORMAL,
            name: '1级小兵',
            speedMultiplier: 1,
            hpMultiplier: 1,
            color: new Color(80, 200, 80, 255),
            radius: 14,
        },
        {
            id: 'fast',
            enemyType: EnemyType.FAST,
            name: '2级小兵',          // 快速脆皮群：低血高速、成群冲锋 → 克：链击/横扫（橡皮筋/牙刷）
            speedMultiplier: 1.5,
            hpMultiplier: 0.6,
            color: new Color(255, 215, 90, 255),
            radius: 12,
        },
        {
            id: 'tank',
            enemyType: EnemyType.TANK,
            name: '3级小兵',          // 慢速重甲：高血低速、稳步推进 → 克：单体高伤/戳击（奶茶吸管）
            speedMultiplier: 0.55,
            hpMultiplier: 2.0,
            color: new Color(130, 140, 110, 255),
            radius: 18,
        },
        {
            id: 'healer',
            enemyType: EnemyType.HEALER,
            name: '治疗兵',
            speedMultiplier: 0.9,
            hpMultiplier: 1.0,
            color: new Color(255, 150, 200, 255),
            radius: 14,
            onUpdate: (enemy, dt, allEnemies) => {
                // 治疗沉默：受击后 HEAL_SILENCE 秒内无法治疗（由治疗抑制卡触发）
                if (enemy.healCd > 0) {
                    enemy.healCd = Math.max(0, enemy.healCd - dt);
                    return;
                }
                enemy.healTimer += dt;
                if (enemy.healTimer >= this.HEAL_INTERVAL) {
                    enemy.healTimer = 0;
                    // 治疗量受 roguelike 治疗抑制影响
                    const healAmount = this.HEAL_AMOUNT * this.towerStats.healMultiplier;
                    for (const target of allEnemies) {
                        if (target === enemy) continue;
                        const dist = Vec3.distance(enemy.node.position, target.node.position);
                        if (dist <= this.HEAL_RADIUS && target.hp < target.maxHp) {
                            target.hp = Math.min(target.maxHp, target.hp + healAmount);
                            EffectManager.instance?.playHeal(target.node.position, healAmount);
                        }
                    }
                }
            },
            drawExtra: (gfx) => {
                // 治疗光环范围
                gfx.strokeColor = new Color(100, 255, 150, 100);
                gfx.lineWidth = 2;
                gfx.circle(0, 0, this.HEAL_RADIUS);
                gfx.stroke();
                gfx.fillColor = new Color(100, 255, 150, 20);
                gfx.circle(0, 0, this.HEAL_RADIUS);
                gfx.fill();
            },
        },
        {
            id: 'elite',
            enemyType: EnemyType.ELITE,
            name: '精英怪',
            speedMultiplier: 0.7,
            hpMultiplier: 1.6,
            color: new Color(180, 100, 255, 255),
            radius: 20,
            drawExtra: (gfx) => {
                // 精英怪外圈光环
                gfx.strokeColor = new Color(220, 160, 255, 180);
                gfx.lineWidth = 3;
                gfx.circle(0, 0, 24);
                gfx.stroke();
            },
        },
        {
            id: 'boss',
            enemyType: EnemyType.BOSS,
            name: 'BOSS',
            speedMultiplier: 0.5,
            hpMultiplier: 4,               // 血量是同波普通兵的 4 倍（0.3.1：从 5 降到 4，败局平均只打出 70% BOSS 血量）
            color: new Color(255, 70, 70, 255),
            radius: 28,
            onUpdate: (enemy, dt) => {
                // BOSS 技能：每 BOSS_SKILL_INTERVAL 秒锁定一座塔，倒计时内玩家可应对
                enemy.extraTimer += dt;
                if (enemy.extraTimer >= this.BOSS_SKILL_INTERVAL) {
                    enemy.extraTimer = 0;
                    this.triggerBossSkill();
                }
            },
            drawExtra: (gfx) => {
                // BOSS 装饰外框保持暗色；红色外环专用于血量展示（BossHpRing）。
                gfx.strokeColor = new Color(90, 20, 20, 120);
                gfx.lineWidth = 2;
                gfx.circle(0, 0, 34);
                gfx.stroke();
            },
        },
    ];

    /** 按 id 查塔定义 */
    private getTowerDef(id: string): TowerDef | undefined {
        return this.TOWER_REGISTRY.find(t => t.id === id);
    }
    /** 按 enemyType 查敌人定义 */
    private getEnemyDef(type: EnemyType): EnemyDef | undefined {
        return this.ENEMY_REGISTRY.find(e => e.enemyType === type);
    }

    // 波次配置（从 GameBalance 引用）
    private get WAVES() { return WAVES; }

    // 建造点（直接从 GameBalance 引用，固定逻辑坐标）
    private slotNodes: Node[] = [];
    private slotCells: { col: number; row: number }[] = [];  // 塔位对应的网格坐标（用于匹配封闭格）
    private slotPositions: Vec3[] = [];
    private slotOccupied: boolean[] = [];
    private lockedSlots: boolean[] = [];    // 第二类锁定格：初始灰色，需锤子敲开才能放塔（坐标由 MapConfig 配置）
    /** 甜品台地图美术层节点（桌布/糖渍/装饰/虫洞/蛋糕） */
    private mapArt: ReturnType<typeof buildMapArt> | null = null;
    /** 双路分叉：出怪时的分支轮换游标（交替分配，保证两路压力均衡） */
    private spawnBranchToggle = 0;

    // ===== 卡牌系统（支付金币抽卡，拖动卡牌放置/敲开）=====
    private static readonly DRAW_COSTS = [
        25, 25, 25,
        35, 35, 35,
        40, 40, 40,
        45, 45, 45,
        50, 55, 60, 65, 70, 75,
    ];                                                   // 抽卡花费曲线（0.3.2：前3档 30→25），之后按最后一档封顶
    private static readonly MAX_CARD_USES_PER_DRAW = 2;  // 每轮发牌最多使用卡数
    private drawCount = 0;                         // 刷新次数（前两次保证基础塔完整）
    private drawsWithoutShovel = 0;                // 有灰格且连续未出锤子的轮数（第三轮强制出）
    private cardMode = false;                      // 是否处于用卡阶段
    private handCards: CardDef[] = [];             // 当前手牌
    private handCardNodes: Node[] = [];            // 当前激活的手牌卡 UI 节点（与 handCards 平行）
    /** 预创建的 5 个卡槽（setupScene 一次性建好并复用，避免运行时动态建 Graphics 不渲染） */
    private handCardSlots: { node: Node; gfx: Graphics; iconNode: Node; nameLabel: Label; descLabel: Label; kindLabel: Label; unusableNode: Node }[] = [];
    private usedCardCount = 0;                     // 本轮已使用卡数（上限 MAX_CARD_USES_PER_DRAW）
    private dragCardIndex = -1;                    // 正在拖动的卡索引（-1 无）
    private cardGhost: Node | null = null;         // 拖动手牌的幽灵
    private cardGhostGfx: Graphics | null = null;
    private CARD_BAR_Y = 0;                         // 手牌栏 Y（setupScene 赋值）
    private handCardScale = 1;                      // 手牌整体缩放（窄屏自适应，repositionHandCards 赋值）

    // 拖拽
    private ghostNode: Node | null = null;
    private ghostGfx: Graphics | null = null;
    private ghostIcon: Node | null = null;
    private isDragging = false;
    private canPlace = false;
    private targetSlot = -1;  // 当前拖拽目标槽位（TOUCH_MOVE 时确定，TOUCH_END 直接用）

    // 运行时状态
    private battleRoot: Node | null = null;
    private gameTransform: UITransform | null = null;
    private enemies: EnemyRuntime[] = [];
    private towers: TowerRuntime[] = [];
    private towerTimers: number[] = [];
    private bullets: { node: Node; vx: number; vy: number; target: Node; def: TowerDef; tower: TowerRuntime; bounce: number; dmgMul?: number; noSplit?: boolean; hasBounced?: boolean; bounceStep?: number }[] = [];
    private skewerChains: SkewerChainRuntime[] = [];
    private nextSkewerChainId = 1;

    // 地面减速区（胶带战术卡）：独立节点 + 计时器，到期自动清理
    private groundZones: { node: Node; timer: number; radius: number; slowMultiplier: number }[] = [];
    // 战术卡落点（胶带减速区中心等）
    private lastCardDropPos: Vec3 = Vec3.ZERO;

    // === BOSS 锁定技能状态 ===
    private bossLockedTower: TowerRuntime | null = null;
    private bossLockTimer = 0;            // 当前锁定倒计时（秒）
    private bossLockMode: 'merge' | 'ceasefire' | 'downgrade' = 'merge';
    private statusLabel: Label | null = null;
    private goldLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private livesLabel: Label | null = null;
    private hud: HUD | null = null;
    private gold = 0;

    // 友军（基地）：ALLY_MAX_HP_BASE 为初始上限
    private readonly ALLY_MAX_HP_BASE = 7;
    private allyMaxHp = this.ALLY_MAX_HP_BASE;
    private allyHp = 6;

    // === 风险卡状态（咖啡因过载 / 双倍或全无）===
    private waveHasBoss = false;                   // 当前波是否含 BOSS（咖啡因过载 加成/惩罚 的切换条件）
    private gambleWaveIndex: number | null = null; // 双倍或全无：赌约绑定的波次（1-based）
    private gambleWaveLeaks = 0;                   // 双倍或全无：赌约波内漏怪数（零漏怪才发奖金）

    // 波次运行时
    private currentWave = 0;
    private spawnTimer = 0;
    private spawnedInWave = 0;
    private waveTotalCount = 0;  // 当前波次总敌人数
    private waveActive = false;
    private waveElapsed = 0;      // 当前波次已流逝时间（秒）
    private spawnCursor = 0;       // 下一个要生成的 entry 索引
    private activeWaveEntries: SpawnEntry[] = [];
    private wavePattern: 'steady' | 'packs' = 'steady';

    private midWaveRewardGiven = false; // 本波中间奖励（10 金币）是否已发放
    // 暂停状态：
    // - isWavePaused: 波次结束后的"自动暂停"→ 可以建塔/移塔，点"开始下一波"继续
    // - isUserPaused: 用户在波次进行中主动暂停 → 完全冻结，不能拖拽
    private isWavePaused = false;
    private isUserPaused = false;
    // 游戏暂停按钮（右上角）
    private pauseButton: Node | null = null;
    private pauseButtonLabel: Label | null = null;
    // 倒计时圆环（关卡开头 + 波次之间共用）：有宽度的圆环，弧度表示剩余进度，中心展示 "GO"
    private countdownNode: Node | null = null;
    private countdownGfx: Graphics | null = null;
    private countdownValue = 0;     // 剩余秒数
    private countdownTotal = 0;     // 总秒数
    private countdownActive = false;
    private countdownCallback: (() => void) | null = null;
    private countdownPos = new Vec3(0, 0, 0);
    private readonly COUNTDOWN_RING_RADIUS = 28;
    private readonly COUNTDOWN_RING_WIDTH = 6;

    // ===== Roguelike 系统 =====
    private towerStats = new TowerStats();
    private buffCards: Node[] = [];          // 3 张 buff 卡片
    private buffCardLabels: { name: Label; desc: Label; iconNode: Node }[] = [];
    private currentBuffChoices: WaveBuffDefinition[] = [];
    private buffSelected = false;             // 本轮是否已选 buff

    // 本局构筑状态（统一数据层：RunBuildState 记录 Buff/分支/层数/流派标签）
    private runBuild = new RunBuildState();
    private playtest = new PlaytestRecorder();
    private readonly playtestMetadata = this.readPlaytestMetadata();
    private mainBuildPath: Exclude<BuildPath, 'general'> | null = null;  // 主构筑路线
    /** 是否正在三选一选卡（波次间暂停且未选 buff） */
    private get isBuffSelecting(): boolean { return this.isWavePaused && !this.buffSelected; }

    // 塔按钮位置已移入 TOWER_REGISTRY.buttonPos
    // 游戏暂停按钮：右侧（setupScene 中动态赋值）
    private PAUSE_BUTTON_POS = new Vec3(420, 220, 0);
    private readonly PAUSE_BUTTON_RADIUS = 36;  // 触摸判定半径
    // 底部「30金币抽卡」按钮（卡牌系统入口）
    private SPEND_BUTTON_POS = new Vec3(0, 0, 0);    // setupScene 中赋值
    private readonly SPEND_BUTTON_RADIUS = 90;       // 触摸判定半径（按钮加宽）
    private spendButton: Node | null = null;
    private spendButtonLabel: Label | null = null;
    private goldAboveButtonLabel: Label | null = null;  // 金币按钮上方的常驻金币显示

    // 单击塔信息面板
    private static readonly DISMANTLE_COST = 30;     // 拆除塔的固定金币成本（不返还建造费）
    private towerInfoPanel: Node | null = null;
    private towerInfoPanelLabel: Label | null = null;
    private towerInfoDismantleLabel: Label | null = null;
    private towerInfoTarget: TowerRuntime | null = null;
    private towerInfoTimer = 0;            // 信息面板自动隐藏倒计时（秒）

    // 暂停时显示全局 buff 面板
    private globalBuffPanel: Node | null = null;
    private globalBuffLabel: Label | null = null;

    // 响应式布局动态计算结果（setupScene 中赋值，仅 UI 用）
    private _visibleSize: { width: number; height: number } = { width: 640, height: 960 };

    // 拖拽中的塔定义
    private dragTowerDef: TowerDef | null = null;
    // 拖拽模式：'place' 新建 / 'move' 移动已建好的塔
    private dragMode: 'place' | 'move' = 'place';
    // 移动塔时记录原槽位
    private moveFromSlot = -1;

    // 长按移动（取消所有点击交互，仅长按拖动）
    private pendingTower = -1;       // 长按待定的塔索引，长按超时即开始拖动
    private static readonly LONG_PRESS_TIME = 0.4;
    private static readonly MAX_STAR = 2;

    /** 从 Web URL 或微信小游戏启动参数读取本轮测试配置；缺失或非法值由记录器统一警告并回退。 */
    private readPlaytestMetadata(): Partial<PlaytestMetadata> {
        const root = globalThis as unknown as Record<string, any>;
        const values: Record<string, string | undefined> = {};
        const search = typeof root.location?.search === 'string' ? root.location.search.replace(/^\?/, '') : '';
        for (const pair of search.split('&')) {
            if (!pair) continue;
            const separator = pair.indexOf('=');
            const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
            const rawValue = separator >= 0 ? pair.slice(separator + 1) : '';
            try {
                values[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
            } catch {
                console.warn(`[PlaytestMetadata] 无法解析 URL 参数: ${pair} / Unable to decode URL parameter.`);
            }
        }

        const launchQuery = root.wx?.getLaunchOptionsSync?.()?.query as Record<string, string> | undefined;
        const read = (key: string): string | undefined => launchQuery?.[key] ?? values[key];
        return {
            balanceVersion: read('balanceVersion'),
            testGroup: read('testGroup') as PlaytestMetadata['testGroup'] | undefined,
            playStrategy: read('playStrategy') as PlaytestMetadata['playStrategy'] | undefined,
            buildCommit: read('buildCommit'),
        };
    }

    protected start(): void {
        // 设计分辨率 640x960，策略 3 = ResolutionPolicy.FIXED_HEIGHT（注意：3 不是 FIXED_WIDTH）：
        // 高度固定 960，可见宽度 = 屏幕宽×960/屏高，窄屏手机（如 19.5:9）可见宽度仅约 443 < 640，
        // 因此所有横向固定排布的 UI（如手牌）必须按 _visibleSize.width 自适应缩放
        view.setDesignResolutionSize(640, 960, 3);
        this.playtest.beginRun(this.playtestMetadata);
        this.selectWavePattern();
        // 美术阶段：预加载 kind='sprite' 的皮肤贴图（当前全为 graphics 时是 no-op）
        VisualFactory.preloadVisualSprites();
        // 启动时校验卡牌配置（仅 console.error 报告，不修改数据）
        SceneInitializer.validateBuffConfigs();
        this.setupScene();
    }

    private setupScene(): void {
        const canvas = this.node;

        // === 响应式 UI 布局（竖屏：顶部 HUD + 底部塔按钮坞，中间为战场）===
        const visible = view.getVisibleSize();
        const halfW = visible.width / 2;
        const halfH = visible.height / 2;
        const sideMargin = 12;
        const hudReservedHeight = 56;
        const bottomDockHeight = 250;

        // 战场区域：顶部避开 HUD，底部避开塔按钮坞
        const battleTop = halfH - hudReservedHeight;
        const battleBottom = -halfH + bottomDockHeight;
        const battleLeft = -halfW + sideMargin;
        const battleRight = halfW - sideMargin;
        const battleWidth = battleRight - battleLeft;
        const battleHeight = battleTop - battleBottom;
        const battleCenterX = (battleLeft + battleRight) / 2;
        const battleCenterY = (battleTop + battleBottom) / 2;
        // 倒计时圆环位置：与抽卡按钮水平对齐（同高，置于按钮左侧，不遮挡卡牌）
        this.countdownPos = new Vec3(-220, -halfH + 48, 0);

        // 屏幕适配：地图等比缩放填满战场（新地图 576×640 已按战场比例设计，
        // 允许放大不再限制 scale<=1，避免地图周围留大片空白）。
        // scale = min(战场宽/地图宽, 战场高/地图高) × 安全系数
        const mapScale = Math.min(
            battleWidth / MAP_DESIGN_WIDTH,
            battleHeight / MAP_DESIGN_HEIGHT
        ) * 0.98;

        this._visibleSize = visible;

        // === BattleRoot（固定逻辑尺寸 + 等比缩放）===
        this.battleRoot = new Node('BattleRoot');
        this.battleRoot.layer = Layers.Enum.UI_2D;
        this.battleRoot.setParent(canvas);
        this.gameTransform = this.battleRoot.addComponent(UITransform);
        this.gameTransform.setContentSize(MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
        this.gameTransform.setAnchorPoint(0.5, 0.5);
        this.battleRoot.setPosition(battleCenterX, battleCenterY, 0);
        this.battleRoot.setScale(mapScale, mapScale, 1);
        // 挂载特效管理器
        this.battleRoot.addComponent(EffectManager);
        // === 甜品台地图美术（桌布 → 糖霜点缀 → 糖渍双路 → 虫洞入口 → 奶油蛋糕基地）===
        this.mapArt = buildMapArt(this.battleRoot);
        // 6×8 调试网格（可开关，随 BattleRoot 整体缩放）
        if (SHOW_GRID) this.drawGridDebug(this.battleRoot);

        // === 塔位（仅 GridCell，由 gridToLocal 计算位置；与手机尺寸无关，仅供适配缩放）===
        this.slotCells = BUILD_CELLS.map(c => ({ col: c.col, row: c.row }));
        this.slotPositions = BUILD_CELLS.map(c => gridToLocal(c));
        this.slotOccupied = new Array(this.slotPositions.length).fill(false);
        // 第二类锁定格：由 MapConfig 的 LOCKED_BUILD_CELL_KEYS 显式按网格坐标匹配，
        // 不受 BUILD_CELLS 排序/数量变化影响（元素融合阶段调整布局时集中在 MapConfig 改）
        this.lockedSlots = this.slotCells.map(cell => LOCKED_BUILD_CELL_KEYS.has(`${cell.col},${cell.row}`));

        // === 建造点 ===
        for (let i = 0; i < this.slotPositions.length; i++) {
            const slot = this.createTowerSlot(this.slotPositions[i], i, this.lockedSlots[i]);
            slot.setParent(this.battleRoot);
            this.slotNodes.push(slot);
        }

        // === 拖拽幽灵塔 ===
        this.ghostNode = new Node('DragGhost');
        this.ghostNode.layer = Layers.Enum.UI_2D;
        this.ghostNode.setParent(this.battleRoot);
        const ghostTransform = this.ghostNode.addComponent(UITransform);
        ghostTransform.setContentSize(64, 64);
        ghostTransform.setAnchorPoint(0.5, 0.5);
        this.ghostGfx = this.ghostNode.addComponent(Graphics);
        this.ghostIcon = VisualFactory.createCardIcon(this.ghostNode, 58);
        this.ghostIcon.addComponent(UIOpacity).opacity = 190;
        this.drawGhost(false);
        this.ghostNode.active = false;

        // === 底部「30金币抽卡」按钮（卡牌系统入口，置于卡牌栏下方）===
        const btnY = -halfH + 48;
        this.SPEND_BUTTON_POS = new Vec3(0, btnY, 0);
        this.spendButton = this.createSpendButton(this.SPEND_BUTTON_POS);
        this.spendButton.setParent(canvas);
        this.spendButtonLabel = this.spendButton.getChildByName('Text')?.getComponent(Label) ?? null;

        // === 手牌卡牌栏位置（抽卡后显示 5 张卡，置于抽卡按钮上方、倒计时圆环上方）===
        this.CARD_BAR_Y = -halfH + 178;

        // === 拖动手牌幽灵 ===
        this.cardGhost = new Node('CardGhost');
        this.cardGhost.layer = Layers.Enum.UI_2D;
        this.cardGhost.setParent(canvas);
        const cgT = this.cardGhost.addComponent(UITransform);
        cgT.setContentSize(64, 64);
        cgT.setAnchorPoint(0.5, 0.5);
        this.cardGhostGfx = this.cardGhost.addComponent(Graphics);
        this.cardGhost.active = false;

        // === 预创建 5 个手牌卡槽（复用，避免运行时动态建 Graphics 不渲染）===
        for (let i = 0; i < 5; i++) this.buildHandCardSlot(i);

        // === 金币按钮上方常驻金币显示（"gold N"）===
        const goldLabelNode = new Node('GoldAboveButton');
        goldLabelNode.layer = Layers.Enum.UI_2D;
        const goldLabelT = goldLabelNode.addComponent(UITransform);
        goldLabelT.setContentSize(160, 24);
        goldLabelNode.setParent(canvas);
        goldLabelNode.setPosition(0, btnY + 48, 0);
        const goldLabelComp = goldLabelNode.addComponent(Label);
        goldLabelComp.string = `gold ${this.gold}`;
        goldLabelComp.fontSize = 18;
        goldLabelComp.color = new Color(255, 220, 100, 255);
        goldLabelComp.horizontalAlign = Label.HorizontalAlign.CENTER;
        goldLabelComp.verticalAlign = Label.VerticalAlign.CENTER;
        this.goldAboveButtonLabel = goldLabelComp;

        // === 游戏暂停按钮（顶部右侧，HUD 下方）===
        this.PAUSE_BUTTON_POS = new Vec3(halfW - 44, battleTop - 34, 0);
        this.pauseButton = this.createPauseButton();
        this.pauseButton.setParent(canvas);
        this.pauseButtonLabel = this.pauseButton.getChildByName('Text')?.getComponent(Label) ?? null;
        this.updatePauseButton();

        // === 倒计时圆环（关卡开头 / 波次之间共用）===
        this.createCountdownRing();

        // === Roguelike buff 卡片（3 张，波次间暂停时显示，竖向堆叠居中）===
        const cardPositions = [new Vec3(0, 110, 0), new Vec3(0, 0, 0), new Vec3(0, -110, 0)];
        for (let i = 0; i < 3; i++) {
            const card = this.createBuffCard(cardPositions[i], i);
            card.setParent(canvas);
            card.active = false;
            this.buffCards.push(card);
            const nameLabel = card.getChildByName('BuffName')?.getComponent(Label) ?? null;
            const descLabel = card.getChildByName('BuffDesc')?.getComponent(Label) ?? null;
            const iconNode = card.getChildByName('Icon')!;
            this.buffCardLabels.push({ name: nameLabel!, desc: descLabel!, iconNode });
        }

        // === 所有触摸事件绑定到 Canvas ===
        canvas.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const buttonLocal = this.eventToCanvasLocal(event);
            const gameLocal = this.eventToGameLocal(event);

            // 结算弹窗（胜利/失败）显示期间：Canvas 不再响应任何交互（抽牌/拖牌/棋盘操作）
            // 弹窗按钮通过自身 TOUCH_END + propagationStopped 独立处理，不在此分支
            if (this.isGameOver) return;

            // 信息面板打开时，任意点击先关闭它（同一次点击不重复触发）
            if (this.towerInfoPanel && this.towerInfoPanel.active) {
                this.hideTowerInfo();
            }

            // 0. （已移除）塔点击菜单交互：现改为长按移动，无点击菜单

            // 0a. 判定：是否点中了 buff 卡片（仅波次间暂停且未选时可见）
            if (this.isWavePaused && !this.buffSelected) {
                for (let i = 0; i < this.buffCards.length; i++) {
                    const card = this.buffCards[i];
                    if (!card.active) continue;
                    const cardPos = card.getPosition();
                    const ct = card.getComponent(UITransform);
                    const halfW = (ct ? ct.width : 160) / 2;
                    const halfH = (ct ? ct.height : 104) / 2;
                    if (Math.abs(buttonLocal.x - cardPos.x) <= halfW && Math.abs(buttonLocal.y - cardPos.y) <= halfH) {
                        this.selectBuff(i);
                        return;
                    }
                }
            }

            // 0b. 倒计时圆环：点击圆环可跳过等待，立即开战
            if (this.countdownActive
                && Vec3.distance(buttonLocal, this.countdownPos) <= this.COUNTDOWN_RING_RADIUS + this.COUNTDOWN_RING_WIDTH) {
                this.skipCountdown();
                return;
            }

            // 1. 判定：是否点中了右上角游戏暂停按钮
            if (Vec3.distance(buttonLocal, this.PAUSE_BUTTON_POS) <= this.PAUSE_BUTTON_RADIUS) {
                this.toggleGamePause();
                return;
            }

            // 1.2 全局暂停（⏸）：除「继续」按钮外，禁止一切交互（召唤/挪动/合并）
            if (this.isUserPaused) return;

            // 1.4 三选一选卡期间：禁止召唤、移动、交换、合并
            if (this.isBuffSelecting) return;

            // 用卡阶段为非模态：仅命中手牌或底部按钮才拦截，其余区域继续棋盘塔判定
            // （移动塔 / 交换塔 / 同类塔合并 / BOSS 锁定一星塔合并应对 均可在手牌阶段进行）
            if (this.cardMode) {
                // 点中底部按钮 → 结束选牌（同一按钮在用卡阶段即「结束选牌」）
                if (Vec3.distance(buttonLocal, this.SPEND_BUTTON_POS) <= this.SPEND_BUTTON_RADIUS) {
                    this.finishCardSelection();
                    return;
                }
            }

            // 命中手牌 → 开始拖牌（选牌阶段外也允许：用满额度后残留的改造卡仍需可用，
            // 否则卡面可见却拖不动，玩家会误判为「卡坏了」）
            const ci = this.findHandCardAt(buttonLocal);
            if (ci >= 0) {
                const card = this.handCards[ci];
                // 非选牌阶段仅放行即时改造卡；塔卡/锤子涉及建塔与格子，仍需在选牌阶段使用
                if (this.cardMode || card.kind === 'modifier' || card.kind === 'tactic') {
                    if (this.isHandCardUsable(card)) {
                        this.dragCardIndex = ci;
                        this.isDragging = true;
                        this.cardGhost!.active = true;
                        this.cardGhost!.setPosition(buttonLocal);
                        this.drawCardGhost(card);
                        return;
                    }
                    if (this.statusLabel) this.statusLabel.string = '该卡当前不可用';
                    return;
                }
                if (!this.cardMode) {
                    if (this.statusLabel) this.statusLabel.string = '该卡需在抽卡后使用';
                    return;
                }
            }

            // 1.5 判断是否点中了底部抽卡按钮（用卡阶段已在上面处理为「结束选牌」）
            if (Vec3.distance(buttonLocal, this.SPEND_BUTTON_POS) <= this.SPEND_BUTTON_RADIUS) {
                this.drawCards();
                return;
            }

            // 1.7 点击锁定格（非卡牌阶段）：提示用锤子卡敲开
            const hitSlot = this.findSlotAt(gameLocal);
            if (hitSlot >= 0 && this.lockedSlots[hitSlot]) {
                if (this.statusLabel) this.statusLabel.string = '用锤子卡敲开此格';
                return;
            }

            // 3. 判断是否点中了已建好的塔（长按开始移动；无点击菜单）
            const hitTower = this.findTowerAt(gameLocal);
            if (hitTower < 0) {
                return;
            }
            // 普通：长按超时直接开始拖动（取消所有点击交互）
            this.pendingTower = hitTower;
            this.unschedule(this.onLongPressMove);
            this.scheduleOnce(this.onLongPressMove, SceneInitializer.LONG_PRESS_TIME);
            return;
        });

        canvas.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (this.isUserPaused) return;  // 全局暂停时禁止拖动
            if (!this.isDragging) return;
            const local = this.eventToGameLocal(event);
            // 不再要求 cardMode：用满额度后残留的改造卡/战术卡拖动时 ghost 也需跟随手指
            if (this.dragCardIndex >= 0) {
                this.cardGhost!.setPosition(this.eventToCanvasLocal(event));
                return;
            }
            this.ghostNode!.setPosition(local);
            this.updateGhostState(local);
        });

        canvas.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (this.isUserPaused) return;  // 全局暂停时禁止松手合并/弹信息
            // 卡牌拖动松手：判定落点使用（无效则取消）
            // 注意：不再要求 cardMode——用满额度后残留的改造卡/战术卡仍可拖放使用，
            // 否则卡面可见却拖不动，玩家会误判为「卡坏了」
            if (this.isDragging && this.dragCardIndex >= 0) {
                this.handleCardDrop(event);
                return;
            }
            // 长按未触发（短按）→ 展示塔信息面板
            if (!this.isDragging && this.pendingTower >= 0) {
                const t = this.towers[this.pendingTower];
                this.pendingTower = -1;
                this.unschedule(this.onLongPressMove);
                if (t) this.showTowerInfo(t);
                return;
            }
            if (!this.isDragging) return;
            this.isDragging = false;
            this.ghostNode!.active = false;

            // 直接用 targetSlot（在 TOUCH_MOVE 中已确定）
            if (this.canPlace && this.targetSlot >= 0) {
                const slot = this.targetSlot;

                if (this.lockedSlots[slot]) {
                    if (this.statusLabel) this.statusLabel.string = '该格被封锁，需用锤子敲开';
                } else if (this.dragMode === 'place') {
                    this.placeTower(slot, this.dragTowerDef!);
                } else if (this.dragMode === 'move' && this.moveFromSlot >= 0 && this.moveFromSlot !== slot) {
                    // 通过原槽位找到正在移动的塔
                    const movingTowerIdx = this.towers.findIndex(t =>
                        Vec3.distance(t.node.position, this.slotPositions[this.moveFromSlot]) < 5
                    );

                    if (movingTowerIdx >= 0) {
                        const movingTower = this.towers[movingTowerIdx];
                        if (this.slotOccupied[slot]) {
                            // 目标已占用 → 判断升级（同类型同等级）或互换
                            const targetTowerIdx = this.towers.findIndex(t =>
                                Vec3.distance(t.node.position, this.slotPositions[slot]) < 5
                            );
                            if (targetTowerIdx >= 0) {
                                const targetTower = this.towers[targetTowerIdx];
                                const canUpgrade = movingTower.def.id === targetTower.def.id
                                    && movingTower.star === targetTower.star
                                    && targetTower.star < SceneInitializer.MAX_STAR;
                                if (canUpgrade) {
                                    this.upgradeTower(targetTower);
                                    this.removeTowerNode(movingTowerIdx);
                                    this.playtest.recordOperation('tower_merged', { towerId: targetTower.def.id, star: targetTower.star });
                                } else {
                                    // 不同类型/不同等级/满星 → 互换位置
                                    this.towers[targetTowerIdx].node.setPosition(this.slotPositions[this.moveFromSlot]);
                                    this.restoreTowerAppearance(this.towers[targetTowerIdx].node, this.towers[targetTowerIdx].def);
                                    movingTower.node.setPosition(this.slotPositions[slot]);
                                    this.restoreTowerAppearance(movingTower.node, movingTower.def);
                                    this.playtest.recordOperation('tower_swapped', {
                                        fromSlot: this.moveFromSlot + 1,
                                        toSlot: slot + 1,
                                        towerId: movingTower.def.id,
                                    });
                                    console.log(`塔互换: 位置 ${this.moveFromSlot + 1} ↔ ${slot + 1}`);
                                }
                            }
                        } else {
                            // 目标空 → 直接移动
                            movingTower.node.setPosition(this.slotPositions[slot]);
                            this.restoreTowerAppearance(movingTower.node, movingTower.def);
                            this.slotOccupied[this.moveFromSlot] = false;
                            this.slotNodes[this.moveFromSlot].active = true;
                            this.redrawSlot(this.moveFromSlot, this.lockedSlots[this.moveFromSlot]);
                            this.slotOccupied[slot] = true;
                            this.slotNodes[slot].active = false;
                            this.playtest.recordOperation('tower_moved', {
                                towerId: movingTower.def.id,
                                fromSlot: this.moveFromSlot + 1,
                                toSlot: slot + 1,
                            });
                            console.log(`塔从位置 ${this.moveFromSlot + 1} 移动到 ${slot + 1}`);
                        }
                    }
                    this.moveFromSlot = -1;
                }
            }
            // 移动模式下未成功放置 → 恢复原塔外观
            if (this.dragMode === 'move' && this.moveFromSlot >= 0 && this.dragTowerDef) {
                const movingTowerIdx = this.towers.findIndex(t =>
                    Vec3.distance(t.node.position, this.slotPositions[this.moveFromSlot]) < 5
                );
                if (movingTowerIdx >= 0) {
                    this.restoreTowerAppearance(this.towers[movingTowerIdx].node, this.towers[movingTowerIdx].def);
                }
            }
            this.canPlace = false;
            this.targetSlot = -1;
            this.moveFromSlot = -1;
            this.pendingTower = -1;
            this.dragMode = 'place';
        });

        canvas.on(Node.EventType.TOUCH_CANCEL, () => {
            // 移动取消时恢复原塔外观
            if (this.dragMode === 'move' && this.moveFromSlot >= 0 && this.dragTowerDef) {
                const movingTowerIdx = this.towers.findIndex(t =>
                    Vec3.distance(t.node.position, this.slotPositions[this.moveFromSlot]) < 5
                );
                if (movingTowerIdx >= 0) {
                    this.restoreTowerAppearance(this.towers[movingTowerIdx].node, this.towers[movingTowerIdx].def);
                }
            }
            this.isDragging = false;
            this.ghostNode!.active = false;
            this.unschedule(this.onLongPressMove);
            this.pendingTower = -1;
            this.canPlace = false;
            this.targetSlot = -1;
            this.moveFromSlot = -1;
            this.dragMode = 'place';
            // 统一清理卡牌拖拽状态（卡幽灵/拖拽索引/isDragging）
            this.cancelCardDrag();
        });

        // === HUD（统一顶部状态栏：Gold / Base / Status / Wave）===
        const hudNode = new Node('HUD');
        hudNode.layer = Layers.Enum.UI_2D;
        hudNode.setParent(canvas);
        this.hud = hudNode.addComponent(HUD);
        this.hud.init(this._visibleSize.width, this._visibleSize.height);
        this.goldLabel = this.hud.goldLabel;
        this.waveLabel = this.hud.waveLabel;
        this.livesLabel = this.hud.livesLabel;
        this.statusLabel = this.hud.statusLabel;
        this.gold = this.INITIAL_GOLD;
        // 统一同步 HUD 顶部金币与按钮上方常驻金币（避免开局按钮上方显示 0）
        this.updateGoldLabel();
        this.hud.setWave(0, this.WAVES.length);
        this.hud.setLives(this.allyHp, this.allyMaxHp);
        this.hud.setStatus(`点击「${this.currentDrawCost()}金抽卡」，5张牌最多使用2张`);

        // === 关卡开始倒计时 ===
        this.startLevelCountdown();

        console.log('SceneInitializer: 极简版启动');
        console.log(`波次配置: ${this.WAVES.length} 波`);
        this.WAVES.forEach((w, i) => {
            console.log(`  Wave ${i + 1}: ${w.entries.length} 只`);
        });
    }

    /** 游戏暂停按钮：切换用户暂停（只在波次进行中有效，波次间暂停时此按钮无效） */
    private toggleGamePause(): void {
        if (this.isGameOver || this.isWavePaused) return;
        this.isUserPaused = !this.isUserPaused;
        console.log(this.isUserPaused ? '游戏暂停' : '游戏继续');
        this.updatePauseButton();
        // 暂停时显示全局 buff 面板，继续时隐藏
        if (this.isUserPaused) this.showGlobalBuffPanel();
        else this.hideGlobalBuffPanel();
        this.refreshSpendButton();   // 暂停/继续切换后刷新抽卡按钮可用性
    }

    /** 关卡开始倒计时：给玩家时间建塔布防，结束后启动第一波 */
    private startLevelCountdown(): void {
        if (this.statusLabel) {
            this.statusLabel.string = `敌群变体：${this.wavePatternName()} · 布防准备中…`;
        }
        console.log(`关卡开始倒计时 ${this.LEVEL_START_COUNTDOWN} 秒`);
        this.startCountdown(this.LEVEL_START_COUNTDOWN, () => this.startNextWave());
    }

    /** 创建倒计时圆环（带宽度，中心展示 "GO"） */
    private createCountdownRing(): void {
        const node = new Node('CountdownRing');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(this.node);
        const t = node.addComponent(UITransform);
        const size = this.COUNTDOWN_RING_RADIUS * 2 + this.COUNTDOWN_RING_WIDTH + 8;
        t.setContentSize(size, size);
        t.setAnchorPoint(0.5, 0.5);
        node.setPosition(this.countdownPos);
        node.active = false;

        const gfx = node.addComponent(Graphics);

        // 中心文字 "GO"
        const labelNode = new Node('GO');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setParent(node);
        labelNode.setPosition(0, 0, 0);
        const lt = labelNode.addComponent(UITransform);
        lt.setContentSize(60, 30);
        const label = labelNode.addComponent(Label);
        label.string = 'GO';
        label.fontSize = 18;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        this.countdownNode = node;
        this.countdownGfx = gfx;
    }

    /** 绘制倒计时圆环：背景轨道 + 剩余进度弧（从顶部顺时针递减） */
    private drawCountdownRing(): void {
        if (!this.countdownGfx) return;
        const gfx = this.countdownGfx;
        gfx.clear();
        const r = this.COUNTDOWN_RING_RADIUS;
        const w = this.COUNTDOWN_RING_WIDTH;

        // 背景轨道（半透明灰）
        gfx.lineWidth = w;
        gfx.strokeColor = new Color(255, 255, 255, 60);
        gfx.circle(0, 0, r);
        gfx.stroke();

        // 进度弧：progress 从 1（满）递减到 0（空）
        const progress = this.countdownTotal > 0
            ? Math.max(0, Math.min(1, this.countdownValue / this.countdownTotal))
            : 0;
        const steps = 64;
        const totalAngle = 2 * Math.PI * progress;
        const startTop = Math.PI / 2;  // 顶部起笔
        gfx.lineWidth = w;
        gfx.strokeColor = new Color(80, 220, 120, 255);
        gfx.moveTo(Math.cos(startTop) * r, Math.sin(startTop) * r);
        for (let i = 1; i <= steps; i++) {
            const a = startTop - (i / steps) * totalAngle;  // 顺时针递减
            gfx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        gfx.stroke();
    }

    /** 启动一个倒计时（秒），结束回调 onComplete */
    private startCountdown(seconds: number, onComplete: () => void): void {
        this.countdownTotal = seconds;
        this.countdownValue = seconds;
        this.countdownActive = true;
        this.countdownCallback = onComplete;
        if (this.countdownNode) this.countdownNode.active = true;
        this.drawCountdownRing();
    }

    /** 停止倒计时并隐藏圆环 */
    private stopCountdown(): void {
        this.countdownActive = false;
        this.countdownCallback = null;
        if (this.countdownNode) this.countdownNode.active = false;
    }

    /** 跳过倒计时：立即执行结束回调 */
    private skipCountdown(): void {
        if (!this.countdownActive) return;
        const cb = this.countdownCallback;
        this.stopCountdown();
        cb?.();
    }

    /** 波次间暂停时：随机选 3 种 buff 并显示卡片 */
    /**
     * 根据当前局面构建动态加权卡池
     * - 没有杀虫喷雾时：不出现溅射/出血（杀虫喷雾专属卡）
     * - 下一波有治疗兵：提高治疗抑制出现率
     * - 已获得溅射：溅射强化仍可出现
     * - 减速塔较多（≥2）：提高攻速/范围出现率
     */
    /**
     * 卡牌配置校验（启动时调用）。发现错误仅通过 console.error 报告，不修改数据。
     * 校验项（新数据层）：三选一与手牌的 ID 各自唯一且不跨表冲突；
     * unlockConditions/excludeConditions/weightRules 引用合法；minWave>=1；maxStacks>0；
     * 效果 effects 非空（waveBuff 必需）。
     */
    /** 由 attack.attackType 派生过渡期运行时开关（attackKind/sweep/bounce），
     *  使 attackType 成为攻击形态的唯一真相来源，避免与旧字段漂移。下一阶段战斗重构后移除。 */
    private static normalizeTowerDef(def: TowerDef): TowerDef {
        const t = def.attack.attackType;
        const isBullet = t === 'projectile' || t === 'scatter' || t === 'lob' || t === 'pierce' || t === 'chain';
        def.attackKind = isBullet ? 'bullet' : 'instant';
        def.sweep = t === 'sweep';
        def.bounce = t === 'chain' ? (def.attack.maxTargets ?? 0) : undefined;
        return def;
    }

    private static validateBuffConfigs(): void {
        const all: { id: string; where: string }[] = [];
        const check = (opts: { id: string; minWave: number; maxStacks: number; effects: unknown[]; where: string }[]) => {
            for (const o of opts) {
                if (all.some(x => x.id === o.id)) {
                    console.error(`[BuffConfig] 卡牌ID重复: "${o.id}"（跨表冲突）`);
                }
                all.push({ id: o.id, where: o.where });
                if (o.minWave < 1) console.error(`[BuffConfig] "${o.id}" minWave 必须 >=1（${o.minWave}）`);
                if (!(o.maxStacks > 0)) console.error(`[BuffConfig] "${o.id}" maxStacks 必须 >0（${o.maxStacks}）`);
                if (o.effects.length === 0) console.error(`[BuffConfig] "${o.id}" 缺少 effects 配置`);
            }
        };
        check(WAVE_BUFFS.map(b => ({ id: b.id, minWave: b.minWave, maxStacks: b.maxStacks, effects: b.effects, where: 'waveBuff' })));
        check(DRAW_CARDS.map(c => ({ id: c.id, minWave: c.minWave, maxStacks: c.maxStacks, effects: c.effects, where: 'drawCard' })));
    }

    /**
     * 构建当前局面快照（喂给条件/权重评估）：棋盘状态 + 场上塔 + 本局构筑。
     * 评估时塔标签取空数组（旧场景条件已改为按 towerId 判断，无需塔标签）。
     */
    private buildSnapshot(): GameSnapshot {
        const board = {
            hasEmptyTile: this.slotPositions.some((_, i) => !this.slotOccupied[i] && !this.lockedSlots[i]),
            hasLockedTile: this.lockedSlots.some(l => l),
            boardFull: this.slotPositions.every((_, i) => this.slotOccupied[i] || this.lockedSlots[i]),
        };
        const towers = this.towers.map(t => ({ id: t.def.id, tags: [] as string[], corePowered: t.corePowered }));
        return this.runBuild.toSnapshot(board, towers, this.currentWave);
    }

    /** 试玩记录快照：只包含可 JSON 序列化的事实，不保留 Cocos 节点引用。 */
    private buildPlaytestSnapshot(): PlaytestSnapshot {
        const groups = new Map<string, { id: string; name: string; count: number; stars: number[] }>();
        for (const tower of this.towers) {
            const group = groups.get(tower.def.id) ?? { id: tower.def.id, name: tower.def.name, count: 0, stars: [] };
            group.count++;
            group.stars.push(tower.star);
            groups.set(tower.def.id, group);
        }
        return {
            gold: this.gold,
            baseHp: this.allyHp,
            towers: Array.from(groups.values()).map(group => ({ ...group, stars: group.stars.slice().sort() })),
            buffIds: this.runBuild.selectedBuffIds.slice(),
            modifiers: JSON.parse(JSON.stringify(this.runBuild.towerModifierStacks)),
        };
    }

    /** 自动识别四套已实现流派的方向、基础成立和质变时间点。 */
    private refreshPlaytestBuildMilestones(): void {
        const count = (id: string) => this.towers.filter(t => t.def.id === id).length;
        const hasBuff = (id: string) => this.runBuild.hasBuff(id);
        const wave = Math.max(1, this.currentWave);
        const mark = (id: string, name: string, stage: 'direction' | 'basic' | 'transform') =>
            this.playtest.recordMilestone(wave, id, name, stage);

        const controlParts = Number(count('slow') > 0) + Number(count('toothbrush') > 0) + Number(count('spatula') > 0);
        if (controlParts >= 2 || hasBuff('shatter_slow') || hasBuff('brush_weakspot')) mark('control_burst', '控制爆破流', 'direction');
        if (controlParts === 3) mark('control_burst', '控制爆破流', 'basic');
        if (controlParts === 3 && hasBuff('shard_detonation')) mark('control_burst', '控制爆破流', 'transform');

        const hasStraw = count('bubble_tea_straw') > 0;
        const hasPowerbank = count('powerbank') > 0;
        const hasCorePower = this.runBuild.hasTowerModifier('powerbank', 'core_power');
        const hasDoubleStraw = this.runBuild.hasTowerModifier('bubble_tea_straw', 'double_straw');
        if (Number(hasStraw) + Number(hasPowerbank) + Number(hasCorePower || hasDoubleStraw) >= 2) mark('milk_tea_power', '奶茶供电流', 'direction');
        if (hasStraw && hasPowerbank && hasCorePower) mark('milk_tea_power', '奶茶供电流', 'basic');
        if (hasStraw && hasPowerbank && hasCorePower && hasDoubleStraw && hasBuff('overload_double_tap')) mark('milk_tea_power', '奶茶供电流', 'transform');

        const hasPoison = count('poison') > 0;
        const hasRubberband = count('rubberband') > 0;
        const hasPoisonBurst = this.runBuild.hasTowerModifier('poison', 'poison_burst');
        if ((hasPoison && hasRubberband) || hasPoisonBurst) mark('poison_burst', '弹射毒爆流', 'direction');
        if (hasPoison && hasRubberband && hasPoisonBurst) mark('poison_burst', '弹射毒爆流', 'basic');
        if (hasPoison && hasRubberband && hasPoisonBurst && (hasBuff('toxic_residue') || hasBuff('concentrated_burst'))) {
            mark('poison_burst', '弹射毒爆流', 'transform');
        }

        const hasChopsticks = count('chopsticks') > 0;
        const hasScissors = count('scissors') > 0;
        const hasThread = this.runBuild.hasTowerModifier('chopsticks', 'thread_spool');
        if (Number(hasChopsticks) + Number(hasScissors) + Number(hasThread) >= 2) mark('skewer_cut', '串线剪断流', 'direction');
        if (hasChopsticks && hasScissors && hasThread) mark('skewer_cut', '串线剪断流', 'basic');
        if (hasChopsticks && hasScissors && hasThread && hasBuff('decisive_cut')) mark('skewer_cut', '串线剪断流', 'transform');
    }

    /**
     * 卡牌资格判断（抽取与补位共用）：波次区间 + 次数上限 + 结构化前置/互斥。
     * 场景条件（如 splash/bleed 需杀虫喷雾、slow 需减速塔）已写入各 Buff 的 unlockConditions，
     * 由 ConditionEvaluator.meetsUnlock 统一评估，与补位共用同一套，绝不绕过。
     */
    private isBuffEligible(buff: WaveBuffDefinition): boolean {
        const wave = this.currentWave;  // 选卡发生在波次间，currentWave 已指向下一波
        if (wave < buff.minWave) return false;
        if (buff.maxWave !== undefined && wave > buff.maxWave) return false;
        if (this.runBuild.stacksOf(buff.id) >= buff.maxStacks) return false;
        const snap = this.buildSnapshot();
        if (!meetsUnlock(buff, snap)) return false;
        if (triggersExclude(buff, snap)) return false;
        return true;
    }

    private buildBuffPool(): { buff: WaveBuffDefinition; weight: number }[] {
        const snap = this.buildSnapshot();

        // 下一波是否有治疗兵（运行期特殊加权，经保底补偿注入）
        const nextWave = this.WAVES[this.currentWave];  // currentWave 已 +1，指向下一波
        const nextWaveHasHealer = nextWave?.entries.some(e => e.type === EnemyType.HEALER) ?? false;

        const pool: { buff: WaveBuffDefinition; weight: number }[] = [];

        for (const buff of WAVE_BUFFS) {
            // 资格判断（波次/次数/前置/互斥/场景条件），不通过则不进卡池
            if (!this.isBuffEligible(buff)) continue;

            // 运行期特殊加权：下一波有治疗兵时，治疗抑制显著增权（近似旧 weight=5）
            let pity = 0;
            if (buff.id === 'healSuppress' && nextWaveHasHealer) pity += 400;

            // 动态权重 = baseWeight × 倍率 + 额外 + 保底补偿（由 ConditionEvaluator + WeightCalculator 统一计算）
            const relatedSelections = this.countRelatedBuildSelections(buff);
            // 正反馈只帮助第一个连接件，不持续推送整条路线
            const useWeightRules = relatedSelections === 0;
            let weight = computeWeight(
                { baseWeight: buff.baseWeight, weightRules: useWeightRules ? buff.weightRules : [], pityBonus: pity },
                snap,
            );
            if (relatedSelections >= 2) weight *= buff.contentType === 'capstone' ? 1.1 : 0.45;
            pool.push({ buff, weight });
        }

        return pool;
    }

    private buffHasTag(buff: WaveBuffDefinition, tag: string): boolean {
        return buff.tags.indexOf(tag) >= 0;
    }

    /** 按 buildId 精确统计已选强化，避免不同流派因共用标签被误降权。 */
    private countRelatedBuildSelections(candidate: WaveBuffDefinition): number {
        if (!candidate.buildId) return 0;
        return this.runBuild.selectedBuffIds.reduce((count, id) => {
            const selected = WAVE_BUFFS.find(buff => buff.id === id);
            return selected?.buildId === candidate.buildId ? count + 1 : count;
        }, 0);
    }

    private pickWeightedBuff(
        pool: { buff: WaveBuffDefinition; weight: number }[],
        used: Set<string>,
        predicate?: (buff: WaveBuffDefinition) => boolean,
    ): WaveBuffDefinition | null {
        const candidates = pool.filter(p => !used.has(p.buff.id) && (!predicate || predicate(p.buff)));
        if (candidates.length === 0) return null;
        const totalWeight = candidates.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
        if (totalWeight <= 0) return candidates[0].buff;
        let r = Math.random() * totalWeight;
        for (const p of candidates) {
            r -= Math.max(0, p.weight);
            if (r <= 0) return p.buff;
        }
        return candidates[candidates.length - 1].buff;
    }

    private showBuffSelection(): void {
        // 波后三选一：先清理可能残留的卡牌拖拽状态
        this.cancelCardDrag();
        this.refreshSpendButton();   // 进入三选一：抽卡按钮灰显
        // 动态卡池：根据当前局面构建加权卡池
        const pool = this.buildBuffPool();
        this.currentBuffChoices = [];

        // 三选一结构：稳牌 / 流派牌 / 贪牌。某一桶暂无合格牌时，再从全池补位。
        const used = new Set<string>();
        for (const roleTag of ['role:survival', 'role:build', 'role:greed']) {
            const pick = this.pickWeightedBuff(pool, used, buff => this.buffHasTag(buff, roleTag));
            if (!pick) continue;
            this.currentBuffChoices.push(pick);
            used.add(pick.id);
        }
        while (this.currentBuffChoices.length < 3) {
            const pick = this.pickWeightedBuff(pool, used);
            if (!pick) break;
            this.currentBuffChoices.push(pick);
            used.add(pick.id);
        }

        // 安全降级：合格卡可能不足 3 张，按实际数量展示。
        const choiceCount = this.currentBuffChoices.length;
        // 显示卡片并填充文字（splash buff 根据当前等级动态显示）
        for (let i = 0; i < choiceCount; i++) {
            const card = this.buffCards[i];
            const buff = this.currentBuffChoices[i];
            const display = { name: buff.name, desc: buff.description };
            card.active = true;
            if (this.buffCardLabels[i].name) {
                this.buffCardLabels[i].name.string = display.name;
            }
            if (this.buffCardLabels[i].desc) {
                this.buffCardLabels[i].desc.string = this.formatHandCardDesc(display.desc);
            }
            const hasIcon = VisualFactory.setCardIcon(this.buffCardLabels[i].iconNode, buff.id);
            const nameNode = this.buffCardLabels[i].name.node;
            // 名称位置随卡加高同步（y 14→33）：有卡图时右移让位给图标，无卡图时居中
            nameNode.setPosition(hasIcon ? 18 : 0, 33, 0);
            nameNode.getComponent(UITransform)?.setContentSize(hasIcon ? 112 : 150, 26);
        }
        // 合格卡不足 3 张时，隐藏未被使用的卡片位
        for (let i = choiceCount; i < 3; i++) {
            if (this.buffCards[i]) this.buffCards[i].active = false;
        }
        this.playtest.offerBuff(this.currentWave, this.currentBuffChoices.map(buff => ({
            id: buff.id,
            name: buff.name,
            role: buff.tags.find(tag => tag.startsWith('role:')) ?? 'role:general',
        })));
        this.buffSelected = false;
    }

    /** 玩家选中一个 buff */
    private selectBuff(index: number): void {
        const buff = this.currentBuffChoices[index];
        if (!buff) return;
        this.applyBuffChoice(index);
    }

    /** 应用某个 buff 选择（不含启动倒计时，倒计时在波次结束时已统一启动） */
    private applyBuffChoice(index: number): void {
        const buff = this.currentBuffChoices[index];
        if (!buff) return;
        const display = { name: buff.name, desc: buff.description };
        this.playtest.selectBuff(buff.id, buff.name);
        // 选卡反馈特效
        if (this.buffCards[index]) {
            EffectManager.instance?.playCardSelected(this.buffCards[index], display.name);
        }
        // 统一效果执行器：按 effects 配置应用到本局（modifyStat 直接改 towerStats）
        executeEffects(buff.effects, this.effectContext());
        // 记录本局构筑状态（Buff/分支/层数/流派标签）
        this.runBuild.record(buff);
        this.refreshPlaytestBuildMilestones();
        const bp = buff.buildPaths.find(p => p !== 'general');
        if (this.mainBuildPath === null && bp) {
            this.mainBuildPath = bp as Exclude<BuildPath, 'general'>;
        }
        this.buffSelected = true;
        this.refreshSpendButton();   // 三选一结束：恢复抽卡按钮可用性判定
        // 延迟隐藏卡片，让特效播放完
        this.scheduleOnce(() => this.hideBuffCards(), 0.3);
        // 更新 status 显示当前加成
        if (this.statusLabel) {
            this.statusLabel.string = `已选: ${display.name}  塔: ${this.towers.length}`;
        }
        // 选完 buff 直接开始下一波（不再有波次间倒计时）
        this.isWavePaused = false;
        this.startNextWave();
        console.log(`Roguelike 选择: ${display.name}`);
    }

    /** 构建效果执行上下文：运行主流程在此注入具体棋盘/塔/敌人操作 */
    private effectContext() {
        return {
            towerStats: this.towerStats,
            // 战术卡：冻结全场（以强减速实现，复用现有 slow 系统）
            addStatusToEnemies: (status: string, duration: number, chance?: number) => {
                for (const e of this.enemies) {
                    if (chance !== undefined && Math.random() >= chance) continue;
                    e.slowTimer = Math.max(e.slowTimer, duration);
                    e.slowMultiplier = status === 'freeze' ? 0.4 : 0.6;
                }
            },
            // 战术卡：全场伤害（扣血，死亡交由 update 既有逻辑处理）
            dealDamageToEnemies: (amount: number) => {
                for (const e of this.enemies) {
                    this.damageEnemy(e, amount, {
                        sourceType: 'tactic', sourceId: 'global_tactic', sourceName: '全场战术',
                        mechanismId: 'tactic_damage', mechanismName: '全场伤害',
                    });
                }
            },
            grantGold: (amount: number) => {
                this.gold += amount;
                this.updateGoldLabel();
            },
            // 改造卡：为指定塔类型附加本局改造（记录到 runBuild，同类塔共享）
            addModifierToTower: (towerId: string, modifierId: string) => {
                const modDef = TOWER_MODIFIERS.find(m => m.id === modifierId);
                const keyTowerId = modDef?.towerId ?? towerId;
                this.runBuild.addTowerModifier(keyTowerId, modifierId, modDef?.maxStacks ?? 1);
                this.refreshTowerBadges(keyTowerId);
                if (modifierId === 'double_straw') this.refreshDoubleStrawMarkers(keyTowerId);
            },
            // 锤子：兜底解锁第一个灰格（手牌拖放的精确解锁仍走 useHammer）
            unlockTile: () => {
                const i = this.lockedSlots.findIndex(l => l);
                if (i >= 0) { this.lockedSlots[i] = false; this.redrawSlot(i, false); }
            },
            // 家庭小物件：胶带地面减速区（落点由 handleCardDrop 写入 lastCardDropPos）
            custom: (effectId: string, effect: EffectDefinition) => {
                if (effectId === 'groundSlowZone') {
                    const p = effect.parameters ?? {};
                    const radius = Number(p.radius ?? 80);
                    const duration = Number(p.duration ?? 8);
                    const slowMul = Number(p.slowMultiplier ?? 0.6);
                    this.createGroundZone(this.lastCardDropPos.clone(), radius, duration, slowMul);
                } else if (effectId === 'repairBase') {
                    const amount = Math.max(0, Math.round(effect.value ?? 1));
                    this.allyHp = Math.min(this.allyMaxHp, this.allyHp + amount);
                    if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.allyMaxHp}`;
                } else if (effectId === 'hurtBase') {
                    const amount = Math.max(0, Math.round(effect.value ?? 1));
                    this.allyHp = Math.max(1, this.allyHp - amount);
                    if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.allyMaxHp}`;
                } else if (effectId === 'doubleOrNothing') {
                    // 双倍或全无：绑定下一波（选卡发生在波间，currentWave 为刚结束波，下一波为 +1）
                    this.gambleWaveIndex = this.currentWave + 1;
                    this.gambleWaveLeaks = 0;
                } else if (effectId === 'gamblerDice') {
                    // 赌徒骰子：随机一座塔 +1 星，另一座塔 -1 星（降至 1 星则销毁，腾出格子）
                    const p = effect.parameters ?? {};
                    const upCount = Math.max(1, Math.round(Number(p.upgradeCount ?? 1)));
                    const downCount = Math.max(1, Math.round(Number(p.downgradeCount ?? 1)));
                    if (this.towers.length === 0) {
                        console.warn('[gamblerDice] 场上无塔，效果空转');
                    } else {
                        const pool = this.towers.filter(t => t.node.isValid);
                        // 升星：随机座，并记录已升星的塔，避免降星命中同一座导致效果空转
                        const upgraded: typeof pool = [];
                        for (let i = 0; i < upCount && pool.length > 0; i++) {
                            const at = Math.floor(Math.random() * pool.length);
                            const t = pool[at];
                            pool.splice(at, 1);
                            t.star = (t.star ?? 1) + 1;
                            upgraded.push(t);
                            this.refreshTowerBadges(t.def.id);
                            console.log(`[gamblerDice] ${t.def.name} 升到 ${t.star} 星`);
                        }
                        // 降星：只从「未被升星的塔」中随机，保证收益与代价落在不同塔上
                        const downPool = this.towers.filter(t => t.node.isValid && upgraded.indexOf(t) < 0);
                        for (let i = 0; i < downCount && downPool.length > 0; i++) {
                            const at = Math.floor(Math.random() * downPool.length);
                            const t = downPool[at];
                            downPool.splice(at, 1);
                            const nextStar = (t.star ?? 1) - 1;
                            if (nextStar <= 0) {
                                console.log(`[gamblerDice] ${t.def.name} 降星至 0，已拆除`);
                                const idx = this.towers.indexOf(t);
                                if (idx >= 0) this.removeTowerNode(idx);
                            } else {
                                t.star = nextStar;
                                this.refreshTowerBadges(t.def.id);
                                console.log(`[gamblerDice] ${t.def.name} 降到 ${t.star} 星`);
                            }
                        }
                        if (downPool.length === 0) {
                            console.log('[gamblerDice] 无「未升星」的塔可降，降星部分空转');
                        }
                    }
                } else if (effectId === 'overdraftPower') {
                    // 透支供电：本波全体塔 +X% 伤害，波结束后所有塔 -1 星
                    const p = effect.parameters ?? {};
                    const bonus = Number(p.damageBonus ?? 0.8);
                    this.overdraftDamageBonus = bonus;
                    this.overdraftPending = true;
                    console.log(`[overdraftPower] 本波塔伤害 +${Math.round(bonus * 100)}%，波末全场 -1 星`);
                } else if (effectId === 'timeLoan') {
                    // 时间借贷：立即给金币，后续 N 波收益归零
                    const p = effect.parameters ?? {};
                    const gold = Math.max(0, Math.round(Number(p.gold ?? 150)));
                    const waves = Math.max(1, Math.round(Number(p.skipWaves ?? 2)));
                    this.gold += gold;
                    this.updateGoldLabel();
                    this.incomeFreezeWaves = waves;
                    console.log(`[timeLoan] 立即 +${gold} 金币，随后 ${waves} 波收益归零`);
                } else {
                    console.warn(`[effectContext] 未注册的 custom 效果: ${effectId}`);
                }
            },
        };
    }

    /** 隐藏所有 buff 卡片 */
    private hideBuffCards(): void {
        for (const card of this.buffCards) {
            card.active = false;
        }
    }

    /** 创建一张 buff 卡片 */
    private createBuffCard(pos: Vec3, index: number): Node {
        const node = new Node(`BuffCard_${index}`);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        // 卡高 96 → 104：原高度下描述区（y=-16 高54，顶边 11）会盖住名称区（y=14 高28，底边 0），
        // 重叠 11px 导致长描述（如"安全距离：所有塔范围+8%，稳住漏怪风险"）与标题文字叠在一起。
        // 加高后描述区扩到 63px（4 行），且与名称留 3px 间隙。
        // 三张卡竖排间距为 110，卡高 104 后仍留 6px 空隙，不会互相碰撞。
        // 点击命中判定按 UITransform 动态读取宽高，无需同步修改。
        transform.setContentSize(160, 104);
        node.setPosition(pos);

        const gfx = node.addComponent(Graphics);
        // 深紫色圆角背景
        gfx.fillColor = new Color(40, 30, 70, 230);
        gfx.roundRect(-80, -52, 160, 104, 10);
        gfx.fill();
        // 金色边框
        gfx.strokeColor = new Color(255, 200, 80, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-80, -52, 160, 104, 10);
        gfx.stroke();

        // 正式卡图位于标题左侧；无对应美术时节点自动隐藏。
        // 图标随卡加高上移（y 15→17），保持垂直居中于名称行
        VisualFactory.createCardIcon(node, 36, -57, 17);

        // buff 名称
        const nameNode = new Node('BuffName');
        nameNode.layer = Layers.Enum.UI_2D;
        nameNode.addComponent(UITransform);
        nameNode.setParent(node);
        // buff 名称：y 14→33（随卡加高上移），高度 28→26，与描述区间隔 3px 不再重叠
        nameNode.setPosition(0, 33, 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = '';
        nameLabel.fontSize = 16;
        nameLabel.lineHeight = 20;
        nameLabel.color = new Color(255, 220, 100, 255);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        nameLabel.enableWrapText = true;
        const nameTransform = nameNode.getComponent(UITransform)!;
        nameTransform.setContentSize(150, 26);

        // buff 描述
        const descNode = new Node('BuffDesc');
        descNode.layer = Layers.Enum.UI_2D;
        descNode.addComponent(UITransform);
        descNode.setParent(node);
        // 描述：y -16→-14.5，高度 54→63（4 行 = 行高 15 × 4 = 60，留 3px 余量）
        // 区间 [-46, 17]，顶边 17 低于名称底边 20，间隙 3px，彻底消除重叠
        descNode.setPosition(0, -14.5, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = '';
        descLabel.fontSize = 11;
        descLabel.lineHeight = 15;
        descLabel.color = new Color(200, 200, 220, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.TOP;
        descLabel.enableWrapText = true;
        // 与手牌描述同一修复：overflow 默认 NONE 会忽略宽度不断行，改 SHRINK 保证长描述不越界。
        descLabel.overflow = Label.Overflow.SHRINK;
        const descTransform = descNode.getComponent(UITransform)!;
        descTransform.setContentSize(144, 63);

        return node;
    }

    /** 同步游戏暂停按钮文字 */
    private updatePauseButton(): void {
        if (!this.pauseButtonLabel || !this.pauseButton) return;
        if (this.isUserPaused) {
            this.pauseButtonLabel.string = '▶ 继续';
        } else {
            this.pauseButtonLabel.string = '⏸ 暂停';
        }
    }

    private wavePatternName(): string {
        return this.wavePattern === 'packs' ? '成组来袭' : '标准纵队';
    }

    private selectWavePattern(): void {
        this.wavePattern = Math.random() < 0.5 ? 'steady' : 'packs';
        this.playtest.recordRunVariant(this.wavePattern, this.wavePatternName());
        console.log(`敌群变体：${this.wavePatternName()}`);
    }

    /**
     * 成组来袭只改变第3波后的出怪节奏，不改敌人数量、类型、血量和整波总时长。
     * 三只一组的短间隔会改变单体/范围流派的受力方式，同时保留现有数值基准。
     */
    private waveEntriesForRun(waveIndex: number): SpawnEntry[] {
        const entries = this.WAVES[waveIndex]?.entries ?? [];
        if (this.wavePattern !== 'packs' || waveIndex < 2 || entries.length < 4) {
            return entries.map(entry => ({ ...entry }));
        }
        const groupSize = 3;
        const innerGap = 0.18;
        const groupCount = Math.ceil(entries.length / groupSize);
        const originalEnd = entries[entries.length - 1].time;
        const lastWithinGroup = ((entries.length - 1) % groupSize) * innerGap;
        const groupGap = groupCount > 1 ? Math.max(0, originalEnd - lastWithinGroup) / (groupCount - 1) : 0;
        return entries.map((entry, index) => ({
            ...entry,
            time: Math.floor(index / groupSize) * groupGap + (index % groupSize) * innerGap,
        }));
    }

    /** 启动下一波 */
    private startNextWave(): void {
        this.stopCountdown();  // 确保倒计时圆环已隐藏
        if (this.currentWave >= this.WAVES.length) {
            this.victory();
            return;
        }

        this.activeWaveEntries = this.waveEntriesForRun(this.currentWave);
        this.currentWave++;
        // 咖啡因过载：判定本波是否含 BOSS（决定 BOSS 波伤害加成是否生效）
        this.waveHasBoss = this.activeWaveEntries.some(entry => entry.type === EnemyType.BOSS);
        // 双倍或全无：赌约波开始，提示本波赌注
        if (this.gambleWaveIndex === this.currentWave && this.statusLabel) {
            this.statusLabel.string = `双倍或全无生效：本波零漏怪 +150 金币，每漏 1 只额外 -1 命`;
        }
        this.spawnedInWave = 0;
        this.waveActive = true;
        this.waveElapsed = 0;
        this.spawnCursor = 0;
        this.midWaveRewardGiven = false;  // 本波中间奖励尚未发放

        // 当前波次总敌人数 = 时间线条目数
        this.waveTotalCount = this.activeWaveEntries.length;

        // 出怪改为在 update() 内用 waveElapsed + spawnCursor 推进，
        // 这样暂停（isUserPaused）能完全冻结出怪，不会堆敌人

        console.log(`Wave ${this.currentWave} 开始: ${this.waveTotalCount} 只`);
        if (this.waveLabel) {
            this.waveLabel.string = `Wave: ${this.currentWave}/${this.WAVES.length}`;
        }
        this.playtest.startWave(this.currentWave, this.buildPlaytestSnapshot());
    }

    private victory(): void {
        this.playtest.finalize('victory', this.currentWave, this.buildPlaytestSnapshot());
        this.waveActive = false;
        this.isGameOver = true;  // 复用 isGameOver 停止 update 逻辑
        this.stopCountdown();
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideGlobalBuffPanel();
        this.resetCardSystem();   // 胜利清除手牌，避免结算弹窗下残留
        this.hideTowerInfo();     // 0.3.1：隐藏塔信息面板，防止遮挡结算弹窗导出按钮

        const canvas = this.node;
        const panel = new Node('VictoryPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        const panelTransform = panel.addComponent(UITransform);
        panelTransform.setContentSize(400, 200);

        const gfx = panel.addComponent(Graphics);
        gfx.fillColor = new Color(40, 40, 50, 230);
        gfx.roundRect(-200, -100, 400, 200, 12);
        gfx.fill();
        gfx.strokeColor = new Color(80, 255, 80, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-200, -100, 400, 200, 12);
        gfx.stroke();

        // 标题
        const titleNode = new Node('Title');
        titleNode.layer = Layers.Enum.UI_2D;
        titleNode.setParent(panel);
        titleNode.addComponent(UITransform);
        titleNode.setPosition(0, 40, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '胜利！';
        titleLabel.fontSize = 36;
        titleLabel.color = new Color(80, 255, 80, 255);

        // 再来一局按钮
        const btnNode = new Node('RestartBtn');
        btnNode.layer = Layers.Enum.UI_2D;
        btnNode.setParent(panel);
        const btnTransform = btnNode.addComponent(UITransform);
        btnTransform.setContentSize(140, 44);
        btnTransform.setAnchorPoint(0.5, 0.5);
        btnNode.setPosition(-82, -40, 0);

        const btnGfx = btnNode.addComponent(Graphics);
        btnGfx.fillColor = new Color(80, 160, 80, 255);
        btnGfx.roundRect(-70, -22, 140, 44, 8);
        btnGfx.fill();

        const btnLabelNode = new Node('Label');
        btnLabelNode.layer = Layers.Enum.UI_2D;
        btnLabelNode.setParent(btnNode);
        btnLabelNode.addComponent(UITransform);
        const btnLabel = btnLabelNode.addComponent(Label);
        btnLabel.string = '再来一局';
        btnLabel.fontSize = 20;
        btnLabel.color = new Color(255, 255, 255, 255);

        btnNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            this.restart();
        });
        this.createPlaytestExportButton(panel, new Vec3(82, -40, 0));

        this.gameOverPanel = panel;

        if (this.statusLabel) this.statusLabel.string = '胜利！';
        if (this.waveLabel) this.waveLabel.string = 'Victory!';
        console.log('所有波次完成，胜利！');
    }

    /** 结算页导出：Web 下载 Markdown+JSON；微信小游戏复制 Markdown，并保存在本地存储。 */
    private createPlaytestExportButton(parent: Node, pos: Vec3): Node {
        const node = new Node('ExportPlaytestBtn');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(parent);
        node.setPosition(pos);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(140, 44);
        transform.setAnchorPoint(0.5, 0.5);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(65, 105, 145, 255);
        gfx.roundRect(-70, -22, 140, 44, 8);
        gfx.fill();

        const labelNode = new Node('Label');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setParent(node);
        labelNode.addComponent(UITransform).setContentSize(136, 40);
        const label = labelNode.addComponent(Label);
        label.string = '导出记录';
        label.fontSize = 18;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            const result = this.playtest.exportLatest();
            if (this.statusLabel) this.statusLabel.string = result.message;
            console.log(`[Playtest] ${result.message}`);
        });
        return node;
    }

    private updateGhostState(local: Vec3): void {
        let nearestSlot = -1;
        let nearestDist = Infinity;
        for (let i = 0; i < this.slotPositions.length; i++) {
            if (this.lockedSlots[i]) continue;
            // 移动模式下：跳过自己原来的槽位，但允许其他已占用的槽位（互换）
            if (this.dragMode === 'move' && i === this.moveFromSlot) continue;
            if (this.dragMode === 'place' && this.slotOccupied[i]) continue;

            const dist = Vec3.distance(local, this.slotPositions[i]);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestSlot = i;
            }
        }

        const cost = this.dragTowerDef?.cost ?? 0;
        const goldOk = this.dragMode === 'move' || this.gold >= cost;
        this.canPlace = nearestSlot >= 0 && nearestDist < 80 && goldOk;
        this.targetSlot = this.canPlace ? nearestSlot : -1;

        if (this.canPlace && nearestSlot >= 0) {
            this.ghostNode!.setPosition(this.slotPositions[nearestSlot]);
        }

        this.drawGhost(this.canPlace);
    }

    private drawGhost(canPlace: boolean): void {
        const gfx = this.ghostGfx!;
        gfx.clear();
        const def = this.dragTowerDef;
        const hasTowerArt = !!def && !!this.ghostIcon && VisualFactory.setTowerIcon(this.ghostIcon, def.id);
        if (!hasTowerArt) {
            const baseColor = def ? new Color(def.color.r, def.color.g, def.color.b, 120) : new Color(255, 255, 255, 120);
            gfx.fillColor = baseColor;
            gfx.circle(0, 0, 20);
            gfx.fill();
        }

        if (canPlace) {
            gfx.strokeColor = new Color(100, 255, 100, 255);
            gfx.lineWidth = 4;
            gfx.roundRect(-29, -29, 58, 58, 4);
            gfx.stroke();
        }
    }

    private eventToGameLocal(event: EventTouch): Vec3 {
        const uiPos = event.getUILocation();
        return this.gameTransform!.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
    }

    // ===== 临时调试：索敌日志（选择结果变化时才输出，避免逐帧刷屏；验收后置 false）=====
    private static readonly DEBUG_AIM = true;
    private lastAimPick = new Map<string, number>();   // "towerId@x,y" → 上次选中的敌人索引

    /**
     * 统一索敌：按 TowerDef.attack.aimMode 选择目标。
     *  - first（默认/未配置）：路径进度最靠前（pathIdx 大 → 距下一 waypoint 近 → 距塔近）
     *  - nearest：距塔最近（并列按 first）
     *  - highestHp：当前血量最高（并列按 first）
     *  - unaffected：尚未受本塔首个 statusEffect 影响的敌人（软偏好：
     *    有未受影响者在其内按 first；全部已受影响回退全体按 first）
     * mostEnemies/fixedDirection 等专用模式经此处仅作"范围内有敌"开火闸门，按 first 处理，
     * 实际目标由各自攻击执行器复选。
     * 返回范围内优先目标的索引，无目标返回 -1
     */
    private findTarget(def: TowerDef, towerPos: Vec3, range: number): number {
        const enemies = this.enemies;
        if (enemies.length === 0) return -1;

        // 先筛选范围内的敌人
        const inRange: { idx: number; enemy: EnemyRuntime }[] = [];
        for (let j = 0; j < enemies.length; j++) {
            if (!enemies[j].node.isValid) continue;
            const dist = Vec3.distance(towerPos, enemies[j].node.position);
            if (dist <= range) {
                inRange.push({ idx: j, enemy: enemies[j] });
            }
        }
        if (inRange.length === 0) return -1;

        const aimMode = def.attack?.aimMode ?? 'first';   // 未配置默认 first

        // unaffected：优先尚未受本塔首个 statusEffect 影响的敌人。
        // 杀虫喷雾为强优先：范围内只要有未中毒敌人，就先在未中毒池里按 first 索敌。
        // 其它控制塔仍保留软偏好，避免门口漏怪。
        // 漏怪风险兜底：若范围内"最靠前(离终点最近)"的敌人已被本塔影响（如已减速/中毒），
        // 不应为扩散 debuff 而忽略它——继续对它减速/中毒以拖延漏怪；
        // 仅当最前方仍 fresh 时，才用 fresh 池优先向后排未受影响者扩散。
        let pool = inRange;
        if (def.id === 'scissors') {
            const skewered = inRange.filter(c => !!c.enemy.buffs['skewer']);
            if (skewered.length > 0) pool = skewered;
        }
        if (aimMode === 'unaffected') {
            const fresh = inRange.filter(c => !this.isAffectedByTower(def, c.enemy));
            if (fresh.length > 0) {
                if (def.id === 'poison') {
                    pool = fresh;
                } else {
                    const frontIdx = this.findFirstTarget(towerPos, range);
                    const frontFresh = frontIdx >= 0
                        && inRange.some(c => c.idx === frontIdx)
                        && !this.isAffectedByTower(def, this.enemies[frontIdx]);
                    if (frontFresh) pool = fresh;
                }
            }
        }

        let best = pool[0].idx;
        if (aimMode === 'nearest') {
            let bestDist = Infinity;
            for (const c of pool) {
                const d = Vec3.distance(towerPos, c.enemy.node.position);
                if (d < bestDist - 1e-6 ||
                    (Math.abs(d - bestDist) <= 1e-6 && this.compareFirst(c.enemy, enemies[best], towerPos) < 0)) {
                    bestDist = d; best = c.idx;
                }
            }
        } else if (aimMode === 'highestHp') {
            let bestHp = -Infinity;
            for (const c of pool) {
                const hp = c.enemy.hp;
                if (hp > bestHp + 1e-6 ||
                    (Math.abs(hp - bestHp) <= 1e-6 && this.compareFirst(c.enemy, enemies[best], towerPos) < 0)) {
                    bestHp = hp; best = c.idx;
                }
            }
        } else {
            // first（默认）：路径进度最靠前
            for (const c of pool) {
                if (this.compareFirst(c.enemy, enemies[best], towerPos) < 0) best = c.idx;
            }
        }

        this.logAimDebug(def, towerPos, aimMode, pool, best);
        return best;
    }

    /** 'first' 比较器：a 比 b 更靠近终点返回负值。pathIdx 大者优先 → 同段距下一 waypoint 近者优先 → 距塔近者优先 */
    private compareFirst(a: EnemyRuntime, b: EnemyRuntime, towerPos: Vec3): number {
        if (a.pathIdx !== b.pathIdx) return b.pathIdx - a.pathIdx;
        const wa = this.waypointsOf(a)[Math.min(a.pathIdx, this.waypointsOf(a).length - 1)];
        const wb = this.waypointsOf(b)[Math.min(b.pathIdx, this.waypointsOf(b).length - 1)];
        const da = Vec3.distance(a.node.position, wa);
        const db = Vec3.distance(b.node.position, wb);
        if (Math.abs(da - db) > 1e-6) return da - db;
        return Vec3.distance(a.node.position, towerPos) - Vec3.distance(b.node.position, towerPos);
    }

    /** 敌人是否已受本塔首个 statusEffect 影响（aimMode 'unaffected' 用；无效果配置/未跟踪类型视为未受影响） */
    private isAffectedByTower(def: TowerDef, e: EnemyRuntime): boolean {
        const eff = def.attack?.statusEffects?.[0];
        if (!eff) return false;
        switch (eff.type) {
            case 'SLOW': return e.slowMultiplier < 1.0;
            case 'POISON': return !!e.buffs['poison'];
            case 'MARK': return e.vulnerableTimer > 0;
            case 'BURN': return !!e.buffs['burn'];
            case 'BLEED': return !!e.buffs['bleed'];
            case 'FREEZE': return !!e.buffs['freeze'];
            case 'STUN': return !!e.buffs['stun'];
            case 'CURSE': return !!e.buffs['curse'];
            default: return false;
        }
    }

    /** 临时调试输出：每个候选敌人的 pathIdx、到下一 waypoint 距离、最终选择 */
    private logAimDebug(def: TowerDef, towerPos: Vec3, aimMode: string,
                        pool: { idx: number; enemy: EnemyRuntime }[], best: number): void {
        if (!SceneInitializer.DEBUG_AIM) return;
        const key = `${def.id}@${towerPos.x.toFixed(0)},${towerPos.y.toFixed(0)}`;
        if (this.lastAimPick.get(key) === best) return;   // 选择未变化不重复输出
        this.lastAimPick.set(key, best);
        const desc = pool.map(c => {
            const e = c.enemy;
            const wp = this.waypointsOf(e)[Math.min(e.pathIdx, this.waypointsOf(e).length - 1)];
            const dNext = Vec3.distance(e.node.position, wp);
            return `#${c.idx}[pathIdx=${e.pathIdx} dNext=${dNext.toFixed(1)}]`;
        }).join(' ');
        console.log(`[AIM] ${def.id} mode=${aimMode} | ${desc} | => #${best}`);
    }

    private eventToCanvasLocal(event: EventTouch): Vec3 {
        const uiPos = event.getUILocation();
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
    }

    /** 开始移动塔（设置拖拽状态，保留原塔降低透明度） */
    private startMoveTower(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        this.refreshSlotVisuals();
        const tower = this.towers[towerIndex];
        this.resetThrust(tower);   // 移动前中止戳击动画，避免残留
        this.resetSpin(tower);     // 同步复位旋斩通道
        const towerPos = tower.node.position.clone();
        // 记录原槽位
        for (let s = 0; s < this.slotPositions.length; s++) {
            if (Vec3.distance(towerPos, this.slotPositions[s]) < 5) {
                this.moveFromSlot = s;
                break;
            }
        }
        this.dragTowerDef = tower.def;
        this.dragMode = 'move';
        this.isDragging = true;
        this.ghostNode!.active = true;
        this.drawGhost(false);
        this.ghostNode!.setPosition(towerPos);
        this.updateGhostState(towerPos);
        // 原塔保留，整塔降低透明度；正式 Sprite 和程序占位保持同一种拖动反馈。
        const opacity = tower.node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 105;
    }

    /** 长按计时器触发：直接开始移动塔 */
    private onLongPressMove(): void {
        if (this.isUserPaused) return;     // 全局暂停时禁止发起移动/合并
        if (this.isBuffSelecting) return;  // 选卡期间禁止发起移动
        const idx = this.pendingTower;
        this.pendingTower = -1;
        if (idx < 0) return;
        this.startMoveTower(idx);
    }

    /** 恢复被移动塔的正常外观 */
    private restoreTowerAppearance(towerNode: Node, def: TowerDef): void {
        const opacity = towerNode.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;
        const gfx = towerNode.getComponent(Graphics);
        if (!gfx) return;
        gfx.clear();
        drawTowerBase(gfx, def.color);
        gfx.strokeColor = def.rangeColor;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, def.attack.range);
        gfx.stroke();
    }


    /** 通用：销毁指定塔并释放其所在地基（无 AOE，供长按升级合并复用） */
    private removeTowerNode(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        const tower = this.towers[towerIndex];
        this.resetThrust(tower);   // 销毁前复位戳击，避免残留连戳定时器
        if (tower.corePowerLink && tower.corePowerLink.isValid) tower.corePowerLink.destroy();
        const tpos = tower.node.position.clone();
        for (let s = 0; s < this.slotPositions.length; s++) {
            if (Vec3.distance(tpos, this.slotPositions[s]) < 5) {
                this.slotOccupied[s] = false;
                if (this.slotNodes[s]) {
                    this.slotNodes[s].active = true;
                    this.redrawSlot(s, this.lockedSlots[s]);
                }
                break;
            }
        }
        tower.node.removeFromParent();
        tower.node.destroy();
        this.towers.splice(towerIndex, 1);
        this.towerTimers.splice(towerIndex, 1);
        this.refreshHandCardUsability();   // 移除塔后刷新手牌可用性（空格增加/同型塔减少）
    }

    /** BOSS 技能：每 BOSS_SKILL_INTERVAL 秒锁定一座塔，按规则给玩家应对机会 */
    private triggerBossSkill(): void {
        // 已有锁定中的塔，等其结算完再锁定下一座（同一次锁定未结算前不生成新目标）
        if (this.bossLockedTower) return;
        if (this.towers.length === 0) return;

        // 先构造候选数组，再随机选取（避免总是取数组第一座）
        // 1) 优先：真正可合并的一星塔（存在同类型另一座一星塔）
        const mergeable = this.findMergeableOneStar();
        if (mergeable) {
            this.lockTower(mergeable, 'merge');
            return;
        }
        // 2) 没有可合并目标时，从一星塔中随机选一座（倒计时结束停火 8 秒）
        const oneStars = this.towers.filter(t => t.star === 1);
        if (oneStars.length > 0) {
            const target = oneStars[Math.floor(Math.random() * oneStars.length)];
            this.lockTower(target, 'ceasefire');
            return;
        }
        // 3) 全是二星塔 → 从二星塔中随机选一座（倒计时结束降为一星并清词缀）
        const twoStars = this.towers.filter(t => t.star === 2);
        if (twoStars.length > 0) {
            const target = twoStars[Math.floor(Math.random() * twoStars.length)];
            this.lockTower(target, 'downgrade');
        }
    }

    /** 查找「可合并的一星塔」候选（存在同类型另一座一星塔），随机返回一座 */
    private findMergeableOneStar(): TowerRuntime | null {
        const counts: Record<string, number> = {};
        for (const t of this.towers) {
            if (t.star === 1) counts[t.def.id] = (counts[t.def.id] ?? 0) + 1;
        }
        const candidates = this.towers.filter(t => t.star === 1 && (counts[t.def.id] ?? 0) >= 2);
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /** 锁定一座塔并进入倒计时（玩家在倒计时内成功应对可解除） */
    private lockTower(tower: TowerRuntime, mode: 'merge' | 'ceasefire' | 'downgrade'): void {
        this.bossLockedTower = tower;
        this.bossLockMode = mode;
        this.bossLockTimer = this.BOSS_LOCK_DURATION;
        this.setTowerLockVisual(tower, true);
        this.refreshBossLockStatus();
        console.log(`BOSS 技能：锁定 ${tower.def.name}(${mode})`);
    }

    /** 生成 BOSS 锁定期间状态栏文字（含剩余秒数与应对提示） */
    private refreshBossLockStatus(): void {
        if (!this.bossLockedTower) return;
        const sec = Math.max(0, Math.ceil(this.bossLockTimer));
        const act = this.bossLockMode === 'merge'
            ? '合并同型一星塔可解除'
            : this.bossLockMode === 'ceasefire'
                ? '无同型可合并则停火 8 秒'
                : '将降为一星并失去词缀';
        if (this.statusLabel) {
            this.statusLabel.string = `BOSS 锁定防御塔！${sec} 秒后 ${act}`;
        }
    }

    /** 每帧推进 BOSS 锁定倒计时并结算 */
    private updateBossLock(dt: number): void {
        const t = this.bossLockedTower;
        if (!t) return;

        // 合并模式：锁定塔已被合并（移除或升为二星）→ 视为玩家成功应对
        if (this.bossLockMode === 'merge') {
            if (this.towers.indexOf(t) < 0 || t.star !== 1) {
                this.clearBossLock();
                return;
            }
        }

        this.bossLockTimer -= dt;
        // 每帧刷新状态栏与锁定环倒计时文字（清晰反馈 3 秒应对窗口）
        this.refreshBossLockStatus();
        this.updateLockTimerLabel();
        if (this.bossLockTimer > 0) return;

        // 倒计时结束 → 按模式结算惩罚
        switch (this.bossLockMode) {
            case 'merge':
                // 未合并 → 摧毁
                this.destroyLockedTower(t);
                break;
            case 'ceasefire':
                // 一星无法降级 → 停火 8 秒
                t.disabledTimer = this.BOSS_CEASEFIRE;
                break;
            case 'downgrade':
                // 二星降为一星并清除词缀
                t.star = 1;
                t.affix = null;
                this.setTowerBadge(t);
                break;
        }
        this.clearBossLock();
    }

    /** 清除 BOSS 锁定状态并恢复塔外观 */
    private clearBossLock(): void {
        const locked = this.bossLockedTower;
        if (locked) {
            // 防御：塔节点可能已被销毁（如 merge 模式未应对应被摧毁），
            // 仅当节点存在且仍有效时才尝试恢复锁定视觉，避免访问已销毁节点
            if (locked.node && locked.node.isValid) {
                this.setTowerLockVisual(locked, false);
            }
        }
        this.bossLockedTower = null;
        this.bossLockTimer = 0;
    }

    /** 摧毁被锁定的塔（合并模式未应对） */
    private destroyLockedTower(tower: TowerRuntime): void {
        const idx = this.towers.indexOf(tower);
        if (idx < 0) return;
        EffectManager.instance?.playExplosion(tower.node.position.clone(), 60);
        this.removeTowerNode(idx);
        if (this.statusLabel) this.statusLabel.string = 'BOSS 摧毁了一座未合并的防御塔！';
        console.log('BOSS 技能：摧毁未合并的防御塔');
    }

    /** 锁定视觉：在塔上加红色锁定环 + 倒计时文字（文字由 updateBossLock 每帧刷新） */
    private setTowerLockVisual(tower: TowerRuntime, locked: boolean): void {
        // 防御：塔节点可能已被销毁（如合并模式未应对应被摧毁），直接跳过
        if (!tower.node || !tower.node.isValid) return;
        let ring = tower.node.getChildByName('BossLock');
        if (locked) {
            if (!ring) {
                ring = new Node('BossLock');
                ring.layer = Layers.Enum.UI_2D;
                ring.setParent(tower.node);
                const g = ring.addComponent(Graphics);
                g.strokeColor = new Color(255, 60, 60, 255);
                g.lineWidth = 3;
                g.circle(0, 0, 26);
                g.stroke();
                // 倒计时文字（置于环上方）
                const lbl = new Node('LockTimer');
                lbl.layer = Layers.Enum.UI_2D;
                lbl.setParent(ring);
                lbl.setPosition(0, 34, 0);
                const lt = lbl.addComponent(Label);
                lt.string = '3';
                lt.fontSize = 28;
                lt.lineHeight = 28;
                lt.color = new Color(255, 80, 80, 255);
                lt.horizontalAlign = 1; // CC标签居中（1=Center）
                lt.verticalAlign = 1;
                const ut = lbl.getComponent(UITransform);
                if (ut) { ut.width = 40; ut.height = 32; }
            }
            ring.active = true;
        } else if (ring) {
            ring.active = false;
        }
    }

    /** 刷新锁定环上的倒计时文字 */
    private updateLockTimerLabel(): void {
        const t = this.bossLockedTower;
        if (!t) return;
        const ring = t.node.getChildByName('BossLock');
        if (!ring || !ring.active) return;
        const lbl = ring.getChildByName('LockTimer');
        if (lbl) lbl.getComponent(Label)!.string = `${Math.ceil(this.bossLockTimer)}`;
    }

    /** 溅射 AOE：在命中点爆炸，伤害周围敌人（伤害 = 主弹有效伤害 × splashDamage 倍率） */
    private triggerSplash(pos: Vec3, def: TowerDef, tower: TowerRuntime): void {
        const ts = this.towerStats;
        const radius = ts.splashRadius;
        const p = this.getTowerParams(tower);
        const splashDmg = p.damage * ts.splashDamage;
        let hitCount = 0;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            const d = Vec3.distance(pos, e.node.position);
            if (d <= radius) {
                hitCount++;
                this.damageEnemy(e, splashDmg, this.towerDamageSource(tower, 'splash', '溅射爆炸'));
                // 杀虫喷雾溅射：对范围内敌人施毒（受二星/词缀影响）
                if (def.id === 'poison') {
                    this.applyPoisonFromTower(tower, e, p);
                }
                // 死亡移除统一在 cleanupDeadEnemies() 处理
            }
        }
        this.playtest.recordMechanismTrigger('splash', '溅射爆炸', hitCount);
        // 爆炸光波动画
        EffectManager.instance?.playExplosion(pos, radius);
    }

    /** 统一清理：移除所有 hp<=0 的敌人。所有致死路径（子弹/溅射/buff）只减血，
     *  死亡移除集中在此，避免遍历 enemies 时嵌套 splice 导致的数组错乱与敌人永久残留 */
    private cleanupDeadEnemies(): void {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.hp > 0) continue;
            // 中毒死亡触发弹射毒流奖励：毒爆 + 传染词缀
            if (e.buffs['poison']) {
                this.triggerPoisonBurst(e);
                this.tryContagion(e);
            }
            this.playtest.recordKill(e.type);
            if (e.type === EnemyType.BOSS) this.playtest.bossDefeated();
            EffectManager.instance?.playDeath(e.node.position, e.node.getComponent(Graphics)?.fillColor ?? new Color(255, 255, 255, 255));
            e.node.removeFromParent();
            e.node.destroy();
            this.enemies.splice(i, 1);
            const frozen = this.incomeFreezeWaves > 0;
            if (frozen) {
                console.log('[timeLoan] 击杀收益被冻结');
            } else {
                this.gold += this.KILL_REWARD;
            }
            // 回收齿轮（通用改造）：按「击杀该敌人的塔自身」的改造层数返还，
            // 而非全场累加——全场累加会让多塔铺开时每次击杀返还 4/6/8 金，经济失控
            if (!frozen && e.lastHitTowerId) {
                const salvage = this.runBuild.modifierStacksOf(e.lastHitTowerId, 'salvage_gear');
                if (salvage > 0) {
                    this.gold += this.SALVAGE_GEAR_GOLD_PER_STACK * salvage;
                    console.log(`[salvage_gear] ${e.lastHitTowerId} ${salvage} 层回收，返还 ${this.SALVAGE_GEAR_GOLD_PER_STACK * salvage} 金币`);
                }
            }
            this.updateGoldLabel();
            console.log(`击杀！+${frozen ? 0 : this.KILL_REWARD} 金币，当前 ${this.gold}`);
        }
    }


    protected update(dt: number): void {
        if (this.isGameOver) return;

        // 用户暂停：完全冻结游戏逻辑（敌人/塔/子弹都不动），拖拽也在 TOUCH_START 中被阻止
        if (this.isUserPaused) return;

        // 塔信息面板自动隐藏倒计时
        if (this.towerInfoTimer > 0) {
            this.towerInfoTimer -= dt;
            if (this.towerInfoTimer <= 0) this.hideTowerInfo();
        }

        // === 倒计时（关卡开头 + 波次之间共用圆环）===
        if (this.countdownActive) {
            this.countdownValue -= dt;
            if (this.countdownValue <= 0) {
                this.countdownValue = 0;
                this.drawCountdownRing();
                const cb = this.countdownCallback;
                this.stopCountdown();
                cb?.();
            } else {
                this.drawCountdownRing();
            }
            return;  // 倒计时期间不推进波次/敌人/塔逻辑
        }

        // === 出怪推进（waveElapsed + spawnCursor，暂停时自动冻结）===
        if (this.waveActive) {
            if (this.activeWaveEntries.length > 0) {
                this.waveElapsed += dt;
                while (this.spawnCursor < this.activeWaveEntries.length) {
                    const entry = this.activeWaveEntries[this.spawnCursor];
                    if (this.waveElapsed < entry.time) break;
                    // 时间到了，生成这只敌人
                    if (!this.isGameOver) {
                        this.spawnEnemy(entry.hp, entry.type);
                        this.spawnedInWave++;
                    }
                    this.spawnCursor++;
                }
            }
        }

        // 注意：波次间不再倒计时——玩家选完 buff 即直接开下一波

        // === 敌人移动 ===
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.node.isValid) {
                this.enemies.splice(i, 1);
                continue;
            }

            const pos = e.node.position;
            this.playtest.observeEnemyProgress(this.enemyPathProgress(e));

            // 到达终点检测
            const endPos = this.PATH_END;
            if (Vec3.distance(pos, endPos) < 5) {
                if (e.type === EnemyType.BOSS) {
                    // BOSS 突破终点 → 直接判负（无视剩余友军 HP）
                    e.node.destroy();
                    this.enemies.splice(i, 1);
                    console.log('BOSS 突破终点，游戏结束！');
                    this.playtest.bossEscaped();
                    this.gameOver();
                } else {
                    // 到达终点 → 伤害友军
                    e.node.destroy();
                    this.enemies.splice(i, 1);
                    this.allyHp -= 1;
                    // 双倍或全无：赌约波内每漏 1 只额外 -1 命（逐只叠加，漏 2 只共 -4）
                    if (this.gambleWaveIndex === this.currentWave && this.waveActive) {
                        this.allyHp -= 1;
                        this.gambleWaveLeaks++;
                        console.log('双倍或全无：漏怪额外 -1 命');
                    }
                    this.playtest.recordLeak(String(e.type), this.allyHp);
                    console.log(`漏怪！友军 HP: ${this.allyHp}/${this.allyMaxHp}`);
                    if (this.livesLabel) {
                        this.livesLabel.string = `Base: ${this.allyHp}/${this.allyMaxHp}`;
                    }
                    if (this.allyHp <= 0) {
                        console.log('友军被摧毁，游戏结束！');
                        this.gameOver();
                    }
                }
            } else {
                // 沿 waypoints 逐段移动（pathIdx 跟踪目标；按本帧步长判定到达，避免掉帧时卡在折点）
                const eDef = this.getEnemyDef(e.type);
                const speedMult = eDef?.speedMultiplier ?? 1;
                if (e.type === EnemyType.BOSS && !e.bossEnraged && e.hp <= e.maxHp * 0.5) {
                    e.bossEnraged = true;
                    EffectManager.instance?.playExplosion(e.node.position.clone(), 52);
                    console.log('BOSS 半血狂暴：移动速度提升35%');
                }
                const phaseSpeedMultiplier = e.bossEnraged ? 1.35 : 1;
                const speed = this.ENEMY_SPEED * speedMult * phaseSpeedMultiplier * e.slowMultiplier;
                const wps = this.waypointsOf(e);
                if (e.pathIdx >= wps.length) e.pathIdx = wps.length - 1;

                const target = wps[e.pathIdx];
                const toX = target.x - pos.x;
                const toY = target.y - pos.y;
                const distToTarget = Math.hypot(toX, toY);
                const step = speed * dt;
                // 本帧步长 >= 到当前 waypoint 的距离（或已极近）→ 吸附到该点并前往下一个。
                // 用 step 作为到达阈值：掉帧时单帧移动很大也不会在折点反复横跳卡死。
                if (distToTarget <= step || distToTarget <= 1) {
                    e.node.setPosition(target.x, target.y, 0);
                    if (e.pathIdx < wps.length - 1) e.pathIdx++;
                } else {
                    e.node.setPosition(
                        pos.x + (toX / distToTarget) * step,
                        pos.y + (toY / distToTarget) * step,
                        0
                    );
                }
            }
        }

        // === 状态栏（按优先级写入，低优先级不覆盖高优先级）===
        // 优先级：BOSS锁定 > 波后三选一 > 手牌阶段 > 用户暂停 > 波次战斗 > 普通待机
        if (this.statusLabel) {
            if (this.bossLockedTower) {
                // BOSS 锁定期间每帧由 updateBossLock 刷新状态栏，这里在 lockTower 当帧也写一次
                this.refreshBossLockStatus();
            } else if (this.isWavePaused && !this.buffSelected && this.currentWave < this.WAVES.length) {
                this.statusLabel.string = `选择强化 - 三选一  塔: ${this.towers.length}`;
            } else if (this.cardMode) {
                // 手牌阶段：固定显示，避免每帧被战斗分支覆盖
                this.statusLabel.string = `选牌中：已用 ${this.usedCardCount}/${SceneInitializer.MAX_CARD_USES_PER_DRAW}，剩余${this.handCards.length}张｜点击底部按钮可结束`;
            } else if (this.isWavePaused) {
                this.statusLabel.string = `布防阶段 - 可建塔/移塔  塔: ${this.towers.length}`;
            } else if (this.isUserPaused) {
                this.statusLabel.string = `游戏已暂停  塔: ${this.towers.length}`;
            } else if (this.waveActive) {
                const remaining = this.waveTotalCount - this.spawnedInWave + this.enemies.length;
                this.statusLabel.string = `剩余敌人: ${remaining}  塔: ${this.towers.length}`;
            } else {
                this.statusLabel.string = `塔: ${this.towers.length}`;
            }
        }

        // === 充电宝光环（每帧重算攻速倍率）===
        this.updateAuras();

        // === 塔攻击 ===
        for (let i = 0; i < this.towers.length; i++) {
            if (this.enemies.length === 0) continue;
            const tower = this.towers[i];
            // BOSS 停火惩罚：disabledTimer > 0 时不攻击，仅倒计时
            if (tower.disabledTimer > 0) {
                tower.disabledTimer = Math.max(0, tower.disabledTimer - dt);
                continue;
            }
            const def = tower.def;
            // 辅助塔（充电宝）：不攻击，仅提供光环（光环在 updateAuras 每帧计算）
            if (def.support) continue;
            const p = this.getTowerParams(tower);

            // 统一索敌：按 attack.aimMode（默认 first = 兵线最靠近终点，见 findTarget）
            const targetIdx = this.findTarget(def, tower.node.position, p.range);
            if (targetIdx < 0) continue;

            this.towerTimers[i] += dt;
            if (this.towerTimers[i] >= p.interval) {
                this.towerTimers[i] = 0;
                tower.attackCount += 1;
                this.playtest.recordTowerAttack(tower.def.id, tower.def.name);

                // 只对主目标发射 1 颗子弹；分裂在主弹命中后触发（见子弹更新段）
                const target = this.enemies[targetIdx];
                if (!target || !target.node.isValid) continue;

                if (def.attack.attackType === 'thrust') {
                    // 贴身戳击（奶茶吸管）：吸管伸出戳一下即收回，不生成子弹
                    this.thrustAttack(tower);
                } else if (def.attack.attackType === 'spin') {
                    // 旋斩（打蛋器）：自身圆周范围持续伤害
                    this.spinAttack(tower);
                } else if (def.attack.attackType === 'smash') {
                    // 砸击（锅铲）：敌群最密点范围爆发
                    this.smashAttack(tower);
                } else if (def.attack.attackType === 'pierce') {
                    // 贯穿（筷子）：直线穿透多目标
                    this.pierceAttack(tower);
                } else if (def.attack.attackType === 'spray') {
                    // 减速塔：按 attack.statusEffects 施减速/易伤（基础值来自 statusEffects）
                    this.applyTowerEffect(tower, target, p);
                    this.fireBullet(tower.node.position, target.node.position, target.node, def, tower, 0);
                } else if (def.sweep) {
                    // 横扫（牙刷）：对范围内所有敌人造成伤害
                    this.sweepAttack(tower, p);
                } else if (def.attackKind === 'bullet') {
                    const bounce = def.bounce ?? 0;
                    this.fireBullet(tower.node.position, target.node.position, target.node, def, tower, bounce);
                    // 连发词缀：每 4 次攻击追加一发
                    if (p.rapid && tower.attackCount % 4 === 0) {
                        this.fireBullet(tower.node.position, target.node.position, target.node, def, tower, bounce);
                    }
                } else {
                    // 瞬间效果型（减速塔）：逐塔施加减速/易伤
                    this.applyTowerEffect(tower, target, p);
                    this.fireBullet(tower.node.position, target.node.position, target.node, def, tower, 0);
                }
            }
        }

        // === thrust 戳击动画推进 ===
        this.updateThrusts(dt);

        // === spin 旋斩通道推进 ===
        this.updateSpins(dt);

        // === 筷子弹体飞行与穿透命中 ===
        this.updatePierceShots(dt);

        // === 敌人减速 / 易伤计时 ===
        for (const e of this.enemies) {
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                if (e.slowTimer <= 0) {
                    e.slowMultiplier = 1;
                }
            }
            if (e.vulnerableTimer > 0) {
                e.vulnerableTimer -= dt;
                if (e.vulnerableTimer <= 0) {
                    e.vulnerable = 1;  // 易伤限时结束，恢复默认
                }
            }
        }

        // === 通用 buff 处理（毒 buff 等：每秒掉血 + 倒计时）===
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            for (const key in e.buffs) {
                if (key === 'skewer') continue;
                const buff = e.buffs[key];
                buff.timer -= dt;
                if (buff.dps > 0) {
                    this.damageEnemy(e, buff.dps * dt, buff.damageSource ?? {
                        sourceType: 'status', sourceId: key, sourceName: key,
                        mechanismId: `${key}_dot`, mechanismName: `${key}持续伤害`,
                    }, dt);
                }
                if (buff.timer <= 0) {
                    delete e.buffs[key];
                }
            }
            // buff 掉血致死：仅减血，死亡移除统一在 cleanupDeadEnemies() 处理
        }

        // === 串联链计时与彩线表现（自然消失不造成伤害）===
        this.updateSkewerChains(dt);

        // === 敌人特殊行为（治疗者光环等）——遍历注册表的 onUpdate ===
        for (const e of this.enemies) {
            const def = this.getEnemyDef(e.type);
            if (def?.onUpdate) {
                def.onUpdate(e, dt, this.enemies);
            }
        }

        // === BOSS 锁定技能倒计时结算 ===
        this.updateBossLock(dt);

        // === 地面减速区（胶带）：范围内敌人减速，到期清理节点 ===
        for (let i = this.groundZones.length - 1; i >= 0; i--) {
            const z = this.groundZones[i];
            z.timer -= dt;
            for (const e of this.enemies) {
                if (!e.node.isValid) continue;
                if (Vec3.distance(z.node.position, e.node.position) <= z.radius) {
                    e.slowMultiplier = Math.min(e.slowMultiplier, z.slowMultiplier);
                    e.slowTimer = Math.max(e.slowTimer, 0.2);  // 持续刷新，离开后自然恢复
                }
            }
            if (z.timer <= 0) {
                z.node.destroy();
                this.groundZones.splice(i, 1);
            }
        }

        // === 子弹更新 ===
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.node.isValid) {
                this.bullets.splice(i, 1);
                continue;
            }

            const pos = b.node.position;
            b.node.setPosition(pos.x + b.vx * dt, pos.y + b.vy * dt, 0);

            // === 主弹：命中固定目标 ===
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (!e.node.isValid || !b.target.isValid) continue;
                if (b.target !== e.node) continue;  // 只命中目标

                const d = Vec3.distance(b.node.position, e.node.position);
                if (d < 16) {
                    // 逐塔解析有效属性（含二星强化 + 词缀）
                    const p = this.getTowerParams(b.tower);
                    const bounceMul = b.bounceStep === 1 ? 0.6 : (b.bounceStep ?? 0) >= 2 ? 0.4 : 1;
                    let dmg = p.damage * (b.dmgMul ?? 1) * bounceMul;
                    // 处决词缀：对低血敌人增伤
                    if (p.executeBonus > 0 && e.hp / e.maxHp < 0.3) {
                        dmg *= (1 + p.executeBonus);
                    }
                    // Roguelike 出血 buff：攻击出血敌人有概率暴击
                    const ts = this.towerStats;
                    let isCrit = false;
                    if (ts.bleedLevel > 0 && e.buffs['bleed'] && Math.random() < ts.critChance) {
                        dmg *= ts.critMultiplier;
                        isCrit = true;
                    }
                    if (this.rollTowerCrit(p)) {
                        dmg = this.critDamage(dmg, p);
                        isCrit = true;
                    }
                    const bulletMechanism = b.noSplit || (b.dmgMul ?? 1) < 1
                        ? { id: 'split_projectile', name: '分裂弹道' }
                        : b.hasBounced
                            ? { id: 'bounce_projectile', name: '弹射命中' }
                            : { id: 'projectile', name: '直接弹道' };
                    this.damageEnemy(e, dmg, this.towerDamageSource(
                        b.tower,
                        bulletMechanism.id,
                        bulletMechanism.name,
                        { isCrit },
                    ));
                    // 命中特效
                    EffectManager.instance?.playHit(e.node);
                    EffectManager.instance?.playDamageNumber(e.node.position, dmg, isCrit);
                    // Roguelike 出血 buff：概率施加出血状态（2秒，dps=0 纯标记）
                    if (ts.bleedLevel > 0 && Math.random() < ts.bleedChance) {
                        e.buffs['bleed'] = { timer: ts.bleedDuration, dps: 0 };
                    }
                    // 杀虫喷雾：命中施加毒 buff（受二星 + 词缀影响）
                    if (b.def.id === 'poison') {
                        this.applyPoisonFromTower(b.tower, e, p);
                    }
                    // 弹射毒流改造：橡皮筋的命中、弹射命中、分裂弹命中都会施加中毒
                    if ((p.poisonOnHitDps ?? 0) > 0) {
                        this.applyPoisonToEnemy(
                            e,
                            p.poisonOnHitDps!,
                            p.poisonOnHitDuration ?? 4,
                            this.towerDamageSource(b.tower, 'venom_on_hit', '附毒持续伤害'),
                        );
                    }
                    // Roguelike 减速 buff：所有子弹命中附带减速
                    if (this.towerStats.slowLevel > 0) {
                        const slowMult = Math.max(0.3, 0.85 - this.towerStats.slowLevel * 0.05);
                        const slowTime = 1.5 + this.towerStats.slowLevel * 0.5;
                        // 只取更强的减速
                        if (e.slowMultiplier > slowMult) {
                            e.slowMultiplier = slowMult;
                            e.slowTimer = slowTime;
                        } else if (e.slowTimer < slowTime) {
                            e.slowTimer = slowTime;
                        }
                    }

                    // Roguelike 溅射 buff：主弹命中后在命中点爆炸 AOE
                    if (this.towerStats.splashLevel > 0) {
                        this.triggerSplash(b.node.position, b.def, b.tower);
                    }

                    // 治疗抑制卡：命中治疗兵后，使其进入治疗沉默（HEAL_SILENCE 秒内无法治疗）
                    if (this.towerStats.healSuppression > 0 && e.type === EnemyType.HEALER) {
                        e.healCd = Math.max(e.healCd, this.HEAL_SILENCE);
                    }

                    // 橡皮筋：命中后弹射到附近下一个敌人（不销毁，继续飞行）
                    if (b.bounce > 0) {
                        const next = this.findChainTarget(e.node, b.node.position, 130);
                        if (next >= 0) {
                            const nn = this.enemies[next].node.position;
                            const dx = nn.x - b.node.position.x;
                            const dy = nn.y - b.node.position.y;
                            const dlen = Math.hypot(dx, dy) || 1;
                            b.vx = (dx / dlen) * this.BULLET_SPEED;
                            b.vy = (dy / dlen) * this.BULLET_SPEED;
                            b.target = this.enemies[next].node;
                            b.bounce -= 1;
                            b.hasBounced = true;
                            b.bounceStep = (b.bounceStep ?? 0) + 1;
                            this.playtest.recordMechanismTrigger('bounce_projectile', '弹射命中', 1);
                            hit = true;
                            continue;   // 继续飞行，下一帧命中新目标
                        }
                    }

                    // 分裂弹道（改造卡 'split'）：终结命中（弹射耗尽/无弹射）时分裂，
                    // 分裂弹带 noSplit 标记不再二次分裂
                    if (!b.noSplit && this.runBuild.hasTowerModifier(b.tower.def.id, 'split')) {
                        this.triggerSplit(b.node.position, e.node, b.def, b.tower);
                    }

                    b.node.destroy();
                    this.bullets.splice(i, 1);
                    hit = true;

                    // 主目标死亡由 cleanupDeadEnemies() 统一移除
                    break;
                }
            }

            if (hit) continue;

            if (b.target && !b.target.isValid) {
                b.node.destroy();
                this.bullets.splice(i, 1);
                continue;
            }

            if (Vec3.distance(b.node.position, Vec3.ZERO) > 800) {
                b.node.destroy();
                this.bullets.splice(i, 1);
            }
        }

        // === 敌人死亡统一清理：所有致死路径只减血，死亡移除集中在此 ===
        this.cleanupDeadEnemies();

        // === 波次完成检测（在 cleanup 之后，确保本帧所有死亡已移除）===
        if (this.waveActive) {
            // 波次进行到一半（已生成过半）时一次性发放 5 金币
            if (!this.midWaveRewardGiven && this.waveTotalCount > 0 &&
                this.spawnedInWave >= Math.ceil(this.waveTotalCount / 2)) {
                this.midWaveRewardGiven = true;
                if (this.incomeFreezeWaves > 0) {
                    console.log('[timeLoan] 波中收益被冻结');
                } else {
                    this.gold += 5;
                    this.updateGoldLabel();
                    console.log(`波次中间奖励 +5 金币，当前 ${this.gold}`);
                }
            }
            // 全部生成且全部死亡 → 自动暂停，等用户选 buff + 点"开始下一波"
            if (this.spawnedInWave >= this.waveTotalCount && this.enemies.length === 0) {
                this.waveActive = false;
                const waveBonus = this.WAVE_BONUSES[this.currentWave - 1] || 0;
                if (waveBonus > 0) {
                    if (this.incomeFreezeWaves > 0) {
                        console.log('[timeLoan] 波末收益被冻结');
                    } else {
                        this.gold += waveBonus;
                        this.updateGoldLabel();
                        console.log(`波次奖励 +${waveBonus} 金币，当前 ${this.gold}`);
                    }
                }
                // 双倍或全无：赌约波结算（零漏怪 +150 金币，否则赌注失败）
                if (this.gambleWaveIndex === this.currentWave) {
                    if (this.gambleWaveLeaks === 0) {
                        this.gold += 150;
                        this.updateGoldLabel();
                        console.log('双倍或全无达成：本波零漏怪，+150 金币');
                        if (this.statusLabel) this.statusLabel.string = '双倍或全无达成：+150 金币！';
                    } else {
                        console.log(`双倍或全无失败：本波漏怪 ${this.gambleWaveLeaks} 只`);
                    }
                    this.gambleWaveIndex = null;
                    this.gambleWaveLeaks = 0;
                }
                // 透支供电反噬：波末全场塔 -1 星（保底 1 星，永不拆除），
                // 并追加「下一波全体塔伤害 -30%」的可逆衰减，清空本波加成
                if (this.overdraftPending) {
                    this.overdraftPending = false;
                    let demoted = 0;
                    for (let i = this.towers.length - 1; i >= 0; i--) {
                        const t = this.towers[i];
                        if (!t.node.isValid) continue;
                        const curStar = t.star ?? 1;
                        const nextStar = Math.max(1, curStar - 1);
                        if (nextStar !== curStar) {
                            t.star = nextStar;
                            demoted++;
                            this.refreshTowerBadges(t.def.id);
                        }
                    }
                    this.overdraftDamageBonus = 0;
                    this.overdraftFatigueWaves = this.OVERDRAFT_FATIGUE_WAVES;
                    // 标记本波刚设置衰减，避免下方递减块在同一波末把它减回 0（衰减应作用于下一波）
                    this.overdraftFatigueSetThisWave = true;
                    console.log(`[overdraftPower] 波末结算：${demoted} 座塔降星（保底 1 星，未拆除），随后 ${this.overdraftFatigueWaves} 波塔伤害 -${Math.round(this.OVERDRAFT_FATIGUE_PENALTY * 100)}%`);
                    if (this.statusLabel) this.statusLabel.string = `透支反噬：全场降星，后续 ${this.overdraftFatigueWaves} 波伤害 -${Math.round(this.OVERDRAFT_FATIGUE_PENALTY * 100)}%`;
                }
                // 时间借贷：收益冻结波数递减（本波的击杀/波末收益已按下方的冻结判定跳过）
                if (this.incomeFreezeWaves > 0) {
                    this.incomeFreezeWaves--;
                    console.log(`[timeLoan] 收益冻结剩余 ${this.incomeFreezeWaves} 波`);
                }
                // 透支供电衰减期递减：仅消耗「上一波及更早」已生效的波数，
                // 本波刚设置的衰减跳过递减，确保衰减真正作用于接下来的完整波次
                if (this.overdraftFatigueWaves > 0) {
                    if (this.overdraftFatigueSetThisWave) {
                        this.overdraftFatigueSetThisWave = false;
                        console.log(`[overdraftPower] 衰减期开始，剩余 ${this.overdraftFatigueWaves} 波`);
                    } else {
                        this.overdraftFatigueWaves--;
                        if (this.overdraftFatigueWaves === 0) {
                            console.log('[overdraftPower] 衰减期结束，塔伤害恢复正常');
                        }
                    }
                }
                this.refreshPlaytestBuildMilestones();
                this.playtest.endWave(this.buildPlaytestSnapshot());
                // 还有下一波才显示 buff 选择 + 暂停状态，否则直接胜利
                if (this.currentWave < this.WAVES.length) {
                    this.isWavePaused = true;
                    this.updatePauseButton();
                    this.showBuffSelection();
                    console.log(`Wave ${this.currentWave} 完成（${this.waveTotalCount} 只全部消灭），已自动暂停`);
                } else {
                    this.victory();
                }
            }
        }
    }

    /** 生成敌人（从注册表取属性和外观） */
    private spawnEnemy(hp: number, type: EnemyType = EnemyType.NORMAL): void {
        if (!this.battleRoot) return;

        const def = this.getEnemyDef(type);
        if (!def) {
            console.warn(`未注册的敌人类型: ${type}`);
            return;
        }

        // 实际血量 = 配置 hp × 注册表 hpMultiplier
        const actualHp = Math.floor(hp * def.hpMultiplier);

        // 双路分叉：交替分配左右两路，保证两路压力均衡（不随机，避免某路运气性过载）
        const branch = this.spawnBranchToggle;
        this.spawnBranchToggle = (this.spawnBranchToggle + 1) % BRANCH_COUNT;
        const waypoints = PATH_BRANCH_WAYPOINTS[branch];

        const enemy = new Node(def.name);
        enemy.layer = Layers.Enum.UI_2D;
        enemy.setParent(this.battleRoot);
        enemy.setPosition(waypoints[0]);

        const transform = enemy.addComponent(UITransform);
        transform.setContentSize(def.radius * 2, def.radius * 2);

        const gfx = enemy.addComponent(Graphics);

        // 主体圆
        gfx.fillColor = def.color;
        gfx.circle(0, 0, def.radius);
        gfx.fill();

        // 额外外观（如治疗光环）
        def.drawExtra?.(gfx, def);

        const runtime: EnemyRuntime = {
            node: enemy, hp: actualHp, maxHp: actualHp,
            bossHpRing: null, bossHpRingGfx: null,
            slowTimer: 0, slowMultiplier: 1,
            type, healTimer: 0, healCd: 0, extraTimer: 0,
            pathIdx: 1,  // 从起点 waypoint[0] 出发，目标是 waypoint[1]
            branch,     // 双路分叉：本敌人所走的分支
            bossEnraged: false,
            buffs: {},
            vulnerable: 1,   // 易伤倍率（默认 1，易伤词缀目标承受额外伤害）
            vulnerableTimer: 0,  // 易伤剩余时间（归零恢复 1）
        };
        if (type === EnemyType.BOSS) this.attachBossHpRing(runtime, def);
        this.enemies.push(runtime);
        if (type === EnemyType.BOSS) this.playtest.bossSpawned(actualHp);
    }

    /** 将敌人在折线路径上的位置换算为 0..1 进度，供试玩统计最远推进使用。 */
    private enemyPathProgress(enemy: EnemyRuntime): number {
        let total = 0;
        const wps = this.waypointsOf(enemy);
        for (let i = 1; i < wps.length; i++) total += Vec3.distance(wps[i - 1], wps[i]);
        if (total <= 0) return 0;
        const targetIndex = Math.max(1, Math.min(enemy.pathIdx, wps.length - 1));
        let completed = 0;
        for (let i = 1; i < targetIndex; i++) completed += Vec3.distance(wps[i - 1], wps[i]);
        const segmentStart = wps[targetIndex - 1];
        const segmentLength = Vec3.distance(segmentStart, wps[targetIndex]);
        completed += Math.min(segmentLength, Vec3.distance(segmentStart, enemy.node.position));
        return completed / total;
    }

    /** BOSS 外圈血量环：独立子节点，后续可替换为美术素材实现。 */
    private attachBossHpRing(enemy: EnemyRuntime, def: EnemyDef): void {
        const ring = new Node('BossHpRing');
        ring.layer = Layers.Enum.UI_2D;
        ring.setParent(enemy.node);
        ring.setPosition(0, 0, 0);
        const t = ring.addComponent(UITransform);
        const size = (def.radius + 24) * 2;
        t.setContentSize(size, size);
        t.setAnchorPoint(0.5, 0.5);
        const gfx = ring.addComponent(Graphics);
        enemy.bossHpRing = ring;
        enemy.bossHpRingGfx = gfx;
        this.updateBossHpRing(enemy);
    }

    private updateBossHpRing(enemy: EnemyRuntime): void {
        const g = enemy.bossHpRingGfx;
        if (!g || !enemy.bossHpRing?.isValid) return;
        g.clear();
        const def = this.getEnemyDef(enemy.type);
        const radius = (def?.radius ?? 28) + 18;
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));

        g.strokeColor = new Color(70, 20, 20, 150);
        g.lineWidth = 6;
        g.circle(0, 0, radius);
        g.stroke();

        g.strokeColor = new Color(255, 60, 60, 245);
        g.lineWidth = 6;
        if (ratio >= 0.999) {
            g.circle(0, 0, radius);
        } else if (ratio > 0) {
            const start = -Math.PI / 2;
            const end = start + Math.PI * 2 * ratio;
            g.arc(0, 0, radius, start, end, false);
        }
        g.stroke();
    }

    /** 发射子弹（dmgMul<1 的分裂子弹视觉更小；noSplit 标记的分裂弹命中不再触发分裂） */
    private fireBullet(from: Vec3, to: Vec3, target: Node, def: TowerDef, tower: TowerRuntime, bounce: number = 0,
                       dmgMul: number = 1, noSplit: boolean = false): void {
        if (!this.battleRoot) return;

        const bullet = new Node('Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(this.battleRoot);
        bullet.setPosition(from);

        const transform = bullet.addComponent(UITransform);
        transform.setContentSize(12, 12);

        const gfx = bullet.addComponent(Graphics);
        gfx.fillColor = new Color(def.color.r, def.color.g, def.color.b, 255);
        gfx.circle(0, 0, dmgMul < 1 ? 4 : 6);
        gfx.fill();

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.bullets.push({
            node: bullet,
            vx: (dx / dist) * this.BULLET_SPEED,
            vy: (dy / dist) * this.BULLET_SPEED,
            target,
            def,
            tower,
            bounce,
            dmgMul,
            noSplit,
        });
    }

    /** 分裂弹道（改造卡 'split'）：主弹终结命中时，向命中点附近最近的 2 个其他敌人各分裂 1 颗 50% 伤害子弹 */
    private triggerSplit(pos: Vec3, exclude: Node, def: TowerDef, tower: TowerRuntime): void {
        const cands: { e: EnemyRuntime; d: number }[] = [];
        for (const e of this.enemies) {
            if (!e.node.isValid || e.node === exclude) continue;
            const d = Vec3.distance(pos, e.node.position);
            if (d <= SceneInitializer.SPLIT_RADIUS) cands.push({ e, d });
        }
        cands.sort((a, b) => a.d - b.d);
        const splitCount = Math.min(SceneInitializer.SPLIT_COUNT, cands.length);
        if (splitCount > 0) this.playtest.recordMechanismTrigger('split_projectile', '分裂弹道', splitCount);
        for (let k = 0; k < splitCount; k++) {
            const t = cands[k].e;
            this.fireBullet(pos.clone(), t.node.position.clone(), t.node, def, tower,
                0, SceneInitializer.SPLIT_DMG_MUL, true);
        }
    }

    // ============================================================
    //  家庭小物件机制：光环 / 横扫 / 弹射 / 地面减速区
    // ============================================================

    /** 重算所有塔的充电宝光环攻速倍率（每帧调用，天然支持增删，不污染基础属性） */
    private updateAuras(): void {
        for (const t of this.towers) {
            t.auraSpeedMul = 1;
            t.corePowered = false;
            t.corePowerCritChance = 0;
            t.corePowerCritMultiplier = 1;
            if (t.corePowerRing) t.corePowerRing.active = false;
            if (t.corePowerLink) t.corePowerLink.active = false;
        }
        for (const bank of this.towers) {
            if (!bank.def.support || !bank.def.auraSpeedBonus) continue;
            const bonus = bank.def.auraSpeedBonus;
            for (const t of this.towers) {
                if (t === bank) continue;
                if (Vec3.distance(bank.node.position, t.node.position) <= bank.def.attack.range) {
                    t.auraSpeedMul *= (1 + bonus);
                }
            }
            this.applyCorePowerAura(bank);
        }
        // 光环结算完成后再切一次贴图，避免同一帧普通/供电状态来回赋值。
        for (const t of this.towers) {
            const bankIsPowering = t.def.id === 'powerbank' && !!t.corePowerLink?.active;
            VisualFactory.setTowerPoweredVisual(t.node, t.corePowered || bankIsPowering);
        }
    }

    /** 核心供电：每个充电宝额外强化自己范围内所有奶茶吸管。 */
    private applyCorePowerAura(bank: TowerRuntime): void {
        const mod = this.runBuild.towerModifiersOf('powerbank').find(m => m.id === 'core_power');
        if (!mod) return;

        const targets: TowerRuntime[] = [];
        for (const t of this.towers) {
            if (t === bank || t.def.id !== 'bubble_tea_straw') continue;
            if (Vec3.distance(bank.node.position, t.node.position) > bank.def.attack.range) continue;
            targets.push(t);
        }
        if (targets.length === 0) return;

        const ch = mod.changes;
        for (const target of targets) {
            target.corePowered = true;
            target.auraSpeedMul *= (1 + (ch.corePowerSpeedBonus ?? 0));
            target.corePowerCritChance = Math.max(target.corePowerCritChance, ch.corePowerCritChance ?? 0);
            target.corePowerCritMultiplier = Math.max(target.corePowerCritMultiplier, ch.corePowerCritMultiplier ?? 1);
        }
        this.showCorePowerVisual(bank, targets);
    }

    /** 核心供电视觉反馈：目标吸管电流圈 + 充电宝到吸管的闪电线。 */
    private showCorePowerVisual(bank: TowerRuntime, targets: TowerRuntime[]): void {
        for (const target of targets) {
            if (!target.corePowerRing || !target.corePowerRing.isValid) {
                target.corePowerRing = VisualFactory.createCorePowerRing(target.node);
            }
            target.corePowerRing.active = true;
            target.corePowerRing.angle += 5;
        }

        if (!bank.corePowerLink || !bank.corePowerLink.isValid || !bank.corePowerLinkGfx) {
            if (!this.battleRoot) return;
            const link = VisualFactory.createCorePowerLink(this.battleRoot);
            bank.corePowerLink = link.node;
            bank.corePowerLinkGfx = link.gfx;
        }
        bank.corePowerLink.active = true;
        bank.corePowerLinkPhase += 0.35;
        this.drawCorePowerLinks(bank.corePowerLinkGfx, bank.node.position, targets.map(t => t.node.position), bank.corePowerLinkPhase);
    }

    private drawCorePowerLinks(g: Graphics | null | undefined, from: Vec3, targets: Vec3[], phase: number): void {
        if (!g) return;
        const container = g.node;
        if (VisualFactory.updateCorePowerLinkSprites(container, from, targets, phase)) {
            g.clear();
            return;
        }
        g.clear();
        for (let idx = 0; idx < targets.length; idx++) {
            this.drawCorePowerLinkPath(g, from, targets[idx], phase + idx * 1.15);
        }
    }

    private drawCorePowerLinkPath(g: Graphics, from: Vec3, to: Vec3, phase: number): void {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const points: { x: number; y: number }[] = [];
        const segments = 5;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const wave = i === 0 || i === segments ? 0 : Math.sin(phase + i * 1.7) * 9;
            points.push({
                x: from.x + dx * t + nx * wave,
                y: from.y + dy * t + ny * wave,
            });
        }
        g.strokeColor = new Color(60, 170, 255, 150);
        g.lineWidth = 5;
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.stroke();
        g.strokeColor = new Color(255, 245, 120, 240);
        g.lineWidth = 2;
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        g.stroke();
    }

    private rollTowerCrit(p: TowerParams): boolean {
        return p.critChance > 0 && Math.random() < p.critChance;
    }

    private critDamage(amount: number, p: TowerParams): number {
        return amount * Math.max(1, p.critMultiplier);
    }

    /** 牙刷横扫：对范围内所有敌人造成伤害 */
    private sweepAttack(tower: TowerRuntime, p: TowerParams): void {
        let skewerCutTarget: EnemyRuntime | null = null;
        // 加宽口径：作用范围倍率 + 横扫角度加成。
        // 扇形张角越大，等效覆盖半径越大（以 90° 为基准按角度比例折算），
        // 避免改造后张角变大但判定半径不变导致的"看得见打不到"。
        const sweepRadius = p.range * (p.radiusMultiplier ?? 1);
        const angleBonus = p.angleBonus ?? 0;
        const angleScale = angleBonus > 0 ? 1 + angleBonus / 90 : 1;
        const effectiveRange = sweepRadius * angleScale;
        for (const e of this.enemies) {
            if (!e.node.isValid) continue;
            if (Vec3.distance(tower.node.position, e.node.position) <= effectiveRange) {
                if (tower.def.id === 'toothbrush' && this.towerStats.brushSlowVulnerableBonus > 0 && this.isEnemySlowed(e)) {
                    this.applyBrushWeakspot(e);
                }
                this.damageEnemy(e, p.damage, this.towerDamageSource(tower, 'sweep', '范围横扫'));
                EffectManager.instance?.playHit(e.node);
                EffectManager.instance?.playDamageNumber(e.node.position, p.damage, false);
                if (tower.def.id === 'scissors' && e.buffs['skewer']
                    && (!skewerCutTarget || this.compareFirst(e, skewerCutTarget, tower.node.position) < 0)) {
                    skewerCutTarget = e;
                }
            }
        }
        if (tower.def.id === 'scissors' && skewerCutTarget) {
            this.cutSkewerChain(skewerCutTarget);
        }
    }

    // ===== thrust（吸管戳击）攻击 =====
    // 贴身单体、吸管伸出戳一下即收回，不生成子弹；沿用统一伤害/死亡/金币/波次统计。

    private thrustAttack(tower: TowerRuntime): void {
        ThrustSystem.attack(tower, this.thrustSystemContext());
    }

    private updateThrusts(dt: number): void {
        ThrustSystem.update(dt, this.thrustSystemContext());
    }

    private resetThrust(tower: TowerRuntime): void {
        ThrustSystem.reset(tower, this.thrustSystemContext());
    }

    private thrustSystemContext(): ThrustSystemContext {
        return {
            towers: this.towers,
            enemies: this.enemies,
            debug: DEBUG,
            getTowerParams: tower => this.getTowerParams(tower),
            findFirstTarget: (towerPos, range) => this.findFirstTarget(towerPos, range),
            getEnemyDef: type => this.getEnemyDef(type),
            damageEnemy: (tower, enemy, amount, result) => {
                const mechanismId = result.isOverload
                    ? 'overload_double_tap'
                    : tower.corePowered ? 'core_powered_thrust' : 'thrust';
                const mechanismName = result.isOverload
                    ? '过载第二戳'
                    : tower.corePowered ? '供电戳击' : '吸管戳击';
                if (result.isOverload) this.playtest.recordMechanismTrigger(mechanismId, mechanismName, 1);
                // 0.3.1：供电/过载戳击对 BOSS 额外 +50% 伤害（修复奶茶供电流打 BOSS 刮痧）
                const bossMul = (mechanismId === 'core_powered_thrust' || mechanismId === 'overload_double_tap')
                    && enemy.type === EnemyType.BOSS ? 1.5 : 1;
                this.damageEnemy(enemy, amount * bossMul, this.towerDamageSource(
                    tower,
                    mechanismId,
                    mechanismName,
                    { isCrit: result.isCrit, isOverload: result.isOverload },
                ));
            },
            playHit: enemy => EffectManager.instance?.playHit(enemy.node),
            playDamageNumber: (enemy, amount, isCrit, isOverload) => EffectManager.instance?.playDamageNumber(enemy.node.position, amount, isCrit, isOverload),
            rollTowerCrit: params => this.rollTowerCrit(params),
            critDamage: (amount, params) => this.critDamage(amount, params),
            bleedChance: () => this.towerStats.bleedChance,
            bleedDuration: () => this.towerStats.bleedDuration,
            hasBleedBuff: () => this.towerStats.bleedLevel > 0,
            forceSecondStrikeCrit: (tower, strikeIndex) =>
                this.towerStats.corePoweredSecondStrikeCrit && tower.corePowered && strikeIndex === 2,
            playThrustHitRing: (enemy, scale) => EffectManager.instance?.playThrustHitRing(enemy.node.position, scale),
            playOverloadThrustHit: enemy => EffectManager.instance?.playOverloadThrustHit(enemy.node.position),
            playTowerRecoil: (tower, dirX, dirY, strength) => EffectManager.instance?.playTowerRecoil(tower.node, dirX, dirY, strength),
        };
    }

    /** 敌人"离终点进度"标量：pathIdx 大优先，同段离下个 waypoint 近优先（值越大越靠近终点） */
    private enemyProgress(e: EnemyRuntime): number {
        const wps = this.waypointsOf(e);
        const wp = wps[Math.min(e.pathIdx, wps.length - 1)];
        const d = Vec3.distance(e.node.position, wp);
        return e.pathIdx * 10000 - d;
    }

    /** 索敌：范围内选路径进度最靠前（最靠近终点）的敌人（aimMode 'first'），与 findTarget 共用 compareFirst 比较器 */
    private findFirstTarget(towerPos: Vec3, range: number): number {
        let best = -1;
        for (let j = 0; j < this.enemies.length; j++) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            if (Vec3.distance(towerPos, e.node.position) > range) continue;
            if (best < 0 || this.compareFirst(e, this.enemies[best], towerPos) < 0) best = j;
        }
        return best;
    }

    private hasDoubleStraw(def: TowerDef): boolean {
        return def.id === 'bubble_tea_straw' && this.runBuild.hasTowerModifier('bubble_tea_straw', 'double_straw');
    }

    /** thrust 塔的吸管子节点：根部在 (0,0)，沿 +x 伸出；缩放只改横向，根部固定不位移 */
    private attachStraw(node: Node, def: TowerDef): Node | null {
        if (def.support || def.attack.attackType !== 'thrust') return null;
        const straw = VisualFactory.createThrustStraw(def, node);   // 表现层构建外观（Graphics 占位，美术阶段换皮）
        straw.setScale(THRUST_REST_SCALE, 1, 1);                    // 初始收回缩放（时序逻辑保留在此）
        straw.active = false;                                      // 正式塔图已有静态吸管，攻击素材仅在戳击时显示
        return straw;
    }

    private attachDoubleStrawMarker(node: Node, def: TowerDef): Node | null {
        if (!this.hasDoubleStraw(def)) return null;
        return VisualFactory.createDoubleStrawMarker(def, node);
    }

    private refreshDoubleStrawMarker(tower: TowerRuntime): void {
        if (tower.doubleStrawMarker && tower.doubleStrawMarker.isValid) {
            tower.doubleStrawMarker.destroy();
            tower.doubleStrawMarker = null;
        }
        tower.doubleStrawMarker = this.attachDoubleStrawMarker(tower.node, tower.def);
    }

    private refreshDoubleStrawMarkers(towerId: string): void {
        for (const tower of this.towers) {
            if (tower.def.id === towerId) this.refreshDoubleStrawMarker(tower);
        }
    }

    /** 核心供电电流圈：只挂在可成为核心的吸管上，显隐由 updateAuras 驱动。 */
    private attachCorePowerRing(node: Node, def: TowerDef): Node | null {
        if (def.id !== 'bubble_tea_straw') return null;
        return VisualFactory.createCorePowerRing(node);
    }

    // ===== spin / smash / pierce 攻击（数值统一读 def.attack）=====
    private pierceShots: PierceShot[] = [];   // 筷子飞行弹体（区别于戳击的即时直线）

    /** spin 旋斩（打蛋器）：开启持续伤害通道，attackDuration 内每 damageTick 对半径内敌人结算 */
    private spinAttack(tower: TowerRuntime): void {
        if (tower.spin && tower.spin.active) return;   // 防重入
        tower.spin = { active: true, timer: 0, tickTimer: 0 };
        if (tower.spinRing) tower.spinRing.active = true;
    }

    /** 每帧推进 spin 通道：按 damageTick 对半径内所有敌人结算，attackDuration 后结束 */
    private updateSpins(dt: number): void {
        for (const tower of this.towers) {
            const st = tower.spin;
            if (!st || !st.active) continue;
            const p = this.getTowerParams(tower);
            const a = tower.def.attack;
            const dur = a.attackDuration ?? 1.0;
            const tick = a.damageTick ?? 0.25;
            st.timer += dt;
            st.tickTimer += dt;
            while (st.tickTimer >= tick) {
                st.tickTimer -= tick;
                for (const e of this.enemies) {
                    if (!e.node.isValid) continue;
                    if (Vec3.distance(tower.node.position, e.node.position) <= p.range) {
                        this.damageEnemy(e, p.damage, this.towerDamageSource(tower, 'spin', '持续旋打'));
                        EffectManager.instance?.playHit(e.node);
                    }
                }
            }
            if (tower.spinRing && tower.spinRing.isValid) {
                tower.spinRing.angle = (tower.spinRing.angle + dt * 540) % 360;  // 旋转表现
            }
            if (st.timer >= dur) {
                st.active = false;
                st.timer = 0;
                if (tower.spinRing && tower.spinRing.isValid) tower.spinRing.active = false;
            }
        }
    }

    /** smash 砸击（锅铲）：选敌群最密点，半径范围爆发一次伤害 */
    private smashAttack(tower: TowerRuntime): void {
        const p = this.getTowerParams(tower);
        const a = tower.def.attack;
        // 加宽口径：作用半径倍率（改造叠加后由参数解析器输出）
        const radius = (a.radius ?? 60) * (1 + this.towerStats.smashRadiusBonus) * (p.radiusMultiplier ?? 1);
        const tidx = this.findMostEnemiesTarget(tower.node.position, p.range, radius);
        if (tidx < 0) return;
        // 漏怪风险兜底：最密点爆发若覆盖不到范围内"最靠前(离终点最近)"的落单敌人，
        // 且它比最密点更靠近终点，则改为砸它，避免门口落单敌人漏掉。
        let centerIdx = tidx;
        const fIdx = this.findFirstTarget(tower.node.position, p.range);
        if (fIdx >= 0 && fIdx !== tidx) {
            const densestE = this.enemies[tidx];
            const frontE = this.enemies[fIdx];
            if (Vec3.distance(densestE.node.position, frontE.node.position) > radius
                && this.enemyProgress(frontE) > this.enemyProgress(densestE)) {
                centerIdx = fIdx;
            }
        }
        const center = this.enemies[centerIdx].node.position;
        const controlBurstPositions: Vec3[] = [];
        for (const e of this.enemies) {
            if (!e.node.isValid) continue;
            if (Vec3.distance(center, e.node.position) <= radius) {
                const isSlowed = this.isEnemySlowed(e);
                const isBrushed = !!e.buffs['brush_weakspot'];
                const damage = p.damage * (isSlowed ? (1 + this.towerStats.smashSlowedDamageBonus) : 1);
                this.damageEnemy(e, damage, this.towerDamageSource(
                    tower,
                    isSlowed ? 'smash_slowed' : 'smash',
                    isSlowed ? '减速增幅砸击' : '锅铲砸击',
                ));
                EffectManager.instance?.playHit(e.node);
                EffectManager.instance?.playDamageNumber(e.node.position, damage, false);
                if (this.towerStats.smashBrushedBurstLevel > 0 && isBrushed && controlBurstPositions.length < 2) {
                    controlBurstPositions.push(e.node.position.clone());
                }
            }
        }
        EffectManager.instance?.playExplosion(center.clone(), radius);
        for (const pos of controlBurstPositions) this.triggerControlBurst(pos, tower);
    }

    private isEnemySlowed(e: EnemyRuntime): boolean {
        return e.slowTimer > 0 || e.slowMultiplier < 1;
    }

    private applyBrushWeakspot(enemy: EnemyRuntime): void {
        const bonus = this.towerStats.brushSlowVulnerableBonus;
        if (bonus <= 0) return;
        const duration = 2.5;
        enemy.buffs['brush_weakspot'] = { timer: duration, dps: 0 };
        enemy.vulnerable = Math.max(enemy.vulnerable, 1 + bonus);
        enemy.vulnerableTimer = Math.max(enemy.vulnerableTimer, duration);
        this.playtest.recordMechanismTrigger('brush_weakspot', '刷洗破绽', 1);
        EffectManager.instance?.playBrushWeakspot(enemy.node, duration);
    }

    private triggerControlBurst(pos: Vec3, tower: TowerRuntime): void {
        const level = this.towerStats.smashBrushedBurstLevel;
        if (level <= 0) return;
        const radius = 45 + level * 8;
        const damage = 12 + level * 8;
        let hitCount = 0;
        for (const e of this.enemies) {
            if (!e.node.isValid || e.hp <= 0) continue;
            if (Vec3.distance(pos, e.node.position) > radius) continue;
            hitCount++;
            this.damageEnemy(e, damage, this.towerDamageSource(tower, 'control_burst', '控制爆破'));
            EffectManager.instance?.playDamageNumber(e.node.position, damage, false);
        }
        this.playtest.recordMechanismTrigger('control_burst', '控制爆破', hitCount);
        EffectManager.instance?.playExplosion(pos.clone(), radius);
    }

    /** pierce 贯穿（筷子）：投掷一枚筷子弹体，沿直线飞行并穿透多个目标（区别于戳击的即时直线） */
    private pierceAttack(tower: TowerRuntime): void {
        if (!this.battleRoot) return;
        const p = this.getTowerParams(tower);
        const a = tower.def.attack;
        const tidx = this.findFirstTarget(tower.node.position, p.range);
        if (tidx < 0) return;
        const target = this.enemies[tidx];
        const tp = tower.node.position;
        const dx = target.node.position.x - tp.x;
        const dy = target.node.position.y - tp.y;
        const len = Math.hypot(dx, dy) || 1;
        const dirX = dx / len, dirY = dy / len;
        const range = p.range;
        const halfW = (a.width ?? 10) / 2;
        // 穿刺弹头：额外命中目标数（改造叠加后由参数解析器输出）；99 视为无上限，不叠加
        const baseMaxTargets = a.maxTargets ?? 99;
        const maxTargets = baseMaxTargets >= 99 ? 99 : baseMaxTargets + (p.maxTargetsBonus ?? 0);
        // 加宽口径：弹道半宽也受作用范围倍率影响
        const halfWEffective = halfW * (p.radiusMultiplier ?? 1);

        // 预选中：弹道内按"最靠近终点"优先，取前 maxTargets 个作为本次要结算的目标
        const corridor: { e: EnemyRuntime; prog: number }[] = [];
        for (const e of this.enemies) {
            if (!e.node.isValid) continue;
            const rE = this.getEnemyDef(e.type)?.radius ?? 14;
            const fx = e.node.position.x - tp.x;
            const fy = e.node.position.y - tp.y;
            const f = fx * dirX + fy * dirY;
            if (f < -rE || f > range + rE) continue;
            const sx = fx - f * dirX, sy = fy - f * dirY;
            if (Math.hypot(sx, sy) > halfWEffective + rE) continue;
            corridor.push({ e, prog: this.enemyProgress(e) });
        }
        corridor.sort((x, y) => y.prog - x.prog);   // 最靠近终点在前
        const targetSet = new Set<EnemyRuntime>();
        for (let i = 0; i < Math.min(maxTargets, corridor.length); i++) targetSet.add(corridor[i].e);

        const node = VisualFactory.createPierceShot(tower.def);   // 表现层构建签体外观
        node.setParent(this.battleRoot);
        node.setPosition(tp);
        node.angle = Math.atan2(dirY, dirX) * 180 / Math.PI;
        this.pierceShots.push({
            node, fromX: tp.x, fromY: tp.y, dirX, dirY,
            speed: 720, traveled: 0, range,
            halfW: halfWEffective, damage: p.damage,
            maxTargets, hitCount: 0, hitSet: new Set(),
            targetSet,
            sourceTowerId: tower.def.id,
            sourceTowerName: tower.def.name,
        });
    }

    /** 筷子弹体飞行与穿透命中：签尖到达敌人近缘即结算一次，最多 maxTargets 个 */
    private updatePierceShots(dt: number): void {
        for (let i = this.pierceShots.length - 1; i >= 0; i--) {
            const s = this.pierceShots[i];
            if (!s.node.isValid) { this.pierceShots.splice(i, 1); continue; }
            s.traveled += s.speed * dt;
            s.node.setPosition(s.fromX + s.dirX * s.traveled, s.fromY + s.dirY * s.traveled, 0);
            for (const e of this.enemies) {
                if (!e.node.isValid || s.hitSet.has(e)) continue;
                if (!s.targetSet.has(e)) continue;               // 只结算预选中"最靠近终点"的目标
                const fx = e.node.position.x - s.fromX;
                const fy = e.node.position.y - s.fromY;
                const f = fx * s.dirX + fy * s.dirY;        // 敌人沿弹道方向的前向距离
                if (f < 0 || f > s.range) continue;
                const sx = fx - f * s.dirX, sy = fy - f * s.dirY;
                const rE = this.getEnemyDef(e.type)?.radius ?? 14;
                if (Math.hypot(sx, sy) > s.halfW + rE) continue; // 弹道外的敌人
                if (s.traveled < f - rE) continue;               // 签尖尚未到达该敌人近缘
                this.damageEnemy(e, s.damage, this.buildDamageSource(
                    s.sourceTowerId,
                    s.sourceTowerName,
                    s.sourceTowerId,
                    s.sourceTowerName,
                    'pierce',
                    '穿透射击',
                ));
                EffectManager.instance?.playHit(e.node);
                EffectManager.instance?.playDamageNumber(e.node.position, s.damage, false);
                s.hitSet.add(e);
                s.hitCount++;
            }
            if (s.traveled >= s.range || s.hitSet.size >= s.targetSet.size) {
                this.tryCreateSkewerChainFromPierceShot(s);
                s.node.destroy();
                this.pierceShots.splice(i, 1);
            }
        }
    }

    private threadSpoolModifier() {
        return this.runBuild.towerModifiersOf('chopsticks').find(m => m.id === 'thread_spool') ?? null;
    }

    private tryCreateSkewerChainFromPierceShot(shot: PierceShot): void {
        const mod = this.threadSpoolModifier();
        if (!this.battleRoot) return;

        // 0.3.1：无 thread_spool 改造卡时也创建基础串联链（2目标、3秒、0.5倍伤害），
        //       让剪刀+筷子联动不锁死在稀有卡牌后面；有改造卡时使用增强数值。
        const ch = mod?.changes;
        const maxTargets = (ch?.skewerChainTargets ?? 2) + this.towerStats.skewerChainTargetBonus;
        const candidates = Array.from(shot.hitSet)
            .filter(e => e.node.isValid && e.hp > 0 && !e.buffs['skewer'])
            .slice(0, maxTargets);
        if (candidates.length < 2) return;

        const maxChains = ch?.maxSkewerChains ?? 1;
        while (this.skewerChains.length >= maxChains) {
            this.removeSkewerChain(this.skewerChains[0]);
        }

        const line = VisualFactory.createSkewerChainLine(this.battleRoot);
        const id = this.nextSkewerChainId++;
        const duration = (ch?.skewerDuration ?? 3) + this.towerStats.skewerDurationBonus;
        const damage = shot.damage
            * (ch?.skewerCutDamageMultiplier ?? 0.5)
            * (1 + this.towerStats.skewerCutDamageBonus);
        const chain: SkewerChainRuntime = {
            id,
            enemies: candidates,
            timer: duration,
            duration,
            damage,
            sourceTowerId: shot.sourceTowerId,
            sourceTowerName: shot.sourceTowerName,
            lineNode: line.node,
            lineGfx: line.gfx,
        };
        for (const e of candidates) {
            e.buffs['skewer'] = { timer: duration, dps: 0, chainId: id };
        }
        this.skewerChains.push(chain);
        this.playtest.recordMechanismTrigger('skewer_chain', '彩线串联', candidates.length);
        this.drawSkewerChain(chain);
    }

    private updateSkewerChains(dt: number): void {
        for (let i = this.skewerChains.length - 1; i >= 0; i--) {
            const chain = this.skewerChains[i];
            chain.timer -= dt;
            chain.enemies = chain.enemies.filter(e => e.node.isValid && e.hp > 0 && e.buffs['skewer']?.chainId === chain.id);
            if (chain.timer <= 0 || chain.enemies.length < 2) {
                this.removeSkewerChain(chain);
                continue;
            }
            for (const e of chain.enemies) {
                const buff = e.buffs['skewer'];
                if (buff) buff.timer = chain.timer;
            }
            this.drawSkewerChain(chain);
        }
    }

    private drawSkewerChain(chain: SkewerChainRuntime): void {
        const g = chain.lineGfx;
        if (!g || !chain.lineNode.isValid) return;
        g.clear();
        const ratio = Math.max(0, Math.min(1, chain.timer / chain.duration));
        const palettes = [
            { outer: new Color(255, 80, 170, 170), inner: new Color(100, 235, 255, 230), knot: new Color(255, 230, 90, 220) },
            { outer: new Color(100, 235, 255, 160), inner: new Color(255, 230, 90, 230), knot: new Color(255, 90, 170, 220) },
            { outer: new Color(255, 230, 90, 150), inner: new Color(255, 80, 170, 230), knot: new Color(100, 235, 255, 220) },
        ];
        const pal = palettes[chain.id % palettes.length];
        const points = chain.enemies.map(e => e.node.position);
        if (points.length >= 2) {
            g.strokeColor = pal.outer;
            g.lineWidth = 5;
            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
            g.stroke();
            g.strokeColor = pal.inner;
            g.lineWidth = 2;
            g.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
            g.stroke();
        }
        for (const p of points) {
            g.strokeColor = pal.knot;
            g.lineWidth = 2;
            g.circle(p.x, p.y, 11 + 4 * ratio);
            g.stroke();
        }
    }

    private cutSkewerChain(target: EnemyRuntime): void {
        const chainId = target.buffs['skewer']?.chainId;
        if (chainId === undefined) return;
        const chain = this.skewerChains.find(c => c.id === chainId);
        if (!chain) return;

        const hitPos = target.node.position.clone();
        const cutPoints = chain.enemies
            .filter(e => e.node.isValid && e.hp > 0)
            .map(e => e.node.position.clone());
        let hitCount = 0;
        for (const e of chain.enemies) {
            if (!e.node.isValid || e.hp <= 0) continue;
            hitCount++;
            this.damageEnemy(e, chain.damage, this.buildDamageSource(
                chain.sourceTowerId,
                chain.sourceTowerName,
                chain.sourceTowerId,
                chain.sourceTowerName,
                'skewer_cut',
                '剪串引爆',
            ));
            EffectManager.instance?.playHit(e.node);
            EffectManager.instance?.playDamageNumber(e.node.position, chain.damage, true);
        }
        this.playtest.recordMechanismTrigger('skewer_cut', '剪串引爆', hitCount);
        EffectManager.instance?.playSkewerCut(cutPoints.length > 0 ? cutPoints : [hitPos]);
        this.removeSkewerChain(chain);
    }

    private removeSkewerChain(chain: SkewerChainRuntime): void {
        const idx = this.skewerChains.indexOf(chain);
        if (idx >= 0) this.skewerChains.splice(idx, 1);
        for (const e of chain.enemies) {
            if (e.buffs['skewer']?.chainId === chain.id) delete e.buffs['skewer'];
        }
        if (chain.lineNode.isValid) chain.lineNode.destroy();
    }

    private clearSkewerChains(): void {
        for (const chain of this.skewerChains) {
            for (const e of chain.enemies) {
                if (e.buffs['skewer']?.chainId === chain.id) delete e.buffs['skewer'];
            }
            if (chain.lineNode.isValid) chain.lineNode.destroy();
        }
        this.skewerChains.length = 0;
        this.nextSkewerChainId = 1;
    }

    /** 敌群最密目标：在 range 内统计每个敌人 radius 邻域敌人数，取最大（aimMode 'mostEnemies'） */
    private findMostEnemiesTarget(towerPos: Vec3, range: number, radius: number): number {
        let best = -1;
        let bestCount = -1;
        for (let j = 0; j < this.enemies.length; j++) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            if (Vec3.distance(towerPos, e.node.position) > range) continue;
            let count = 0;
            for (const o of this.enemies) {
                if (!o.node.isValid) continue;
                if (Vec3.distance(e.node.position, o.node.position) <= radius) count++;
            }
            if (count > bestCount) { bestCount = count; best = j; }
        }
        return best;
    }

    /** spin 塔的旋斩光环子节点：攻击时显示并旋转，平时隐藏 */
    private attachSpinRing(node: Node, def: TowerDef): Node | null {
        if (def.attack.attackType !== 'spin') return null;
        return VisualFactory.createSpinRing(def, node);   // 表现层构建外观（含初始隐藏）
    }

    /** 中断/移动/融合/销毁时复位 spin 通道与光环 */
    private resetSpin(tower: TowerRuntime): void {
        if (tower.spin) {
            tower.spin.active = false;
            tower.spin.timer = 0;
            tower.spin.tickTimer = 0;
        }
        if (tower.spinRing && tower.spinRing.isValid) tower.spinRing.active = false;
    }

    /** 橡皮筋弹射：返回 fromPos 半径内、排除 exclude 的最近敌人索引 */
    private findChainTarget(exclude: Node, fromPos: Vec3, radius: number): number {
        let best = -1;
        let bestDist = Infinity;
        for (let k = 0; k < this.enemies.length; k++) {
            const e = this.enemies[k];
            if (!e.node.isValid || e.node === exclude) continue;
            const d = Vec3.distance(fromPos, e.node.position);
            if (d <= radius && d < bestDist) { bestDist = d; best = k; }
        }
        return best;
    }

    /** 胶带：在指定位置创建地面减速区（独立节点，到期自动清理） */
    private createGroundZone(pos: Vec3, radius: number, duration: number, slowMultiplier: number): void {
        if (!this.battleRoot) return;
        const node = new Node('GroundZone');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(this.battleRoot);
        node.setPosition(pos);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(180, 160, 255, 50);
        gfx.circle(0, 0, radius);
        gfx.fill();
        gfx.strokeColor = new Color(180, 160, 255, 170);
        gfx.lineWidth = 2;
        gfx.circle(0, 0, radius);
        gfx.stroke();
        this.groundZones.push({ node, timer: duration, radius, slowMultiplier });
        console.log(`[胶带] 地面减速区 半径${radius} 持续${duration}s @(${pos.x.toFixed(0)},${pos.y.toFixed(0)})`);
    }

    private placeTower(slotIndex: number, def: TowerDef, cost: number = def.cost): void {
        if (this.slotOccupied[slotIndex] || !this.battleRoot) return;
        if (this.lockedSlots[slotIndex]) {
            if (this.statusLabel) this.statusLabel.string = '该格被封锁，需用锤子敲开';
            return;
        }
        if (this.gold < cost) {
            if (this.statusLabel) this.statusLabel.string = `金币不足，需要 ${cost}（当前 ${this.gold}）`;
            return;
        }

        this.gold -= cost;
        this.updateGoldLabel();

        const node = this.createTower(this.slotPositions[slotIndex], def);
        node.setParent(this.battleRoot);
        const tower: TowerRuntime = {
            node, def, star: 1, affix: null, attackCount: 0, disabledTimer: 0,
            auraSpeedMul: 1, corePowered: false, corePowerCritChance: 0, corePowerCritMultiplier: 1,
            corePowerRing: null, corePowerLink: null, corePowerLinkGfx: null, corePowerLinkPhase: 0,
            doubleStrawMarker: null,
        };
        tower.straw = this.attachStraw(node, def);
        tower.doubleStrawMarker = this.attachDoubleStrawMarker(node, def);
        tower.corePowerRing = this.attachCorePowerRing(node, def);
        tower.thrust = { active: false, phase: 'idle', timer: 0, dirX: 1, dirY: 0, damaged: false, strikeIndex: 0, totalStrikes: 1, repeatDelay: 0 };
        tower.spinRing = this.attachSpinRing(node, def);
        tower.spin = { active: false, timer: 0, tickTimer: 0 };
        if (DEBUG && !def.support && def.attack.attackType === 'thrust') {
            const debugNode = new Node('ThrustDebug');
            debugNode.layer = Layers.Enum.UI_2D;
            debugNode.setParent(node);
            const dbg = debugNode.addComponent(Graphics);
            tower.thrustDebug = dbg;
        }
        this.setTowerBadge(tower);

        this.towers.push(tower);
        this.towerTimers.push(def.attack.attackInterval);
        this.slotOccupied[slotIndex] = true;
        this.slotNodes[slotIndex].active = false;
        this.playtest.recordOperation('tower_placed', { towerId: def.id, slot: slotIndex + 1, cost });

        console.log(`${def.name}放置到位置 ${slotIndex + 1}，花费 ${def.cost}，当前 ${this.towers.length} 塔`);
        this.refreshHandCardUsability();   // 建塔后刷新手牌可用性（空格减少/同型塔增加）
    }

    /**
     * 金币变化时刷新顶部标签与底部按钮（抽卡按钮在 cardMode 下显示「结束选牌」）
     */
    private updateGoldLabel(): void {
        if (this.goldLabel) {
            this.goldLabel.string = `Gold: ${this.gold}`;
        }
        if (this.goldAboveButtonLabel) {
            this.goldAboveButtonLabel.string = `gold ${this.gold}`;
        }
        // 底部按钮随金币可用性/用卡阶段刷新（「N金抽卡」或「结束选牌」）
        this.refreshSpendButton();
    }

    private currentDrawCost(): number {
        const costs = SceneInitializer.DRAW_COSTS;
        return costs[Math.min(this.drawCount, costs.length - 1)];
    }

    /** 刷新底部按钮：用卡阶段显示「结束选牌」（始终可用）；否则需同时满足
     *  金币≥当前抽卡费用 / 无手牌 / 未三选一 / 未结束 / 未用户暂停 才亮抽卡按钮 */
    private refreshSpendButton(): void {
        if (!this.spendButton) return;
        const gfx = this.spendButton.getComponent(Graphics);
        const drawCost = this.currentDrawCost();
        let enabled: boolean;
        let labelText: string;
        if (this.cardMode) {
            enabled = true;
            labelText = '结束选牌';
        } else {
            enabled = this.gold >= drawCost
                && this.handCards.length === 0
                && !this.isBuffSelecting
                && !this.isGameOver
                && !this.isUserPaused;
            labelText = `${drawCost}金抽卡`;
        }
        if (gfx) {
            gfx.clear();
            gfx.fillColor = enabled ? new Color(60, 120, 70, 255) : new Color(90, 90, 90, 255);
            gfx.strokeColor = enabled ? new Color(255, 220, 100, 255) : new Color(160, 160, 160, 255);
            gfx.lineWidth = 3;
            gfx.roundRect(-90, -32, 180, 64, 12);
            gfx.fill();
            gfx.roundRect(-90, -32, 180, 64, 12);
            gfx.stroke();
        }
        if (this.spendButtonLabel) this.spendButtonLabel.string = labelText;
    }

    /** 取消当前卡牌拖拽：统一清理卡牌幽灵/拖拽状态（不论触发场景） */
    private cancelCardDrag(): void {
        if (this.cardGhost) this.cardGhost.active = false;
        this.dragCardIndex = -1;
        this.isDragging = false;
    }

    /** 玩家主动结束本轮选牌：清掉手牌、退出用卡阶段（之后可再次抽卡） */
    private finishCardSelection(): void {
        if (!this.cardMode) return;
        this.playtest.closeDraw();
        this.clearHandCards();
        this.handCards = [];
        this.cardMode = false;
        this.usedCardCount = 0;
        this.cancelCardDrag();
        this.refreshSpendButton();
        if (this.statusLabel) this.statusLabel.string = '已结束选牌';
    }

    /** 单张手牌是否可用：塔牌=空格或同型可升级塔；锤子=灰格；改造=有兼容目标；战术=随时 */
    private isHandCardUsable(card: CardDef): boolean {
        if (card.kind === 'hammer') return this.lockedSlots.some(l => l);
        if (card.kind === 'tower') {
            const hasFreeSlot = this.slotPositions.some((_, i) => !this.slotOccupied[i] && !this.lockedSlots[i]);
            if (hasFreeSlot) return true;
            return this.towers.some(t => t.def.id === card.towerId && t.star < SceneInitializer.MAX_STAR);
        }
        if (card.kind === 'modifier') return this.hasCompatibleModifierTarget(card.sourceId);
        if (card.kind === 'tactic') return true;                       // 即时战场效果，随时可用
        return false;
    }

    /** 判断剩余手牌中是否还有可用的卡（用于剩余牌全部无效时自动结束） */
    private hasUsableCardRemaining(): boolean {
        return this.handCards.some(card => this.isHandCardUsable(card));
    }

    // === 游戏结束弹窗 ===
    private gameOverPanel: Node | null = null;
    // ===== 复活机制（商业化：广告点位）=====
    // 每局最多复活一次；复活后满血继续当前波，并给予补偿增益。
    private reviveUsed = false;              // 本局是否已用过复活
    private readonly reviveMaxUses = 1;      // 每局复活次数上限
    private reviveHpRatio = 1.0;             // 复活后血量恢复比例（满血）
    private reviveGoldBonus = 200;           // 复活补偿金币
    private handleRevive = async (): Promise<boolean> => true;  // 由平台层注入的广告播放回调，默认直接成功
    // ===== 高风险卡运行时状态 =====
    private overdraftDamageBonus = 0;        // 透支供电：本波塔伤害加成（波末清空）
    private overdraftPending = false;        // 透支供电：是否在波末执行全场降星
    private overdraftFatigueWaves = 0;       // 透支供电：剩余「全体塔伤害衰减」的波数（可逆）
    private readonly OVERDRAFT_FATIGUE_PENALTY = 0.3;  // 透支供电：衰减期塔伤害降低 30%
    private readonly OVERDRAFT_FATIGUE_WAVES = 1;      // 透支供电：反噬衰减持续的波数
    private overdraftFatigueSetThisWave = false;       // 透支供电：衰减是否在本波末刚设置（避免同波被递减清零）
    private readonly SALVAGE_GEAR_GOLD_PER_STACK = 2;  // 回收齿轮：每层每次击杀返还金币（按击杀塔自身层数结算）
    private incomeFreezeWaves = 0;           // 时间借贷：剩余收益归零的波数
    private isGameOver = false;

    private gameOver(): void {
        if (this.isGameOver) return;
        this.refreshPlaytestBuildMilestones();
        this.playtest.endWave(this.buildPlaytestSnapshot());
        this.playtest.finalize('defeat', this.currentWave, this.buildPlaytestSnapshot());
        this.isGameOver = true;
        this.stopCountdown();
        this.waveActive = false;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideGlobalBuffPanel();
        this.resetCardSystem();   // 失败清除手牌，避免结算弹窗下残留
        this.hideTowerInfo();     // 0.3.1：隐藏塔信息面板，防止遮挡结算弹窗导出按钮

        // 清除所有敌人和子弹
        for (const en of this.enemies) en.node.destroy();
        this.enemies.length = 0;
        for (const b of this.bullets) b.node.destroy();
        this.bullets.length = 0;
        // 清除地面减速区节点
        for (const z of this.groundZones) z.node.destroy();
        this.groundZones.length = 0;

        // 创建弹窗
        const canvas = this.node;
        const panel = new Node('GameOverPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        const panelTransform = panel.addComponent(UITransform);
        panelTransform.setContentSize(400, 200);

        const gfx = panel.addComponent(Graphics);
        gfx.fillColor = new Color(40, 40, 50, 230);
        gfx.roundRect(-200, -100, 400, 200, 12);
        gfx.fill();
        gfx.strokeColor = new Color(255, 80, 80, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-200, -100, 400, 200, 12);
        gfx.stroke();

        // "守卫失败" 文字
        const titleNode = new Node('Title');
        titleNode.layer = Layers.Enum.UI_2D;
        titleNode.setParent(panel);
        titleNode.addComponent(UITransform);
        titleNode.setPosition(0, 40, 0);
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '守卫失败';
        titleLabel.fontSize = 36;
        titleLabel.color = new Color(255, 80, 80, 255);

        // "再来一局" 按钮
        const btnNode = new Node('RestartBtn');
        btnNode.layer = Layers.Enum.UI_2D;
        btnNode.setParent(panel);
        const btnTransform = btnNode.addComponent(UITransform);
        btnTransform.setContentSize(140, 44);
        btnTransform.setAnchorPoint(0.5, 0.5);
        btnNode.setPosition(-82, -40, 0);

        const btnGfx = btnNode.addComponent(Graphics);
        btnGfx.fillColor = new Color(80, 160, 80, 255);
        btnGfx.roundRect(-70, -22, 140, 44, 8);
        btnGfx.fill();

        const btnLabelNode = new Node('Label');
        btnLabelNode.layer = Layers.Enum.UI_2D;
        btnLabelNode.setParent(btnNode);
        btnLabelNode.addComponent(UITransform);
        const btnLabel = btnLabelNode.addComponent(Label);
        btnLabel.string = '再来一局';
        btnLabel.fontSize = 20;
        btnLabel.color = new Color(255, 255, 255, 255);

        btnNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            console.log('点击再来一局');
            this.restart();
        });

        // ===== 复活按钮（未用过复活时显示）=====
        // 商业化为唯一广告点位：失败瞬间情绪峰值 + 沉没成本最高，转化优于局中插广告。
        let reviveBtnNode: Node | null = null;
        const canRevive = !this.reviveUsed;
        if (canRevive) {
            reviveBtnNode = this.createReviveButton(panel);
        }
        this.layoutDefeatButtons(panel, btnNode, reviveBtnNode);

        this.gameOverPanel = panel;

        if (this.statusLabel) this.statusLabel.string = '守卫失败';
    }

    /** 失败面板底部：导出按钮固定在左侧，复活后主按钮右移，保证三按钮不重叠。 */
    private layoutDefeatButtons(panel: Node, restartBtn: Node, reviveBtn: Node | null): void {
        this.createPlaytestExportButton(panel, new Vec3(-190, -40, 0));
        restartBtn.setPosition(0, -40, 0);
        if (reviveBtn) reviveBtn.setPosition(190, -40, 0);
    }

    /**
     * 创建「看广告复活」按钮 / Create revive button (ad placement).
     * 点击后调用注入的 handleRevive（平台层播放激励视频），成功则复活当前局。
     */
    private createReviveButton(panel: Node): Node {
        const btnNode = new Node('ReviveBtn');
        btnNode.layer = Layers.Enum.UI_2D;
        btnNode.setParent(panel);
        const btnTransform = btnNode.addComponent(UITransform);
        btnTransform.setContentSize(140, 44);
        btnTransform.setAnchorPoint(0.5, 0.5);

        const btnGfx = btnNode.addComponent(Graphics);
        btnGfx.fillColor = new Color(200, 150, 40, 255);
        btnGfx.roundRect(-70, -22, 140, 44, 8);
        btnGfx.fill();

        const btnLabelNode = new Node('Label');
        btnLabelNode.layer = Layers.Enum.UI_2D;
        btnLabelNode.setParent(btnNode);
        btnLabelNode.addComponent(UITransform);
        const btnLabel = btnLabelNode.addComponent(Label);
        btnLabel.string = '看广告复活';
        btnLabel.fontSize = 20;
        btnLabel.color = new Color(255, 255, 255, 255);

        btnNode.on(Node.EventType.TOUCH_END, async (event: EventTouch) => {
            event.propagationStopped = true;
            btnLabel.string = '加载中...';
            const ok = await this.handleRevive();
            if (ok) {
                this.revive();
            } else {
                btnLabel.string = '看广告复活';
                console.warn('复活失败：广告未播放完成');
            }
        });
        return btnNode;
    }

    /**
     * 执行复活 / Execute revive.
     * 保留全部塔与构筑（沉没成本不丢失），回满血、补金币，重打当前波。
     * 注意：不调用 restart，restart 会清空塔与格子。
     */
    private revive(): void {
        if (this.reviveUsed) return;
        this.reviveUsed = true;
        console.log(`[Revive] 复活生效：回满血 +${this.reviveGoldBonus} 金币，重打第 ${this.currentWave} 波`);

        // 销毁失败弹窗
        if (this.gameOverPanel) {
            this.gameOverPanel.destroy();
            this.gameOverPanel = null;
        }

        this.stopCountdown();
        this.cancelCardDrag();

        // 清场：敌人/子弹/减速区（保留塔与格子状态）
        for (const e of this.enemies) {
            if (e.node.isValid) e.node.destroy();
        }
        this.enemies.length = 0;
        for (const b of this.bullets) {
            if (b.node.isValid) b.node.destroy();
        }
        this.bullets.length = 0;
        for (const s of this.pierceShots) {
            if (s.node.isValid) s.node.destroy();
        }
        this.pierceShots.length = 0;
        this.clearSkewerChains();
        for (const z of this.groundZones) {
            if (z.node.isValid) z.node.destroy();
        }
        this.groundZones.length = 0;
        // 复位 BOSS 锁定状态，避免指向已销毁的塔
        this.bossLockedTower = null;
        this.bossLockTimer = 0;

        // 回满血 + 补偿金币
        this.allyHp = Math.max(1, Math.ceil(this.allyMaxHp * this.reviveHpRatio));
        this.gold += this.reviveGoldBonus;
        if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.allyMaxHp}`;
        if (this.goldLabel) this.goldLabel.string = `Gold: ${this.gold}`;

        // 恢复运行态
        this.isGameOver = false;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideTowerInfo();
        // 作废失败时已落库的 defeat 记录：复活后若最终获胜，只保留 victory，避免污染胜率统计
        this.playtest.reopenAfterRevive();

        // 重打当前波：currentWave 在 startNextWave 内自增，此处回退以保持波次不变
        this.currentWave = Math.max(0, this.currentWave - 1);
        this.startNextWave();
    }

    private restart(): void {
        // 新局复位复活状态（每局重新获得复活机会）
        this.reviveUsed = false;

        // 销毁弹窗
        if (this.gameOverPanel) {
            this.gameOverPanel.destroy();
            this.gameOverPanel = null;
        }

        this.stopCountdown();
        this.cancelCardDrag();

        // 清除所有塔和建造点
        for (const tower of this.towers) {
            if (tower.corePowerLink && tower.corePowerLink.isValid) tower.corePowerLink.destroy();
            tower.node.destroy();
        }
        this.towers.length = 0;
        this.towerTimers.length = 0;
        // 复位 BOSS 锁定状态（避免指向已销毁的塔）
        this.bossLockedTower = null;
        this.bossLockTimer = 0;
        // 关闭塔信息面板
        this.hideTowerInfo();

        // 清除残留敌人（destroy 节点，避免场景残留）
        for (const e of this.enemies) {
            e.node.removeFromParent();
            e.node.destroy();
        }
        this.enemies.length = 0;

        // 清除残留子弹
        for (const b of this.bullets) b.node.destroy();
        this.bullets.length = 0;
        for (const s of this.pierceShots) {
            if (s.node.isValid) s.node.destroy();
        }
        this.pierceShots.length = 0;
        this.clearSkewerChains();

        // 取消任何进行中的长按拖拽调度
        this.unschedule(this.onLongPressMove);

        // 恢复建造点（含重置锁定格）
        for (let i = 0; i < this.slotPositions.length; i++) {
            this.slotOccupied[i] = false;
            this.slotNodes[i].active = true;
            // 锁定格按 MapConfig 显式坐标匹配，不受排序/数量变化影响
            this.lockedSlots[i] = LOCKED_BUILD_CELL_KEYS.has(`${this.slotCells[i].col},${this.slotCells[i].row}`);
            this.redrawSlot(i, this.lockedSlots[i]);
        }
        // 重置卡牌系统（统一方法）
        this.resetCardSystem();

        // 重置拖拽 / 选卡 / 长按状态
        this.isDragging = false;
        if (this.ghostNode) this.ghostNode.active = false;
        this.canPlace = false;
        this.targetSlot = -1;
        this.moveFromSlot = -1;
        this.dragMode = 'place';
        this.dragTowerDef = null;
        this.pendingTower = -1;

        // 重置状态
        this.isGameOver = false;
        this.gold = this.INITIAL_GOLD;
        this.allyMaxHp = this.ALLY_MAX_HP_BASE;
        this.allyHp = this.allyMaxHp;
        this.waveHasBoss = false;
        this.gambleWaveIndex = null;
        this.gambleWaveLeaks = 0;
        this.currentWave = 0;
        this.spawnedInWave = 0;
        this.spawnTimer = 0;
        this.waveTotalCount = 0;
        this.waveActive = false;
        this.waveElapsed = 0;
        this.spawnCursor = 0;
        this.activeWaveEntries = [];
        this.midWaveRewardGiven = false;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.currentBuffChoices = [];
        // 高风险卡运行时状态复位：不清空会把上一局的透支加成/衰减、收益冻结带入新局
        this.overdraftDamageBonus = 0;
        this.overdraftPending = false;
        this.overdraftFatigueWaves = 0;
        this.overdraftFatigueSetThisWave = false;
        this.incomeFreezeWaves = 0;
        this.towerStats.reset();
        this.runBuild.reset();
        this.mainBuildPath = null;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideGlobalBuffPanel();

        // 更新 HUD
        this.updateGoldLabel();
        if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.allyMaxHp}`;
        if (this.waveLabel) this.waveLabel.string = `Wave: 0/${this.WAVES.length}`;
        if (this.statusLabel) this.statusLabel.string = `点击「${this.currentDrawCost()}金抽卡」，5张牌最多使用2张`;

        // 关卡开始倒计时
        this.playtest.beginRun(this.playtestMetadata);
        this.selectWavePattern();
        this.startLevelCountdown();
        console.log('游戏重新开始');
    }

    /** 创建底部抽卡/结束选牌按钮 */
    private createSpendButton(pos: Vec3): Node {
        const node = new Node('SpendButton');
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(180, 64);
        node.setPosition(pos);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 120, 70, 255);
        gfx.roundRect(-90, -32, 180, 64, 12);
        gfx.fill();
        gfx.strokeColor = new Color(255, 220, 100, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-90, -32, 180, 64, 12);
        gfx.stroke();

        const labelNode = new Node('Text');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        labelNode.setParent(node);
        labelNode.setPosition(0, 0, 0);
        const label = labelNode.addComponent(Label);
        label.string = `${this.currentDrawCost()}金抽卡`;
        label.fontSize = 24;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        return node;
    }

    /** 创建右上角游戏暂停按钮 */
    private createPauseButton(): Node {
        const node = new Node('PauseButton');
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(72, 36);
        node.setPosition(this.PAUSE_BUTTON_POS);

        const gfx = node.addComponent(Graphics);
        // 圆角按钮背景（灰色）
        gfx.fillColor = new Color(80, 80, 90, 255);
        gfx.roundRect(-36, -18, 72, 36, 8);
        gfx.fill();
        gfx.strokeColor = new Color(255, 255, 255, 150);
        gfx.lineWidth = 1;
        gfx.roundRect(-36, -18, 72, 36, 8);
        gfx.stroke();

        // 按钮文字
        const textNode = new Node('Text');
        textNode.layer = Layers.Enum.UI_2D;
        textNode.addComponent(UITransform);
        textNode.setParent(node);
        textNode.setPosition(0, 0, 0);
        const label = textNode.addComponent(Label);
        label.string = '⏸ 暂停';
        label.fontSize = 16;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        const textTransform = textNode.getComponent(UITransform)!;
        textTransform.setContentSize(72, 36);

        return node;
    }

    private createTower(pos: Vec3, def: TowerDef): Node {
        const node = new Node(def.name + 'Tower');
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(64, 64);
        node.addComponent(UIOpacity);

        const gfx = node.addComponent(Graphics);
        drawTowerBase(gfx, def.color);
        gfx.strokeColor = def.rangeColor;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, def.attack.range);
        gfx.stroke();

        // 正式贴图未加载时显示的程序绘制占位。
        const fallbackBody = new Node('FallbackBody');
        fallbackBody.layer = Layers.Enum.UI_2D;
        fallbackBody.setParent(node);
        fallbackBody.addComponent(UITransform).setContentSize(56, 56);
        const bodyGfx = fallbackBody.addComponent(Graphics);
        bodyGfx.fillColor = def.color;
        bodyGfx.circle(0, 0, 20);
        bodyGfx.fill();
        bodyGfx.fillColor = new Color(255, 255, 255, 255);
        bodyGfx.circle(0, 0, 6);
        bodyGfx.fill();

        // 家庭小物件标识（正式贴图加载后随占位一起隐藏）
        if (def.support) {
            bodyGfx.strokeColor = new Color(255, 210, 80, 220);
            bodyGfx.lineWidth = 3;
            bodyGfx.circle(0, 0, 12);
            bodyGfx.stroke();
        } else if (def.sweep) {
            bodyGfx.fillColor = new Color(255, 255, 255, 150);
            bodyGfx.rect(-14, -3, 28, 6);
            bodyGfx.fill();
        } else if (def.bounce) {
            bodyGfx.fillColor = new Color(255, 255, 255, 210);
            bodyGfx.circle(0, 0, 4);
            bodyGfx.fill();
        }
        VisualFactory.createTowerArt(def.id, node, fallbackBody);

        // 星级/词缀/改造图形徽章：塔上只保留轻量视觉信号，完整说明放在点按详情面板
        const badge = new Node('Badge');
        badge.layer = Layers.Enum.UI_2D;
        badge.setParent(node);
        const bt = badge.addComponent(UITransform);
        bt.setContentSize(72, 72);
        bt.setAnchorPoint(0.5, 0.5);
        badge.addComponent(Graphics);
        badge.setPosition(0, 0, 0);

        return node;
    }

    /** 餐垫塔位：圆形垫子，尺寸与旧方块视觉体量一致（半径 = 格子的 36%） */
    private createTowerSlot(pos: Vec3, index: number, locked: boolean): Node {
        const node = new Node(`Slot_${index}`);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        const slotSize = CELL_SIZE * SLOT_SIZE_RATIO;
        transform.setContentSize(slotSize, slotSize);

        const gfx = node.addComponent(Graphics);
        drawSlotMat(gfx, locked);

        return node;
    }


    /** 重绘某个建造点（用于解锁后由灰变亮） */
    private redrawSlot(index: number, locked: boolean): void {
        const node = this.slotNodes[index];
        if (!node) return;
        const gfx = node.getComponent(Graphics);
        if (!gfx) return;
        drawSlotMat(gfx, locked);
    }

    /** 根据占用/锁定状态同步地基显示，修复拖拽异常导致的空格隐藏。 */
    private refreshSlotVisuals(): void {
        for (let i = 0; i < this.slotNodes.length; i++) {
            const node = this.slotNodes[i];
            if (!node) continue;
            node.active = !this.slotOccupied[i];
            if (!this.slotOccupied[i]) this.redrawSlot(i, this.lockedSlots[i]);
        }
    }

    /** 返回点击位置命中的建造点索引（距离阈值内），未命中返回 -1 */
    private findSlotAt(local: Vec3): number {
        let best = -1;
        let bestDist = CELL_SIZE * 0.5;
        for (let i = 0; i < this.slotPositions.length; i++) {
            const d = Vec3.distance(local, this.slotPositions[i]);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    /** 用锤子卡敲开锁定格 */
    private useHammer(index: number): void {
        if (!this.lockedSlots[index] || this.slotOccupied[index]) return;
        this.lockedSlots[index] = false;
        this.redrawSlot(index, false);
        if (this.statusLabel) this.statusLabel.string = `已敲开格 ${index + 1}，可放塔`;
        this.refreshHandCardUsability();   // 敲开灰格后刷新手牌可用性（锤子/塔卡可能转为可用）
    }

    /** 取改造卡对应的 modifierId（从 effects 的 addModifier 参数解析） */
    private modifierIdOf(cardId: string): string | null {
        const def = DRAW_CARDS.find(c => c.id === cardId);
        const eff = def?.effects.find(e => e.effectType === 'addModifier');
        const id = eff?.parameters?.modifierId;
        return id !== undefined ? String(id) : null;
    }

    /** 取改造卡配置；后续新增改造卡只要在注册表配置 modifierId 即可复用。 */
    private modifierDefOfCard(cardId: string) {
        const modId = this.modifierIdOf(cardId);
        return modId ? TOWER_MODIFIERS.find(m => m.id === modId) ?? null : null;
    }

    /** 某座塔是否能作为这张改造卡的目标。 */
    private isTowerCompatibleWithModifier(tower: TowerRuntime, cardId: string): boolean {
        const modDef = this.modifierDefOfCard(cardId);
        if (!modDef) return false;
        const keyTowerId = modDef.towerId ?? tower.def.id;
        if (this.runBuild.modifierStacksOf(keyTowerId, modDef.id) >= modDef.maxStacks) return false;
        if (modDef.towerId) return tower.def.id === modDef.towerId;
        return (modDef.compatibleAttackTypes?.indexOf(tower.def.attack.attackType) ?? -1) >= 0;
    }

    /** 改造卡是否还有可落地的有效目标；用于牌池过滤和手牌置灰。 */
    private hasCompatibleModifierTarget(cardId: string): boolean {
        return this.towers.some(t => this.isTowerCompatibleWithModifier(t, cardId));
    }

    /**
     * 改造卡应用到本局同类塔状态。
     * 返回是否成功生效：失败时（拖到不兼容的塔）返回 false，卡牌退回手牌。
     */
    private applyModifierToTower(tower: TowerRuntime, modId: string): boolean {
        const modDef = TOWER_MODIFIERS.find(m => m.id === modId);
        if (!modDef) {
            if (this.statusLabel) this.statusLabel.string = `未知改造：${modId}`;
            return false;
        }
        const keyTowerId = modDef.towerId ?? tower.def.id;
        const ok = modDef.towerId
            ? tower.def.id === modDef.towerId
            : ((modDef.compatibleAttackTypes?.indexOf(tower.def.attack.attackType) ?? -1) >= 0);
        if (!ok) {
            const need = modDef.towerId
                ? (this.TOWER_REGISTRY.find(t => t.id === modDef.towerId)?.name ?? modDef.towerId)
                : `${modDef.compatibleAttackTypes?.join('/')} 类塔`;
            if (this.statusLabel) this.statusLabel.string = `${modDef.name} 只能用于 ${need}`;
            return false;
        }
        if (this.runBuild.addTowerModifier(keyTowerId, modId, modDef.maxStacks)) {
            this.refreshTowerBadges(keyTowerId);
            if (modId === 'double_straw') this.refreshDoubleStrawMarkers(keyTowerId);
            const name = this.TOWER_REGISTRY.find(t => t.id === keyTowerId)?.name ?? keyTowerId;
            if (this.statusLabel) this.statusLabel.string = `${modDef.name} 已生效（本局所有${name}）`;
            return true;
        }
        if (this.statusLabel) this.statusLabel.string = `${modDef.name} 已拥有`;
        return false;
    }

    // ============================================================
    //  卡牌系统：抽卡 / 手牌 UI / 拖放使用
    // ============================================================

    /** 玩家支付金币抽 5 张卡（满足构成规则），进入用卡阶段 */
    private drawCards(): void {
        if (this.cardMode) {
            if (this.statusLabel) this.statusLabel.string = '请先用完当前手牌';
            return;
        }
        const drawCost = this.currentDrawCost();
        if (this.gold < drawCost) {
            if (this.statusLabel) this.statusLabel.string = `金币不足，需要 ${drawCost}`;
            return;
        }

        // 先生成手牌，确认候选池非空后再扣金币（避免牌池异常时白白扣金币并进入空手牌）
        const nextHand = this.buildHandCards();
        if (nextHand.length === 0) {
            console.error('[drawCards] 候选牌池为空，已取消抽卡');
            if (this.statusLabel) this.statusLabel.string = '牌池配置异常，本次未扣金币';
            return;
        }

        this.gold -= drawCost;
        this.handCards = nextHand;
        this.updateGoldLabel();

        this.usedCardCount = 0;
        this.cardMode = true;
        this.drawCount++;
        this.playtest.recordDraw(
            this.currentWave,
            drawCost,
            this.gold,
            this.handCards.map(card => ({
                id: card.sourceId,
                name: card.name,
                kind: card.kind,
                towerId: card.towerId,
            })),
        );
        this.showHandCards();
        this.refreshSpendButton();   // 按钮切换为「结束选牌」
        if (this.statusLabel) {
            this.statusLabel.string = `选牌中：已用 0/${SceneInitializer.MAX_CARD_USES_PER_DRAW}，剩余${this.handCards.length}张｜点击底部按钮可结束`;
        }
    }

    /** 按规则构建 5 张手牌 */
    private buildHandCards(): CardDef[] {
        // 开局 currentWave 为 0，但卡牌 minWave 最低为 1；用 evaluationWave 统一评估，避免开局全部被波次条件排除
        const evaluationWave = Math.max(1, this.currentWave);
        const snap = this.buildSnapshot();
        snap.currentWave = evaluationWave;
        const hasLocked = this.lockedSlots.some(l => l);

        // 候选卡：按新数据层条件过滤（波次/次数/前置/互斥/场景）
        const candidates = DRAW_CARDS.filter(c => {
            if (evaluationWave < c.minWave) return false;
            if (c.maxWave !== undefined && evaluationWave > c.maxWave) return false;
            if (this.runBuild.drawStacksOf(c.id) >= c.maxStacks) return false;
            if (!meetsUnlock(c, snap)) return false;
            if (triggersExclude(c, snap)) return false;
            if (c.contentType === 'modifier' && !this.hasCompatibleModifierTarget(c.id)) return false;
            // 改造/战术卡的目标条件（如仅某类塔在场时入池）
            if (c.targetConditions.length > 0 && !meetsUnlock({ unlockConditions: c.targetConditions }, snap)) return false;
            return true;
        });

        // 锤子数量（0 或 1）：最多一张；无锁定格则退出牌池并清零计数
        let hammerCount = 0;
        if (hasLocked) {
            const usable = this.slotPositions.filter((_, i) => !this.slotOccupied[i] && !this.lockedSlots[i]).length;
            if (usable === 0) {
                hammerCount = 1;   // 兜底：无可用位置且可能无锤子时强制给锤子
            } else if (this.drawsWithoutShovel >= 2) {
                hammerCount = 1;   // 连续两轮未出锤子 → 第三轮强制出
            } else if (Math.random() < 0.4) {
                hammerCount = 1;
            }
        }

        const towerCount = 5 - hammerCount;
        const result: CardDef[] = [];
        const usedSourceIds = new Set<string>();  // 同手牌去重

        // 开局保底：仅第一次抽牌给1个入口塔+1个充电宝
        const towerCands = candidates.filter(c => c.contentType === 'tower');
        if (this.drawCount < 1 && towerCount >= 3) {
            // 从3个流派入口中随机选1个
            const entryTowers = ['bubble_tea_straw', 'poison', 'slow'];
            const chosenId = entryTowers[Math.floor(Math.random() * entryTowers.length)];
            const c = towerCands.find(x => x.towerId === chosenId);
            if (c) {
                result.push(this.makeCardFromDef(c));
                usedSourceIds.add(c.id);
            }
            // 保底1个通用辅助塔（充电宝）
            const powerbank = towerCands.find(x => x.towerId === 'powerbank');
            if (powerbank) {
                result.push(this.makeCardFromDef(powerbank));
                usedSourceIds.add(powerbank.id);
            }
        }
        // 补足剩余：从候选加权随机（含 tower/tool/modifier/tactic），同手牌禁止重复 sourceId
        while (result.length < towerCount) {
            if (candidates.length === 0) break;
            const pool = candidates
                .filter(c => !usedSourceIds.has(c.id))
                .map(c => {
                    // 改造卡权重：仅当本流派尚无任何改造时才启用 weightRules
                    let rules = c.weightRules;
                    if (c.contentType === 'modifier' && c.towerId) {
                        const towerMods = this.runBuild.towerModifierStacks[c.towerId];
                        const hasModForThisTower = towerMods && Object.keys(towerMods).length > 0;
                        if (hasModForThisTower) rules = [];
                    }
                    return { c, w: computeWeight({ baseWeight: c.baseWeight, weightRules: rules }, snap) };
                });
            const total = pool.reduce((s, x) => s + Math.max(0, x.w), 0);
            if (total <= 0) break;
            let r = Math.random() * total;
            let pick = pool[0].c;
            for (const x of pool) { r -= Math.max(0, x.w); if (r <= 0) { pick = x.c; break; } }
            result.push(this.makeCardFromDef(pick));
            usedSourceIds.add(pick.id);
        }

        if (hammerCount > 0) {
            const hammer = candidates.find(c => c.contentType === 'tool' && c.targetType === 'lockedTile');
            result.push(hammer ? this.makeCardFromDef(hammer)
                : { sourceId: 'hammer', kind: 'hammer', name: '锤子', desc: '敲开一个灰色格', color: new Color(200, 200, 210, 255) });
        }

        // 锤子计数规则：有灰格且本轮没出锤子 → +1；出了锤子 → 0；无灰格 → 0（退出牌池）
        if (!hasLocked) {
            this.drawsWithoutShovel = 0;
        } else if (hammerCount > 0) {
            this.drawsWithoutShovel = 0;
        } else {
            this.drawsWithoutShovel++;
        }
        // 打乱顺序（避免锤子总在末尾）
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /** DrawCardDefinition → 渲染用 CardDef（kind 映射：tool→hammer） */
    private makeCardFromDef(c: DrawCardDefinition): CardDef {
        return {
            sourceId: c.id,
            kind: c.contentType === 'tool' ? 'hammer' : c.contentType,
            towerId: c.towerId,
            name: c.name,
            desc: c.description,
            color: this.cardColor(c),
        };
    }

    /** 按 contentType 解析卡牌渲染颜色 */
    private cardColor(c: DrawCardDefinition): Color {
        if (c.contentType === 'tower' && c.towerId) {
            const def = this.TOWER_REGISTRY.find(t => t.id === c.towerId);
            if (def) return def.color;
        }
        if (c.contentType === 'tool') return new Color(200, 200, 210, 255);
        if (c.contentType === 'modifier') return new Color(255, 160, 60, 255);
        if (c.contentType === 'tactic') return new Color(60, 200, 220, 255);
        return new Color(150, 150, 150, 255);
    }

    /** 显示手牌 5 张（复用预建卡槽，横向排列于卡牌栏） */
    private showHandCards(): void {
        this.clearHandCards();
        console.log(`[showHandCards] 开始建卡 handCards=${this.handCards.length}, CARD_BAR_Y=${this.CARD_BAR_Y}, slots=${this.handCardSlots.length}`);
        for (let i = 0; i < this.handCards.length && i < this.handCardSlots.length; i++) {
            try {
                const node = this.handCardSlots[i].node;
                node.active = true;   // 先激活，再绘制（微信端 Graphics 需在 active 节点上绘制才提交几何）
                this.applyHandCardData(i, this.handCards[i]);
                this.handCardNodes.push(node);
                const wp = node.getWorldPosition();
                console.log(`[showHandCards] 卡${i}(${this.handCards[i].kind}/${this.handCards[i].name}) active=${node.active} worldPos=(${wp.x.toFixed(1)},${wp.y.toFixed(1)})`);
            } catch (err) {
                console.error(`[showHandCards] 卡${i} 刷新失败:`, err);
            }
        }
        this.repositionHandCards();
        this.refreshHandCardUsability();
        console.log(`[showHandCards] 完成 handCardNodes=${this.handCardNodes.length}`);
        // 发牌即全不可用（如棋盘已满/无对应塔）：直接结束本轮，避免遗留死手牌
        if (this.cardMode && this.handCards.length > 0 && !this.hasUsableCardRemaining()) {
            console.log('[showHandCards] 全部不可用，自动结束选牌');
            this.finishCardSelection();
        }
    }

    /** 刷新每张手牌的可用态：不可用→降低透明度 + 显示「当前不可用」标签。
     *  注意：不再因「剩余牌全部不可用」而自动结束本轮——用掉一张不应清掉其余手牌，
     *  剩余不可用牌保持置灰，玩家可继续用第 2 张或点底部按钮结束。 */
    private refreshHandCardUsability(): void {
        for (let i = 0; i < this.handCardNodes.length; i++) {
            const node = this.handCardNodes[i];
            const card = this.handCards[i];
            if (!card) continue;
            const usable = this.isHandCardUsable(card);
            // 修复：Cocos 3.8.8 数字参数 setScale 必须传入 x、y、z，单参数会导致缩放矩阵异常、卡牌不可见
            const scale = usable ? 1 : 0.9;
            node.setScale(scale, scale, 1);
            // 透明度通过 UIOpacity 控制（直接写 node.opacity 在 3.8 无效）
            const opacity = node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = usable ? 255 : 115;
            const lbl = node.getChildByName('Unusable');
            if (lbl) lbl.active = !usable;
        }
    }

    /** 一次性创建一个手牌卡槽结构（节点 + Graphics + 三个 Label），默认隐藏，供复用。
     *  注意：创建时先 active=true 画一次占位图形再隐藏——微信端 Graphics 在 inactive
     *  节点上绘制的几何不会提交，必须先在 active 状态下绘制（对齐 Buff 卡能正常显示的模式）。 */
    private buildHandCardSlot(index: number): void {
        const node = new Node(`HandCardSlot_${index}`);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(96, 116);
        node.setParent(this.node);
        node.active = true;
        const gfx = node.addComponent(Graphics);
        // 占位绘制（active 状态下提交几何，避免微信端不渲染）
        gfx.fillColor = new Color(40, 44, 60, 245);
        gfx.roundRect(-48, -58, 96, 116, 10);
        gfx.fill();
        gfx.strokeColor = new Color(200, 200, 210, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-48, -58, 96, 116, 10);
        gfx.stroke();
        gfx.fillColor = new Color(150, 150, 150, 255);
        // 占位圆跟随图标新位置（y 26、尺寸 26），半径由 11 缩到 8
        gfx.circle(0, 26, 8);
        gfx.fill();
        node.active = false;

        // 图标：38→26 并上移到 y=26（原 y=-1）。
        // 目的：把卡片上部空间让给描述区。配合名称字号 15→13、描述字号 10→9（行高 13→12），
        // 描述区高度 42→50，可容行数 3 行 → 4 行。
        // 尺寸由 UITransform 控制（Sprite 为 CUSTOM 模式，跟随节点尺寸），改此处即可生效。
        const iconNode = VisualFactory.createCardIcon(node, 26, 0, 26);

        const nameNode = new Node('Name');
        nameNode.layer = Layers.Enum.UI_2D;
        const nameTransform = nameNode.addComponent(UITransform);
        // 名称：随图标下移到 y=4（原 38），高度 22→16，字号 15→13（行高 16）。
        // 仍保留 82px 宽度，13 字号可容 6 字，四字塔名（如"杀虫喷雾"）不会换行。
        nameTransform.setContentSize(82, 16);
        nameNode.setParent(node);
        nameNode.setPosition(0, 4, 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.fontSize = 13;
        nameLabel.lineHeight = 16;
        nameLabel.color = new Color(255, 255, 255, 255);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        nameLabel.enableWrapText = true;

        const descNode = new Node('Desc');
        descNode.layer = Layers.Enum.UI_2D;
        const descTransform = descNode.addComponent(UITransform);
        // 描述区：高度 42→50（y=-30），容纳 4 行 = 行高 12 × 4 = 48，留 2px 余量。
        // 区间 [-55, -5]：底边距卡底 3px，顶边与名称下沿（-4）留 1px 间隙，不与图标/名称重叠。
        descTransform.setContentSize(88, 50);
        descNode.setParent(node);
        descNode.setPosition(0, -30, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.fontSize = 9;
        descLabel.lineHeight = 12;
        descLabel.color = new Color(200, 200, 210, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.TOP;
        descLabel.enableWrapText = true;
        // 关键修复：Cocos Label 的 overflow 默认为 NONE，此时 enableWrapText 不会按节点宽度断行，
        // 长描述会单行横向溢出卡片（手牌"时间借贷/杀虫喷雾"等长文案曾整句冲出卡外）。
        // 改为 SHRINK：先按宽度自动换行，行数仍超出时才整体缩小字号兜底，绝不越界。
        descLabel.overflow = Label.Overflow.SHRINK;

        // 卡类型标签（顶部，区分 塔/战术/改造/工具）
        const kindNode = new Node('Kind');
        kindNode.layer = Layers.Enum.UI_2D;
        kindNode.addComponent(UITransform);
        kindNode.setParent(node);
        kindNode.setPosition(0, 47, 0);
        const kindLabel = kindNode.addComponent(Label);
        kindLabel.fontSize = 11;
        kindLabel.color = new Color(255, 255, 255, 255);
        kindLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        kindLabel.verticalAlign = Label.VerticalAlign.CENTER;

        const unusableNode = new Node('Unusable');
        unusableNode.layer = Layers.Enum.UI_2D;
        unusableNode.addComponent(UITransform);
        unusableNode.setParent(node);
        unusableNode.setPosition(0, -53, 0);
        unusableNode.active = false;
        const unusableLabel = unusableNode.addComponent(Label);
        unusableLabel.string = '当前不可用';
        unusableLabel.fontSize = 12;
        unusableLabel.color = new Color(255, 90, 90, 255);
        unusableLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        unusableLabel.verticalAlign = Label.VerticalAlign.CENTER;

        // 透明度由 UIOpacity 控制（Cocos 3.8 直接写 node.opacity 无效）
        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        this.handCardSlots.push({ node, gfx, iconNode, nameLabel, descLabel, kindLabel, unusableNode });
    }

    /** 把某张卡的数据刷到指定卡槽上（重绘 Graphics + 更新文字），供每次抽卡复用 */
    private applyHandCardData(slotIndex: number, card: CardDef): void {
        const slot = this.handCardSlots[slotIndex];
        const gfx = slot.gfx;
        const hasIcon = VisualFactory.setCardIcon(slot.iconNode, card.sourceId);
        gfx.clear();
        gfx.fillColor = new Color(40, 44, 60, 245);
        gfx.roundRect(-48, -58, 96, 116, 10);
        gfx.fill();
        gfx.strokeColor = card.kind === 'hammer' ? new Color(200, 200, 210, 255) : card.color;
        gfx.lineWidth = 3;
        gfx.roundRect(-48, -58, 96, 116, 10);
        gfx.stroke();
        gfx.fillColor = card.color;
        if (card.kind === 'hammer') {
            // 锤子占位图形随图标区上移：图标中心 y=-1 → 26，图形中心同步到 26
            gfx.rect(-7, 20, 14, 12);
            gfx.fill();
        } else if (!hasIcon) {
            // 同上：无贴图时的占位圆对齐新图标位置（y 26、半径 8）
            gfx.circle(0, 26, 8);
            gfx.fill();
        }
        slot.nameLabel.string = card.name;
        slot.descLabel.string = this.formatHandCardDesc(card.desc);
        // 卡类型标签（塔 / 战术(buff) / 改造 / 工具）
        const kindInfo = this.handCardKindInfo(card.kind);
        slot.kindLabel.string = kindInfo.text;
        slot.kindLabel.color = kindInfo.color;
        slot.unusableNode.active = false;
        // 透明度通过 UIOpacity 恢复（直接写 node.opacity 在 3.8 无效）
        const opacity = slot.node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;
        slot.node.setScale(1, 1, 1);
    }

    /** 手牌类型标签（文字 + 颜色），用于前端区分 塔 / 战术(buff) / 改造 / 工具 */
    private handCardKindInfo(kind: CardDef['kind']): { text: string; color: Color } {
        switch (kind) {
            case 'tower': return { text: '塔', color: new Color(120, 220, 130, 255) };
            case 'tactic': return { text: '战术', color: new Color(170, 130, 255, 255) };
            case 'modifier': return { text: '改造', color: new Color(255, 170, 80, 255) };
            case 'hammer': return { text: '工具', color: new Color(200, 200, 210, 255) };
            default: return { text: '', color: new Color(255, 255, 255, 255) };
        }
    }

    /**
     * 手牌描述断行：优先按"整句"断（；。！？），其次才退化为按逗号断。
     *
     * 旧实现对每个「：，、」都插换行，导致"立即获得150金币；随后2波的击杀与波次收益归零"
     * 被切成 5 段语义破碎的短行（数字和它的量词被强行分开），可读性反而更差。
     * 新逻辑：先按整句断开；只有当整句仍然很长（>12 字，装不进卡片宽度）时，
     * 才在该句内部按逗号二次断行，保证每片都是完整的语义单元。
     */
    private formatHandCardDesc(desc: string): string {
        const sentences = desc
            .split(/(?<=[；。！？])/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const pieces: string[] = [];
        for (const sentence of sentences) {
            if (sentence.length <= 12) {
                pieces.push(sentence);
                continue;
            }
            // 整句过长：按逗号/顿号二次断行，同样只断在标点之后，保留语义完整
            const sub = sentence
                .split(/(?<=[，、：])/)
                .map(s => s.trim())
                .filter(s => s.length > 0);
            pieces.push(...(sub.length > 0 ? sub : [sentence]));
        }

        return pieces
            .join('\n')
            .replace(/\n\s+/g, '\n')
            .replace(/\n{2,}/g, '\n')
            .trim();
    }

    /** 重排手牌位置（抽卡后 / 用掉一张后）。窄屏（FIXED_HEIGHT 裁宽）时整体等比缩小，保证 5 张卡全部落在可见宽度内 */
    private repositionHandCards(): void {
        const n = this.handCardNodes.length;
        if (n === 0) return;
        const gap = 108;
        const cardW = 96;
        const margin = 8;
        const span = (n - 1) * gap + cardW;                       // 未缩放时的总占位宽度
        const avail = this._visibleSize.width - margin * 2;       // 实际可见宽度（设计单位）
        const s = Math.min(1, avail / span);
        this.handCardScale = s;
        for (let i = 0; i < n; i++) {
            const node = this.handCardNodes[i];
            node.setScale(s, s, 1);
            node.setPosition((i - (n - 1) / 2) * gap * s, this.CARD_BAR_Y, 0);
        }
    }

    private clearHandCards(): void {
        // 复用卡槽：只隐藏，不销毁（避免动态建/毁 Graphics）
        for (const slot of this.handCardSlots) slot.node.active = false;
        this.handCardNodes = [];
    }

    /** 统一重置卡牌系统（胜利/失败/重开都调用，保证 Canvas 不再残留手牌状态） */
    private resetCardSystem(): void {
        this.clearHandCards();
        this.handCards = [];
        this.cardMode = false;
        this.usedCardCount = 0;
        this.drawCount = 0;
        this.drawsWithoutShovel = 0;   // 重开清零连续未出锤子计数
        this.cancelCardDrag();   // cardGhost.active=false + dragCardIndex=-1 + isDragging=false
        this.refreshSpendButton();
    }

    /** 移除指定手牌（使用成功后）并重排（复用卡槽：只隐藏不销毁） */
    private removeHandCard(index: number): void {
        // 找到对应卡槽并隐藏（不复用 destroy，保留预建节点）
        const removedNode = this.handCardNodes[index];
        if (removedNode) removedNode.active = false;
        this.handCardNodes.splice(index, 1);
        this.handCards.splice(index, 1);
        this.repositionHandCards();
    }

    /** 命中检测：点击位置命中的手牌索引，未命中返回 -1 */
    private findHandCardAt(local: Vec3): number {
        for (let i = 0; i < this.handCardNodes.length; i++) {
            const p = this.handCardNodes[i].getPosition();
            if (Math.abs(local.x - p.x) <= 48 * this.handCardScale
                && Math.abs(local.y - p.y) <= 58 * this.handCardScale) return i;
        }
        return -1;
    }

    /** 找最近的可放置格（未占且未锁） */
    private findNearestUsableSlot(local: Vec3): number {
        let best = -1;
        let bestDist = 80;
        for (let i = 0; i < this.slotPositions.length; i++) {
            if (this.slotOccupied[i] || this.lockedSlots[i]) continue;
            const d = Vec3.distance(local, this.slotPositions[i]);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    /** 找落点命中的已有塔索引（距离阈值内），未命中返回 -1 */
    private findTowerAt(local: Vec3): number {
        let best = -1;
        let bestDist = 40;
        for (let i = 0; i < this.towers.length; i++) {
            const distance = Vec3.distance(local, this.towers[i].node.position);
            if (distance < bestDist) {
                best = i;
                bestDist = distance;
            }
        }
        return best;
    }

    /** 升级一座塔（star+1，二星随机词缀），刷新徽章/特效/状态（不负责移除被合并塔） */
    private upgradeTower(targetTower: TowerRuntime): void {
        targetTower.star += 1;
        this.playtest.recordOperation('tower_upgraded', { towerId: targetTower.def.id, star: targetTower.star });
        if (targetTower.star === 2) {
            const affixes = TOWER_AFFIXES[targetTower.def.id] ?? [];
            targetTower.affix = affixes.length > 0
                ? affixes[Math.floor(Math.random() * affixes.length)].id
                : null;
        }
        this.setTowerBadge(targetTower);
        this.resetThrust(targetTower);   // 升星/融合后复位吸管
        this.resetSpin(targetTower);     // 同步复位旋斩
        EffectManager.instance?.playExplosion(targetTower.node.position.clone(), 50);
        if (this.statusLabel) this.statusLabel.string = `${targetTower.def.name} 升级到 ${targetTower.star} 星！`;
        console.log(`塔升级合并: ${targetTower.def.id} → ${targetTower.star}星`);
        // 合并/升级成功：若升级的正是 BOSS 锁定塔，立即清除倒计时与锁定视觉（解除应对）
        if (this.bossLockedTower === targetTower) this.clearBossLock();
        this.refreshHandCardUsability();   // 升星后同型一星塔减少，刷新剩余手牌可用性
    }

    /** 绘制拖动手牌幽灵 */
    private drawCardGhost(card: CardDef): void {
        const gfx = this.cardGhostGfx!;
        gfx.clear();
        gfx.fillColor = new Color(card.color.r, card.color.g, card.color.b, 160);
        if (card.kind === 'hammer') {
            gfx.rect(-12, -8, 24, 18);
            gfx.fill();
        } else {
            gfx.circle(0, 0, 20);
            gfx.fill();
        }
    }

    /** 卡牌拖动松手：判定落点使用；无效位置则取消（卡回到手牌） */
    private handleCardDrop(event: EventTouch): void {
        const local = this.eventToGameLocal(event);
        const ci = this.dragCardIndex;
        const card = this.handCards[ci];
        let used = false;
        let usedTarget = '';
        // 拖动了「当前不可用」的牌：不允许使用，松手即复位回牌面
        if (!this.isHandCardUsable(card)) {
            if (this.statusLabel) this.statusLabel.string = '该卡当前不可用，已退回手牌';
            this.cardGhost!.active = false;
            this.isDragging = false;
            this.dragCardIndex = -1;
            return;
        }
        if (card.kind === 'tower') {
            const def = this.TOWER_REGISTRY.find(t => t.id === card.towerId)!;
            // 1) 落点命中已有塔 → 尝试升级
            const towerIdx = this.findTowerAt(local);
            if (towerIdx >= 0) {
                const target = this.towers[towerIdx];
                if (target.def.id !== def.id) {
                    if (this.statusLabel) this.statusLabel.string = '类型不同，无法用该卡升级';
                } else if (target.star >= SceneInitializer.MAX_STAR) {
                    if (this.statusLabel) this.statusLabel.string = '该塔已满星，无法继续升级';
                } else {
                    this.upgradeTower(target);  // 卡牌即消耗，不二次扣费（升级锁定塔时内部立即清除 BOSS 锁定）
                    used = true;
                    usedTarget = `升级${target.def.name}`;
                }
            } else {
                // 2) 落点在空格 → 新建塔
                const slot = this.findNearestUsableSlot(local);
                if (slot >= 0) {
                    this.placeTower(slot, def, 0); used = true;  // 卡牌放置不再二次扣费（抽卡时已付）
                    usedTarget = `格${slot + 1}`;
                } else {
                    // 3) 命中灰色（锁定）坑位：提示并自动复位卡牌
                    const hit = this.findSlotAt(local);
                    if (hit >= 0 && this.lockedSlots[hit]) {
                        if (this.statusLabel) this.statusLabel.string = '坑位还未敲开（用锤子卡敲开）';
                    }
                }
            }
        } else if (card.kind === 'hammer') {
            const slot = this.findSlotAt(local);
            if (slot >= 0 && this.lockedSlots[slot]) {
                this.useHammer(slot);
                used = true;
                usedTarget = `解锁格${slot + 1}`;
            }
        } else if (card.kind === 'modifier') {
            // 改造卡：拖到一座塔上 → 校验并写入本局同类塔改造状态
            const towerIdx = this.findTowerAt(local);
            if (towerIdx >= 0) {
                const modId = this.modifierIdOf(card.sourceId);
                if (modId) {
                    const applied = this.applyModifierToTower(this.towers[towerIdx], modId);
                    if (applied) {
                        this.runBuild.recordDrawCard(card.sourceId);   // 计入抽卡，获得后退出牌池
                        used = true;
                        usedTarget = this.towers[towerIdx].def.name;
                    }
                }
            }
        } else if (card.kind === 'tactic') {
            // 战术卡：即时战场效果（落点用于定位，如胶带减速区中心）
            this.lastCardDropPos = local.clone();
            const def = DRAW_CARDS.find(c => c.id === card.sourceId);
            if (def && this.isTacticDropValid(def, local)) {
                executeEffects(def.effects, this.effectContext());
                used = true;
                usedTarget = `战场(${Math.round(local.x)},${Math.round(local.y)})`;
            }
        }
        this.cardGhost!.active = false;
        this.isDragging = false;
        this.dragCardIndex = -1;
        if (used) {
            this.playtest.recordCardUsed({ id: card.sourceId, name: card.name, kind: card.kind }, usedTarget || '未知目标');
            this.removeHandCard(ci);
            this.usedCardCount++;
            this.refreshPlaytestBuildMilestones();
            this.refreshHandCardUsability();
            // 仅用满上限（2 张）才自动结束；剩余牌即使当前不可用也保留（置灰），
            // 玩家可继续用第 2 张或点底部按钮结束，不再因「剩余全不可用」清掉整手牌
            if (this.usedCardCount >= SceneInitializer.MAX_CARD_USES_PER_DRAW) {
                this.finishCardSelection();
            }
            // 注：手牌阶段状态栏由 update() 固定写入，这里不再写临时提示，避免被每帧冲刷
        }
        // 未 used：松手在无效位置 → 卡回到手牌（取消选择），不改变状态
    }

    private isTacticDropValid(def: DrawCardDefinition, local: Vec3): boolean {
        for (const effect of def.effects) {
            if (effect.effectType !== 'custom' || effect.effectId !== 'groundSlowZone') continue;
            const radius = Number(effect.parameters?.radius ?? 80);
            if (!this.isCircleInsideBattlefield(local, radius)) {
                if (this.statusLabel) this.statusLabel.string = '胶带必须放在战场范围内';
                return false;
            }
        }
        return true;
    }

    private isCircleInsideBattlefield(pos: Vec3, radius: number): boolean {
        const halfW = MAP_DESIGN_WIDTH / 2;
        const halfH = MAP_DESIGN_HEIGHT / 2;
        return pos.x - radius >= -halfW
            && pos.x + radius <= halfW
            && pos.y - radius >= -halfH
            && pos.y + radius <= halfH;
    }



    /** 地图调试框：黄色边框，标示 BattleRoot 边界，作为 BattleRoot 子节点随地图整体等比缩放 */
    private drawMapDebugFrame(parent: Node): void {
        const node = new Node('MapDebugFrame');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(parent);
        const gfx = node.addComponent(Graphics);
        gfx.lineWidth = 3;
        gfx.strokeColor = new Color(255, 220, 60, 255);
        gfx.rect(-MAP_DESIGN_WIDTH / 2, -MAP_DESIGN_HEIGHT / 2, MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
        gfx.stroke();
    }

    /** 6×8 调试网格：随 BattleRoot 整体缩放，显示行列分隔线与每格 (col,row) 坐标 */
    private drawGridDebug(parent: Node): void {
        const node = new Node('GridDebug');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(parent);
        const gfx = node.addComponent(Graphics);
        gfx.lineWidth = 1;
        gfx.strokeColor = new Color(120, 200, 255, 110);
        const halfW = MAP_DESIGN_WIDTH / 2;
        const halfH = MAP_DESIGN_HEIGHT / 2;
        for (let c = 0; c <= GRID_COLS; c++) {
            const x = -halfW + c * CELL_SIZE;
            gfx.moveTo(x, -halfH);
            gfx.lineTo(x, halfH);
        }
        for (let r = 0; r <= GRID_ROWS; r++) {
            const y = halfH - r * CELL_SIZE;
            gfx.moveTo(-halfW, y);
            gfx.lineTo(halfW, y);
        }
        gfx.stroke();

        // 每格中心标注 (col,row)
        for (let c = 0; c < GRID_COLS; c++) {
            for (let r = 0; r < GRID_ROWS; r++) {
                const cell = gridToLocal({ col: c, row: r });
                const lbl = new Node(`G_${c}_${r}`);
                lbl.layer = Layers.Enum.UI_2D;
                const lt = lbl.addComponent(UITransform);
                lt.setContentSize(50, 20);
                lbl.setParent(node);
                lbl.setPosition(cell.x, cell.y);
                const lab = lbl.addComponent(Label);
                lab.string = `${c},${r}`;
                lab.fontSize = 12;
                lab.color = new Color(180, 220, 255, 150);
                lab.horizontalAlign = Label.HorizontalAlign.CENTER;
                lab.verticalAlign = Label.VerticalAlign.CENTER;
            }
        }
    }

    // ============================================================
    //  定向合并 + 弱随机词缀
    // ============================================================

    /** 解析单塔有效属性：结合全局 roguelike buff + 二星固定强化 + 随机词缀 */
    private getTowerParams(tower: TowerRuntime): TowerParams {
        return TowerParamResolver.resolve(tower, this.towerStats, this.runBuild);
    }

    private towerDamageSource(
        tower: TowerRuntime,
        mechanismId: string,
        mechanismName: string,
        flags: Pick<DamageAttribution, 'isCrit' | 'isOverload'> = {},
    ): DamageAttribution {
        return {
            sourceType: 'tower',
            sourceId: tower.def.id,
            sourceName: tower.def.name,
            towerId: tower.def.id,
            towerName: tower.def.name,
            mechanismId,
            mechanismName,
            ...flags,
        };
    }

    private buildDamageSource(
        sourceId: string,
        sourceName: string,
        towerId: string | undefined,
        towerName: string | undefined,
        mechanismId: string,
        mechanismName: string,
    ): DamageAttribution {
        return {
            sourceType: 'mechanism', sourceId, sourceName, towerId, towerName,
            mechanismId, mechanismName,
        };
    }

    /** 统一扣血入口：应用易伤后，仅记录真正扣掉的生命值，排除溢出伤害。 */
    private damageEnemy(e: EnemyRuntime, amount: number, source?: DamageAttribution, activeSeconds = 0): void {
        const beforeHp = Math.max(0, e.hp);
        // 咖啡因过载：BOSS 波塔伤害提升 / 非 BOSS 波塔伤害惩罚（归因记录含此倍率）
        const isTowerSrc = source?.sourceType === 'tower';
        const bossWaveMul = (this.waveHasBoss && this.towerStats.bossWaveDamageBonus > 0 && isTowerSrc)
            ? 1 + this.towerStats.bossWaveDamageBonus
            : 1;
        const nonBossWaveMul = (!this.waveHasBoss && this.towerStats.nonBossWaveDamagePenalty > 0 && isTowerSrc)
            ? Math.max(0, 1 - this.towerStats.nonBossWaveDamagePenalty)
            : 1;
        // 透支供电：本波全体塔伤害加成（波末以降星 + 下波衰减偿还）
        const overdraftMul = (this.overdraftDamageBonus > 0 && isTowerSrc)
            ? 1 + this.overdraftDamageBonus
            : 1;
        // 透支供电衰减期：透支后的下一波全体塔伤害降低（可逆，一波后自动恢复）
        const overdraftFatigueMul = (this.overdraftFatigueWaves > 0 && isTowerSrc)
            ? Math.max(0, 1 - this.OVERDRAFT_FATIGUE_PENALTY)
            : 1;
        const applied = Math.max(0, amount) * bossWaveMul * nonBossWaveMul * overdraftMul * overdraftFatigueMul * (e.vulnerable > 0 ? e.vulnerable : 1);
        e.hp -= applied;
        const effectiveDamage = Math.min(beforeHp, applied);
        const isBoss = e.type === EnemyType.BOSS;
        const killed = beforeHp > 0 && e.hp <= 0;
        // 记录最后击打者：回收齿轮等「按塔结算」的效果依赖此归因，
        // 若伤害来自塔则记录塔 id，非塔伤害（毒/环境等）不清空已有归属
        if (isTowerSrc && source?.sourceId) {
            e.lastHitTowerId = source.sourceId;
        }
        this.playtest.recordDamage(source ?? {
            sourceType: 'unknown', sourceId: 'unknown', sourceName: '未归因伤害',
            mechanismId: 'unknown', mechanismName: '未归因',
        }, effectiveDamage, isBoss, killed, isBoss ? Math.max(0, e.hp / e.maxHp) : undefined, activeSeconds);
        if (isBoss) this.updateBossHpRing(e);
    }

    /** 减速塔瞬间效果（受二星 + 词缀影响） */
    private applyTowerEffect(tower: TowerRuntime, enemy: EnemyRuntime, p: TowerParams): void {
        enemy.slowMultiplier = Math.min(enemy.slowMultiplier, p.slowMultiplier);
        enemy.slowTimer = Math.max(enemy.slowTimer, p.slowDuration);
        if (p.vulnerable > 1) {
            enemy.vulnerable = Math.max(enemy.vulnerable, p.vulnerable);
            enemy.vulnerableTimer = Math.max(enemy.vulnerableTimer, p.slowDuration);
        }
        EffectManager.instance?.playSlow(enemy.node);
    }

    /** 杀虫喷雾施毒（受二星 + 词缀影响） */
    private applyPoisonFromTower(tower: TowerRuntime, enemy: EnemyRuntime, p: TowerParams, dpsScale = 1): void {
        this.applyPoisonToEnemy(
            enemy,
            p.poisonDps * dpsScale,
            p.poisonDuration,
            this.towerDamageSource(tower, 'poison_dot', '中毒持续伤害'),
        );
    }

    /** 通用施毒：杀虫喷雾、弹射毒改造、传染都走同一套刷新/取强规则。 */
    private applyPoisonToEnemy(enemy: EnemyRuntime, dps: number, dur: number, source?: DamageAttribution): void {
        const existing = enemy.buffs['poison'];
        if (existing) {
            existing.timer = dur;
            if (dps >= existing.dps) {
                existing.dps = dps;
                if (source) existing.damageSource = source;
            }
        } else {
            enemy.buffs['poison'] = { timer: dur, dps, damageSource: source };
        }
        EffectManager.instance?.playPoison(enemy.node, dur);
    }

    /** 毒爆：本局获得 poison_burst 后，中毒敌人死亡会对附近敌人造成一次小范围伤害。 */
    private triggerPoisonBurst(dead: EnemyRuntime): void {
        const mod = this.runBuild.towerModifiersOf('poison').find(m => m.id === 'poison_burst');
        if (!mod) return;
        const ts = this.towerStats;
        const damage = (mod.changes.poisonExplosionDamage ?? 0) * (1 + ts.poisonBurstDamageBonus);
        const radius = (mod.changes.poisonExplosionRadius ?? 0) * (1 + ts.poisonBurstRadiusBonus);
        if (damage <= 0 || radius <= 0) return;

        const pos = dead.node.position.clone();
        let hitCount = 0;
        for (const e of this.enemies) {
            if (e === dead || !e.node.isValid || e.hp <= 0) continue;
            if (Vec3.distance(pos, e.node.position) <= radius) {
                hitCount++;
                this.damageEnemy(e, damage, this.buildDamageSource(
                    'poison_burst', '弹射毒爆流', 'poison', '杀虫喷雾',
                    'poison_burst', '毒爆',
                ));
                EffectManager.instance?.playDamageNumber(e.node.position, damage, false);
                if (ts.poisonResidueLevel > 0) {
                    this.applyPoisonToEnemy(
                        e,
                        3 + ts.poisonResidueLevel * 2,
                        3.0,
                        this.buildDamageSource(
                            'poison_residue', '毒液残留', 'poison', '杀虫喷雾',
                            'poison_residue', '残留毒伤',
                        ),
                    );
                }
            }
        }
        this.playtest.recordMechanismTrigger('poison_burst', '毒爆', hitCount);
        EffectManager.instance?.playExplosion(pos, radius);
    }

    /** 传染词缀：中毒敌人死亡时概率把毒传播给附近敌人 */
    private tryContagion(dead: EnemyRuntime): void {
        if (!dead.buffs['poison']) return;
        const source = this.towers.find(t => t.def.id === 'poison' && t.affix === 'contagious');
        if (!source) return;
        if (Math.random() < 0.5) return;  // 50% 概率
        const p = this.getTowerParams(source);
        const radius = 60;
        let spreadCount = 0;
        for (const e of this.enemies) {
            if (e === dead || !e.node.isValid) continue;
            if (Vec3.distance(dead.node.position, e.node.position) <= radius) {
                spreadCount++;
                this.applyPoisonToEnemy(
                    e,
                    p.poisonDps,
                    p.poisonDuration,
                    this.towerDamageSource(source, 'contagion_dot', '传染毒伤'),
                );
            }
        }
        if (spreadCount > 0) this.playtest.recordMechanismTrigger('contagion', '传染', spreadCount);
    }

    /** 更新塔的星级/词缀/改造图形徽章。塔上不放文字，避免小屏信息噪音。 */
    private setTowerBadge(tower: TowerRuntime): void {
        const badge = tower.node.getChildByName('Badge');
        if (!badge) return;
        const g = badge.getComponent(Graphics);
        if (!g) return;
        g.clear();

        this.drawStarBadge(g, tower.star);
        if (tower.affix) this.drawAffixBadge(g, tower.affix);

        const mods = this.runBuild.towerModifiersOf(tower.def.id);
        for (let i = 0; i < mods.length; i++) {
            this.drawModifierBadge(g, mods[i].id, i);
        }
    }

    private drawBadgeDot(g: Graphics, x: number, y: number, r: number, fill: Color, stroke: Color): void {
        g.fillColor = new Color(16, 18, 24, 210);
        g.circle(x, y, r + 2);
        g.fill();
        g.fillColor = fill;
        g.circle(x, y, r);
        g.fill();
        g.strokeColor = stroke;
        g.lineWidth = 1.5;
        g.circle(x, y, r);
        g.stroke();
    }

    private drawMiniStar(g: Graphics, x: number, y: number, r: number): void {
        g.strokeColor = new Color(20, 18, 10, 240);
        g.lineWidth = 1.5;
        g.fillColor = new Color(255, 225, 90, 255);
        g.moveTo(x, y + r);
        for (let i = 1; i < 10; i++) {
            const rr = i % 2 === 0 ? r : r * 0.45;
            const a = Math.PI / 2 + i * Math.PI / 5;
            g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.close();
        g.fill();
        g.stroke();
    }

    /** 左上：星级。 */
    private drawStarBadge(g: Graphics, star: number): void {
        const count = Math.max(1, Math.min(SceneInitializer.MAX_STAR, star));
        for (let i = 0; i < count; i++) {
            const x = -26 + i * 15;
            const y = 27;
            this.drawBadgeDot(g, x, y, 8, new Color(32, 35, 46, 255), new Color(255, 220, 80, 255));
            this.drawMiniStar(g, x, y, 5.8);
        }
    }

    /** 左下：二星合并词缀。 */
    private drawAffixBadge(g: Graphics, affix: AffixId): void {
        const x = -25;
        const y = -25;
        this.drawBadgeDot(g, x, y, 9, new Color(60, 205, 210, 255), new Color(225, 255, 255, 255));
        g.strokeColor = new Color(255, 255, 255, 245);
        g.fillColor = new Color(255, 255, 255, 245);
        g.lineWidth = 2;
        switch (affix) {
            case 'rapid':
                g.moveTo(x - 3, y + 6); g.lineTo(x + 3, y + 1); g.lineTo(x - 1, y + 1); g.lineTo(x + 4, y - 6); g.stroke();
                break;
            case 'heavy':
                g.rect(x - 5, y - 4, 10, 8); g.fill();
                break;
            case 'execute':
                g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y); g.lineTo(x - 5, y + 5); g.close(); g.fill();
                break;
            case 'deepfreeze':
                g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.stroke();
                break;
            case 'linger':
                g.circle(x, y, 5); g.stroke(); g.moveTo(x, y); g.lineTo(x, y + 4); g.moveTo(x, y); g.lineTo(x + 4, y); g.stroke();
                break;
            case 'vulnerable':
                g.circle(x, y, 5); g.stroke(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke();
                break;
            case 'virulent':
                g.circle(x - 3, y, 3); g.circle(x + 3, y + 2, 3); g.circle(x + 2, y - 4, 2); g.fill();
                break;
            case 'persistent':
                g.arc(x, y, 6, Math.PI * 0.2, Math.PI * 1.7, false); g.stroke();
                break;
            case 'contagious':
                g.circle(x - 4, y, 2.5); g.circle(x + 4, y + 3, 2.5); g.circle(x + 3, y - 4, 2.5); g.fill();
                g.moveTo(x - 2, y); g.lineTo(x + 2, y + 2); g.moveTo(x + 2, y + 1); g.lineTo(x + 2, y - 2); g.stroke();
                break;
        }
    }

    /** 右上：本局同类塔改造。多改造时向下堆叠。 */
    private drawModifierBadge(g: Graphics, modifierId: string, index: number): void {
        const x = 25;
        const y = 25 - index * 15;
        this.drawBadgeDot(g, x, y, 9, new Color(255, 150, 65, 255), new Color(255, 235, 190, 255));
        g.strokeColor = new Color(255, 255, 255, 245);
        g.fillColor = new Color(255, 255, 255, 245);
        g.lineWidth = 2;
        if (modifierId === 'double_straw') {
            g.rect(x - 4, y - 6, 3, 12);
            g.rect(x + 2, y - 6, 3, 12);
            g.fill();
        } else if (modifierId === 'split') {
            g.moveTo(x - 6, y - 5); g.lineTo(x, y); g.lineTo(x + 6, y + 5);
            g.moveTo(x, y); g.lineTo(x + 6, y - 5);
            g.stroke();
        } else if (modifierId === 'venom_bounce') {
            g.fillColor = new Color(110, 255, 120, 255);
            g.moveTo(x, y + 7);
            g.bezierCurveTo(x + 6, y + 1, x + 5, y - 6, x, y - 7);
            g.bezierCurveTo(x - 5, y - 6, x - 6, y + 1, x, y + 7);
            g.fill();
        } else if (modifierId === 'poison_burst') {
            g.strokeColor = new Color(120, 255, 120, 255);
            g.lineWidth = 2;
            g.circle(x, y, 3);
            g.stroke();
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3;
                g.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
                g.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
            }
            g.stroke();
        } else if (modifierId === 'core_power') {
            g.fillColor = new Color(255, 235, 85, 255);
            g.moveTo(x - 1, y + 8);
            g.lineTo(x + 5, y + 1);
            g.lineTo(x + 1, y + 1);
            g.lineTo(x + 4, y - 8);
            g.lineTo(x - 5, y + 2);
            g.lineTo(x - 1, y + 2);
            g.close();
            g.fill();
        } else if (modifierId === 'thread_spool') {
            g.strokeColor = new Color(100, 235, 255, 255);
            g.lineWidth = 2;
            g.circle(x, y, 6);
            g.stroke();
            g.strokeColor = new Color(255, 90, 170, 255);
            g.moveTo(x - 8, y - 5);
            g.bezierCurveTo(x - 2, y + 7, x + 2, y - 7, x + 8, y + 5);
            g.stroke();
            g.strokeColor = new Color(255, 230, 90, 255);
            g.moveTo(x - 7, y + 5);
            g.bezierCurveTo(x - 2, y - 5, x + 2, y + 5, x + 7, y - 5);
            g.stroke();
        } else {
            g.moveTo(x, y + 6); g.lineTo(x + 6, y); g.lineTo(x, y - 6); g.lineTo(x - 6, y); g.close(); g.fill();
        }
    }

    /** 刷新某一类型所有塔的徽标（改造生效/重开清理后调用） */
    private refreshTowerBadges(towerId: string): void {
        for (const t of this.towers) {
            if (t.def.id === towerId) this.setTowerBadge(t);
        }
    }

    // ============================================================
    //  单击塔信息面板
    // ============================================================

    /** 懒创建信息面板 */
    private ensureTowerInfoPanel(): void {
        if (this.towerInfoPanel) return;
        const canvas = this.node;
        const panelWidth = 420;
        const panelHeight = 430;
        const panel = new Node('TowerInfoPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        const t = panel.addComponent(UITransform);
        t.setContentSize(panelWidth, panelHeight);
        t.setAnchorPoint(0.5, 0.5);
        const g = panel.addComponent(Graphics);
        g.fillColor = new Color(18, 20, 32, 242);
        g.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
        g.fill();
        g.strokeColor = new Color(120, 200, 255, 255);
        g.lineWidth = 2;
        g.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
        g.stroke();

        const label = new Node('InfoText');
        label.layer = Layers.Enum.UI_2D;
        label.setParent(panel);
        const lt = label.addComponent(UITransform);
        lt.setContentSize(388, 330);
        lt.setAnchorPoint(0.5, 0.5);
        label.setPosition(0, 34, 0);
        const ll = label.addComponent(Label);
        ll.string = '';
        ll.fontSize = 14;
        ll.color = new Color(255, 255, 255, 255);
        ll.lineHeight = 20;
        ll.horizontalAlign = Label.HorizontalAlign.LEFT;
        ll.verticalAlign = Label.VerticalAlign.TOP;
        ll.overflow = Label.Overflow.SHRINK;
        ll.enableWrapText = true;

        const btn = new Node('DismantleButton');
        btn.layer = Layers.Enum.UI_2D;
        btn.setParent(panel);
        btn.setPosition(0, -181, 0);
        const bt = btn.addComponent(UITransform);
        bt.setContentSize(220, 48);
        bt.setAnchorPoint(0.5, 0.5);
        const bg = btn.addComponent(Graphics);
        bg.fillColor = new Color(95, 45, 45, 255);
        bg.roundRect(-110, -24, 220, 48, 8);
        bg.fill();
        bg.strokeColor = new Color(255, 140, 120, 255);
        bg.lineWidth = 2;
        bg.roundRect(-110, -24, 220, 48, 8);
        bg.stroke();

        const btnText = new Node('Text');
        btnText.layer = Layers.Enum.UI_2D;
        btnText.setParent(btn);
        btnText.setPosition(0, 0, 0);
        btnText.addComponent(UITransform).setContentSize(210, 38);
        const bl = btnText.addComponent(Label);
        bl.string = '';
        bl.fontSize = 18;
        bl.lineHeight = 22;
        bl.color = new Color(255, 245, 235, 255);
        bl.horizontalAlign = Label.HorizontalAlign.CENTER;
        bl.verticalAlign = Label.VerticalAlign.CENTER;
        btn.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true;
            this.towerInfoTimer = 5.0;
        });
        btn.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            this.dismantleTowerFromInfo();
        });

        panel.setPosition(0, 130, 0);
        panel.active = false;
        this.towerInfoPanel = panel;
        this.towerInfoPanelLabel = ll;
        this.towerInfoDismantleLabel = bl;
    }

    /** 展示指定塔的信息面板 */
    private showTowerInfo(tower: TowerRuntime): void {
        this.ensureTowerInfoPanel();
        if (!this.towerInfoPanel || !this.towerInfoPanelLabel) return;
        this.towerInfoTarget = tower;
        this.towerInfoPanelLabel.string = this.buildTowerInfoText(tower);
        if (this.towerInfoDismantleLabel) {
            this.towerInfoDismantleLabel.string = `拆除 ${SceneInitializer.DISMANTLE_COST}金`;
        }
        this.towerInfoPanel.active = true;
        this.towerInfoTimer = 5.0;   // 给玩家时间阅读并决定是否拆除
    }

    /** 隐藏信息面板 */
    private hideTowerInfo(): void {
        if (this.towerInfoPanel) this.towerInfoPanel.active = false;
        this.towerInfoTarget = null;
        this.towerInfoTimer = 0;
    }

    private dismantleTowerFromInfo(): void {
        const tower = this.towerInfoTarget;
        if (!tower || !tower.node.isValid) {
            this.hideTowerInfo();
            return;
        }
        const idx = this.towers.indexOf(tower);
        if (idx < 0) {
            this.hideTowerInfo();
            return;
        }
        const cost = SceneInitializer.DISMANTLE_COST;
        if (this.gold < cost) {
            if (this.statusLabel) this.statusLabel.string = `金币不足，拆除需要 ${cost}`;
            this.towerInfoTimer = 5.0;
            return;
        }

        const name = tower.def.name;
        const pos = tower.node.position.clone();
        if (this.bossLockedTower === tower) this.clearBossLock();
        this.gold -= cost;
        this.updateGoldLabel();
        EffectManager.instance?.playExplosion(pos, 34);
        this.removeTowerNode(idx);
        this.playtest.recordOperation('tower_dismantled', { towerId: tower.def.id, cost });
        this.hideTowerInfo();
        if (this.statusLabel) this.statusLabel.string = `已拆除${name}，-${cost}金币`;
    }

    /** 组装塔信息文本（DPS / 攻速 / 词缀 BUFF / 全局增益） */
    private buildTowerInfoText(tower: TowerRuntime): string {
        const def = tower.def;
        const p = this.getTowerParams(tower);
        const aps = 1 / p.interval;            // 每秒攻击次数
        const lines: string[] = [];

        lines.push(`${def.name}  ${tower.star === 2 ? '★★' : '★'}`);

        // 词缀
        const affixName = tower.affix
            ? TOWER_AFFIXES[def.id]?.find(a => a.id === tower.affix)?.name ?? ''
            : '';
        const affixDesc = tower.affix
            ? TOWER_AFFIXES[def.id]?.find(a => a.id === tower.affix)?.desc ?? ''
            : '';

        // 伤害 / 攻速 / DPS
        lines.push(`伤害：${p.damage.toFixed(0)}`);
        lines.push(`攻速：${aps.toFixed(2)} 次/秒`);
        if (def.attackKind === 'bullet') {
            let dps = p.damage * aps;
            if (p.rapid) dps *= 1.25;          // 连发：每 4 次攻击追加一发 → 5 发/4 次
            lines.push(`DPS：${dps.toFixed(1)}`);
        }
        lines.push(`射程：${p.range.toFixed(0)}`);

        // 类型专属效果
        if (def.id === 'poison') {
            lines.push(`喷雾毒性：${p.poisonDps.toFixed(1)}/s · ${p.poisonDuration.toFixed(1)}s`);
        } else if (def.id === 'slow') {
            lines.push(`减速：${Math.round((1 - p.slowMultiplier) * 100)}% · ${p.slowDuration.toFixed(1)}s`);
        }
        if (p.executeBonus > 0) {
            lines.push(`处决：低血(<30%)增伤 ${Math.round(p.executeBonus * 100)}%`);
        }
        if (p.critChance > 0) {
            lines.push(`暴击：${Math.round(p.critChance * 100)}% · ${p.critMultiplier.toFixed(1)}x`);
        }
        if (tower.corePowered) {
            lines.push('核心供电中');
        }

        // 词缀效果描述
        if (affixName) lines.push(`词缀：${affixName}（${affixDesc}）`);

        // 本局改造（拖改造卡生效，同类塔共享）
        const mods = this.runBuild.towerModifiersOf(def.id);
        if (mods.length > 0) {
            lines.push(`本局改造：${mods.map(m => `${m.name}（${m.description}）`).join('；')}`);
        }

        // 全局 roguelike 增益（作用于所有塔）
        const ts = this.towerStats;
        const globals: string[] = [];
        if (ts.damageBonus !== 0) globals.push(`伤害${ts.damageBonus > 0 ? '+' : ''}${Math.round(ts.damageBonus * 100)}%`);
        if (ts.speedBonus !== 0) globals.push(`攻速${ts.speedBonus > 0 ? '+' : ''}${Math.round(ts.speedBonus * 100)}%`);
        if (ts.rangeBonus !== 0) globals.push(`范围${ts.rangeBonus > 0 ? '+' : ''}${Math.round(ts.rangeBonus * 100)}%`);
        if (ts.splashLevel > 0) globals.push(`溅射Lv${ts.splashLevel}`);
        if (ts.bleedLevel > 0) globals.push(`出血Lv${ts.bleedLevel}`);
        if (ts.slowLevel > 0) globals.push(`减速Lv${ts.slowLevel}`);
        if (ts.healSuppression > 0) globals.push(`治疗抑制${Math.round(ts.healSuppression * 100)}%`);
        if (ts.bossWaveDamageBonus > 0) globals.push(`BOSS波伤害+${Math.round(ts.bossWaveDamageBonus * 100)}%`);
        if (ts.nonBossWaveDamagePenalty > 0) globals.push(`非BOSS波伤害-${Math.round(ts.nonBossWaveDamagePenalty * 100)}%`);
        if (ts.strawDamageBonus > 0) globals.push(`奶茶伤害+${Math.round(ts.strawDamageBonus * 100)}%`);
        if (ts.corePoweredDamageBonus > 0 || ts.corePoweredCritBonus > 0) {
            globals.push(`供电强化+${Math.round(ts.corePoweredDamageBonus * 100)}%伤害/${Math.round(ts.corePoweredCritBonus * 100)}%暴击`);
        }
        if (ts.poisonBurstDamageBonus > 0 || ts.poisonBurstRadiusBonus > 0 || ts.poisonResidueLevel > 0) {
            globals.push(`毒爆强化`);
        }
        if (ts.smashSlowedDamageBonus > 0 || ts.smashRadiusBonus > 0 || ts.brushSlowVulnerableBonus > 0 || ts.smashBrushedBurstLevel > 0) {
            globals.push(`控制爆破强化`);
        }
        if (globals.length) lines.push(`全局增益：${globals.join(' ')}`);

        return lines.join('\n');
    }

    // ============================================================
    //  暂停时全局 buff 面板
    // ============================================================

    /** 懒创建全局 buff 面板 */
    private ensureGlobalBuffPanel(): void {
        if (this.globalBuffPanel) return;
        const canvas = this.node;
        const panelW = 272;
        const panelH = 340;
        const panel = new Node('GlobalBuffPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        const t = panel.addComponent(UITransform);
        t.setContentSize(panelW, panelH);
        t.setAnchorPoint(0.5, 0.5);
        const g = panel.addComponent(Graphics);
        g.fillColor = new Color(16, 18, 28, 232);
        g.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
        g.fill();
        g.strokeColor = new Color(255, 215, 120, 255);
        g.lineWidth = 2;
        g.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
        g.stroke();
        g.strokeColor = new Color(255, 215, 120, 90);
        g.lineWidth = 1;
        g.moveTo(-panelW / 2 + 14, panelH / 2 - 48);
        g.lineTo(panelW / 2 - 14, panelH / 2 - 48);
        g.stroke();

        const title = new Node('Title');
        title.layer = Layers.Enum.UI_2D;
        title.setParent(panel);
        title.setPosition(0, panelH / 2 - 26, 0);
        const titleTransform = title.addComponent(UITransform);
        titleTransform.setContentSize(panelW - 28, 28);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '当前强化';
        titleLabel.fontSize = 18;
        titleLabel.lineHeight = 24;
        titleLabel.color = new Color(255, 220, 100, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.CENTER;

        const label = new Node('BuffText');
        label.layer = Layers.Enum.UI_2D;
        label.setParent(panel);
        label.setPosition(0, -24, 0);
        const lt = label.addComponent(UITransform);
        lt.setContentSize(panelW - 28, panelH - 78);
        lt.setAnchorPoint(0.5, 0.5);
        const ll = label.addComponent(Label);
        ll.string = '';
        ll.fontSize = 13;
        ll.color = new Color(235, 238, 246, 255);
        ll.lineHeight = 19;
        ll.horizontalAlign = Label.HorizontalAlign.LEFT;
        ll.verticalAlign = Label.VerticalAlign.TOP;
        ll.enableWrapText = true;

        panel.setPosition(160, 70, 0);
        panel.active = false;
        this.globalBuffPanel = panel;
        this.globalBuffLabel = ll;
    }

    /** 显示全局 buff 面板 */
    private showGlobalBuffPanel(): void {
        this.ensureGlobalBuffPanel();
        if (!this.globalBuffPanel || !this.globalBuffLabel) return;
        this.globalBuffLabel.string = this.buildGlobalBuffText();
        this.positionGlobalBuffPanel();
        this.globalBuffPanel.active = true;
    }

    /** 隐藏全局 buff 面板 */
    private hideGlobalBuffPanel(): void {
        if (this.globalBuffPanel) this.globalBuffPanel.active = false;
    }

    private positionGlobalBuffPanel(): void {
        if (!this.globalBuffPanel) return;
        const panelH = 340;
        const halfH = this._visibleSize.height / 2;
        const y = Math.min(halfH - panelH / 2 - 98, 82);
        this.globalBuffPanel.setPosition(0, y, 0);
    }

    /** 组装全局 buff 文本（当前已累计的 roguelike 加成） */
    private buildGlobalBuffText(): string {
        const ts = this.towerStats;
        const lines: string[] = [
            `概览  塔${this.towers.length}  波${this.currentWave}/${this.WAVES.length}  抽卡${this.currentDrawCost()}金`,
        ];
        const addSection = (title: string, items: string[]) => {
            if (items.length === 0) return;
            if (lines.length > 1) lines.push('');
            lines.push(title);
            for (const item of items) lines.push(`  ${item}`);
        };

        const general: string[] = [];
        if (ts.damageBonus !== 0) general.push(`伤害 ${ts.damageBonus > 0 ? '+' : ''}${Math.round(ts.damageBonus * 100)}%`);
        if (ts.speedBonus !== 0) general.push(`攻速 ${ts.speedBonus > 0 ? '+' : ''}${Math.round(ts.speedBonus * 100)}%`);
        if (ts.rangeBonus !== 0) general.push(`范围 ${ts.rangeBonus > 0 ? '+' : ''}${Math.round(ts.rangeBonus * 100)}%`);
        if (ts.healSuppression > 0) general.push(`治疗抑制 ${Math.round(ts.healSuppression * 100)}%`);
        if (ts.bossWaveDamageBonus > 0) general.push(`BOSS波伤害 +${Math.round(ts.bossWaveDamageBonus * 100)}%`);
        if (ts.nonBossWaveDamagePenalty > 0) general.push(`非BOSS波伤害 -${Math.round(ts.nonBossWaveDamagePenalty * 100)}%`);
        if (ts.splashLevel > 0) general.push(`溅射 Lv${ts.splashLevel} / ${Math.round(ts.splashDamage * 100)}%`);
        if (ts.bleedLevel > 0) general.push(`出血 Lv${ts.bleedLevel} / 暴击${Math.round(ts.critChance * 100)}%`);
        if (ts.slowLevel > 0) general.push(`缓速弹幕 Lv${ts.slowLevel} / ${Math.round((1 - ts.slowMultiplier) * 100)}%`);
        addSection('通用', general);

        const milkTea: string[] = [];
        const strawStacks = this.runBuild.stacksOf('straw_close_combat');
        if (ts.strawDamageBonus > 0) milkTea.push(`短管猛戳 ${strawStacks}层 / +${Math.round(ts.strawDamageBonus * 100)}%伤害`);
        if (ts.corePoweredDamageBonus > 0 || ts.corePoweredCritBonus > 0) {
            milkTea.push(`供电 +${Math.round(ts.corePoweredDamageBonus * 100)}%伤害 / +${Math.round(ts.corePoweredCritBonus * 100)}%暴击`);
        }
        if (ts.corePoweredSecondStrikeCrit) milkTea.push('过载双击：供电第2戳暴击');
        addSection('奶茶充电', milkTea);

        const poison: string[] = [];
        if (ts.poisonBurstDamageBonus > 0 || ts.poisonBurstRadiusBonus > 0) {
            poison.push(`毒爆 +${Math.round(ts.poisonBurstDamageBonus * 100)}%伤害 / +${Math.round(ts.poisonBurstRadiusBonus * 100)}%半径`);
        }
        if (ts.poisonResidueLevel > 0) poison.push(`毒液残留 Lv${ts.poisonResidueLevel}`);
        addSection('弹射毒爆', poison);

        const control: string[] = [];
        if (ts.smashSlowedDamageBonus > 0) control.push(`锅铲砸减速 +${Math.round(ts.smashSlowedDamageBonus * 100)}%伤害`);
        if (ts.smashRadiusBonus > 0) control.push(`锅铲半径 +${Math.round(ts.smashRadiusBonus * 100)}% / 变慢${Math.round(ts.smashIntervalPenalty * 100)}%`);
        const weakspotStacks = this.runBuild.stacksOf('brush_weakspot');
        if (ts.brushSlowVulnerableBonus > 0) control.push(`刷洗破绽 ${weakspotStacks}层 / 减速目标+${Math.round(ts.brushSlowVulnerableBonus * 100)}%易伤（2.5秒）`);
        if (ts.smashBrushedBurstLevel > 0) control.push(`碎裂爆破 Lv${ts.smashBrushedBurstLevel}`);
        addSection('控制爆破', control);

        const recentBuffs = this.runBuild.selectedBuffIds
            .slice(-4)
            .map(id => WAVE_BUFFS.find(buff => buff.id === id)?.name ?? id);
        if (recentBuffs.length > 0) addSection('最近选择', recentBuffs);
        if (lines.length === 1) lines.push('', '暂无强化', '波次结束后三选一可获得。');
        return lines.join('\n');
    }

}
