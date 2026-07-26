import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';
import { HUD } from '../ui/HUD';
import { EffectManager } from './EffectManager';
import { EnemyType } from './Constants';
import { TowerStats, BuffOption, BuildPath, ROGUELIKE_BUFFS, getBuffDisplay } from './RoguelikeCards';
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
    BUILD_CELLS,
    gridToLocal, CELL_SIZE, ROAD_WIDTH_RATIO, SLOT_SIZE_RATIO, GRID_COLS, GRID_ROWS,
} from './MapConfig';

/** 手牌卡定义 */
interface CardDef {
    kind: 'tower' | 'hammer';
    towerId?: string;   // kind==='tower' 时的塔 id
    name: string;
    desc: string;
    color: Color;
}

const { ccclass } = _decorator;

// 开发模式开关：开启后运行地图校验（仅输出错误，不移动节点）
const DEBUG = true;
// 6×8 调试网格开关
const SHOW_GRID = false;

// ============================================================
//  系统扩展约定：塔/敌人配置表
//  新增一种塔 → 在 TOWER_REGISTRY 注册一个 TowerDef
//  新增一种敌人 → 在 ENEMY_REGISTRY 注册一个 EnemyDef
//  注册后自动接入：按钮/外观/属性/攻击逻辑/移动逻辑/光环逻辑
//  详见 doc/extension-guide.md
// ============================================================


                               




/** 单塔有效属性（解析全局 roguelike buff + 二星固定强化 + 随机词缀 后的结果） */
interface TowerParams {
    damage: number;
    interval: number;
    range: number;
    poisonDps: number;
    poisonDuration: number;
    slowMultiplier: number;
    slowDuration: number;
    vulnerable: number;
    executeBonus: number;
    rapid: boolean;
}

/** 词缀 id（每种塔 3 个专属正向词缀） */
type AffixId =
    | 'rapid' | 'heavy' | 'execute'        // 攻击塔
    | 'deepfreeze' | 'linger' | 'vulnerable'  // 减速塔
    | 'virulent' | 'persistent' | 'contagious';// 毒塔

/** 塔运行时状态（合并系统使用） */
interface TowerRuntime {
    node: Node;
    def: TowerDef;
    star: number;            // 1 = 一星, 2 = 二星
    affix: AffixId | null;   // 一星为 null，二星随机获得一个

    attackCount: number;     // 攻击计数（连发词缀用）
    disabledTimer: number;   // BOSS 技能导致的停火倒计时（>0 时该塔不攻击）
}



/** 每种塔的 3 个专属正向词缀（合并升二星时随机获得其一） */
const TOWER_AFFIXES: Record<string, { id: AffixId; name: string; desc: string }[]> = {
    attack: [
        { id: 'rapid', name: '连发', desc: '每4次攻击追加一发' },
        { id: 'heavy', name: '重炮', desc: '伤害+25%' },
        { id: 'execute', name: '处决', desc: '对低血敌人增伤50%' },
    ],
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



/** 敌人运行时数据（定义在配置表之外，因为含运行时状态） */
interface EnemyRuntime {
    node: Node; hp: number; maxHp: number;
    slowTimer: number; slowMultiplier: number;
    vulnerable: number;     // 易伤倍率（默认 1，易伤词缀目标承受额外伤害）
    vulnerableTimer: number; // 易伤剩余时间（>0 时生效，归零恢复 1）
    type: EnemyType;        // 对应 EnemyDef.enemyType
    healTimer: number;      // 治疗者光环计时
    healCd: number;         // 治疗沉默剩余时间（受击后一段时间内无法治疗，由治疗抑制卡触发）
    // 扩展字段：新敌人的特殊计时器都挂这里，避免改结构
    extraTimer: number;
    // 路径目标索引（当前前往的 waypoint）
    pathIdx: number;
    // 通用 buff 字典：存 { timer: 剩余秒数, dps: 每秒掉血量 }
    // 新增 buff 只需往这里写一个 key，update 中自动处理掉血
    buffs: Record<string, { timer: number; dps: number }>;
}


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

    // ===== 塔注册表（含闭包引用 this.towerStats，保留在 SceneInitializer）=====
    private readonly TOWER_REGISTRY: TowerDef[] = [
        {
            id: 'attack',
            name: '攻击塔',
            cost: 100,
            range: 120,
            interval: 0.56,
            damage: 20,
            attackKind: 'bullet',
            color: new Color(50, 150, 255, 255),
            rangeColor: new Color(50, 150, 255, 60),
            buttonPos: ATTACK_BUTTON_POS,
        },
        {
            id: 'slow',
            name: '减速塔',
            cost: 120,
            range: 200,
            interval: 0.84,
            damage: 0,
            attackKind: 'instant',
            color: new Color(180, 80, 220, 255),
            rangeColor: new Color(180, 80, 220, 60),
            buttonPos: SLOW_BUTTON_POS,
        },
        {
            id: 'poison',
            name: '毒塔',
            cost: 140,
            range: 144,
            interval: 0.8,
            damage: 10,
            attackKind: 'bullet',
            color: new Color(100, 200, 50, 255),
            rangeColor: new Color(100, 200, 50, 60),
            buttonPos: POISON_BUTTON_POS,
        },
    ];

    // ===== 敌人注册表（含闭包引用 this.towerStats/HEAL_*，保留在 SceneInitializer）=====
    private readonly ENEMY_REGISTRY: EnemyDef[] = [
        {
            id: 'normal',
            enemyType: EnemyType.NORMAL,
            name: '普通兵',
            speedMultiplier: 1,
            hpMultiplier: 1,
            color: new Color(80, 200, 80, 255),
            radius: 14,
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
            hpMultiplier: 10,              // 血量是同波普通兵的 10 倍
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
                // BOSS 双层红色光环
                gfx.strokeColor = new Color(255, 200, 100, 220);
                gfx.lineWidth = 4;
                gfx.circle(0, 0, 34);
                gfx.stroke();
                gfx.strokeColor = new Color(255, 120, 120, 160);
                gfx.lineWidth = 2;
                gfx.circle(0, 0, 40);
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
    private slotPositions: Vec3[] = [];
    private slotOccupied: boolean[] = [];
    private lockedSlots: boolean[] = [];    // 第二类锁定格：初始灰色，需锤子撬开才能放塔
    private static readonly LOCKED_SLOT_COUNT = 6;  // 第二类锁定格数量

    // ===== 卡牌系统（支付金币抽卡，拖动卡牌放置/撬开）=====
    private static readonly DRAW_COST = 30;       // 抽卡花费
    private drawCount = 0;                         // 刷新次数（前两次保证基础塔完整）
    private cardMode = false;                      // 是否处于用卡阶段
    private handCards: CardDef[] = [];             // 当前手牌
    private handCardNodes: Node[] = [];            // 手牌卡 UI 节点
    private usedCardCount = 0;                     // 本局已使用卡数（抽5用2）
    private dragCardIndex = -1;                    // 正在拖动的卡索引（-1 无）
    private cardGhost: Node | null = null;         // 拖动手牌的幽灵
    private cardGhostGfx: Graphics | null = null;
    private CARD_BAR_Y = 0;                         // 手牌栏 Y（setupScene 赋值）

    // 拖拽
    private ghostNode: Node | null = null;
    private ghostGfx: Graphics | null = null;
    private isDragging = false;
    private canPlace = false;
    private targetSlot = -1;  // 当前拖拽目标槽位（TOUCH_MOVE 时确定，TOUCH_END 直接用）

    // 运行时状态
    private battleRoot: Node | null = null;
    private gameTransform: UITransform | null = null;
    private enemies: EnemyRuntime[] = [];
    private towers: TowerRuntime[] = [];
    private towerTimers: number[] = [];
    private bullets: { node: Node; vx: number; vy: number; target: Node; def: TowerDef; tower: TowerRuntime }[] = [];

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

    // 友军（基地）
    private readonly ALLY_MAX_HP = 6;
    private allyHp = 6;

    // 波次运行时
    private currentWave = 0;
    private spawnTimer = 0;
    private spawnedInWave = 0;
    private waveTotalCount = 0;  // 当前波次总敌人数
    private waveActive = false;
    private waveElapsed = 0;      // 当前波次已流逝时间（秒）
    private spawnCursor = 0;       // 下一个要生成的 entry 索引

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
    private buffCardLabels: { name: Label; desc: Label }[] = [];
    private currentBuffChoices: BuffOption[] = [];
    private buffSelected = false;             // 本轮是否已选 buff

    // 本局构筑状态
    private selectedBuffIds: string[] = [];   // 已选卡牌 id（同 id 只保留一次）
    private buffPickCounts: Record<string, number> = {};  // 各卡牌已选次数
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
    private towerInfoPanel: Node | null = null;
    private towerInfoPanelLabel: Label | null = null;
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


    protected start(): void {
        // 启动时校验卡牌配置（仅 console.error 报告，不修改数据）
        SceneInitializer.validateBuffConfigs();
        // 设计分辨率 640x960，策略 3 = ResolutionPolicy.FIXED_WIDTH：
        // 宽度固定 640，高度随设备比例拉伸，竖屏适配（顶部 HUD / 底部塔卡栏 / 中央战场）
        view.setDesignResolutionSize(640, 960, 3);
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
        // 倒计时圆环位置：底部「10金币」按钮正上方（半径+宽度已缩小 50%）
        this.countdownPos = new Vec3(0, -halfH + bottomDockHeight / 2 + 100, 0);

        // 屏幕适配：地图以逻辑像素尺寸（MAP_DESIGN = 360×480）显示，居中于战场；
        // 仅当超出战场区域时才缩小，不再拉伸填满战场，保证棋盘视觉尺寸 = MAP_DESIGN。
        // scale = min(1, 战场宽/地图宽, 战场高/地图高)
        const mapScale = Math.min(
            1,
            battleWidth / MAP_DESIGN_WIDTH,
            battleHeight / MAP_DESIGN_HEIGHT
        );

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
        // 地图调试框（黄色边框，随 BattleRoot 整体缩放；验收：调试框与地图同步缩放）
        this.drawMapDebugFrame(this.battleRoot);
        // 6×8 调试网格（可开关，随 BattleRoot 整体缩放）
        if (SHOW_GRID) this.drawGridDebug(this.battleRoot);

        // === 路径 ===
        this.drawPath(this.battleRoot);

        // === 塔位（仅 GridCell，由 gridToLocal 计算位置；与手机尺寸无关，仅供适配缩放）===
        this.slotPositions = BUILD_CELLS.map(c => gridToLocal(c));
        this.slotOccupied = new Array(this.slotPositions.length).fill(false);
        // 第二类锁定格：BUILD_CELLS 已按到路径距离升序排序，取最远的 LOCKED_SLOT_COUNT 个作为锁定格
        const lockedCount = Math.min(SceneInitializer.LOCKED_SLOT_COUNT, this.slotPositions.length);
        this.lockedSlots = this.slotPositions.map((_, i) => i >= this.slotPositions.length - lockedCount);

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
        this.drawGhost(false);
        this.ghostNode.active = false;

        // === 底部「30金币抽卡」按钮（卡牌系统入口，置于卡牌栏下方）===
        const btnY = -halfH + 48;
        this.SPEND_BUTTON_POS = new Vec3(0, btnY, 0);
        this.spendButton = this.createSpendButton(this.SPEND_BUTTON_POS);
        this.spendButton.setParent(canvas);
        this.spendButtonLabel = this.spendButton.getChildByName('Text')?.getComponent(Label) ?? null;

        // === 手牌卡牌栏位置（抽卡后显示 5 张卡，置于抽卡按钮上方）===
        this.CARD_BAR_Y = -halfH + 162;

        // === 拖动手牌幽灵 ===
        this.cardGhost = new Node('CardGhost');
        this.cardGhost.layer = Layers.Enum.UI_2D;
        this.cardGhost.setParent(canvas);
        const cgT = this.cardGhost.addComponent(UITransform);
        cgT.setContentSize(64, 64);
        cgT.setAnchorPoint(0.5, 0.5);
        this.cardGhostGfx = this.cardGhost.addComponent(Graphics);
        this.cardGhost.active = false;

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
            this.buffCardLabels.push({ name: nameLabel!, desc: descLabel! });
        }

        // === 所有触摸事件绑定到 Canvas ===
        canvas.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const buttonLocal = this.eventToCanvasLocal(event);
            const gameLocal = this.eventToGameLocal(event);

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
                    const halfH = (ct ? ct.height : 96) / 2;
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

            // 1.4 三选一选卡期间：禁止召唤、移动、交换、合并（卡片点击已在 0a 处理并返回）
            if (this.isBuffSelecting) return;

            // 卡牌使用阶段：仅处理手牌拖动，拦截其他交互
            if (this.cardMode) {
                const ci = this.findHandCardAt(buttonLocal);
                if (ci >= 0) {
                    this.dragCardIndex = ci;
                    this.isDragging = true;
                    this.cardGhost!.active = true;
                    this.cardGhost!.setPosition(buttonLocal);
                    this.drawCardGhost(this.handCards[ci]);
                }
                return;
            }

            // 1.5 判断是否点中了底部「30金币抽卡」按钮
            if (Vec3.distance(buttonLocal, this.SPEND_BUTTON_POS) <= this.SPEND_BUTTON_RADIUS) {
                this.drawCards();
                return;
            }

            // 1.7 点击锁定格（非卡牌阶段）：提示用锄头卡撬开
            const hitSlot = this.findSlotAt(gameLocal);
            if (hitSlot >= 0 && this.lockedSlots[hitSlot]) {
                if (this.statusLabel) this.statusLabel.string = '用锄头卡撬开此格';
                return;
            }

            // 3. 判断是否点中了已建好的塔（长按开始移动；无点击菜单）
            let hitTower = -1;
            for (let i = 0; i < this.towers.length; i++) {
                if (Vec3.distance(gameLocal, this.towers[i].node.position) < 30) {
                    hitTower = i;
                    break;
                }
            }
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
            if (this.cardMode && this.dragCardIndex >= 0) {
                this.cardGhost!.setPosition(this.eventToCanvasLocal(event));
                return;
            }
            this.ghostNode!.setPosition(local);
            this.updateGhostState(local);
        });

        canvas.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (this.isUserPaused) return;  // 全局暂停时禁止松手合并/弹信息
            // 卡牌拖动松手：判定落点使用（无效则取消）
            if (this.cardMode && this.isDragging && this.dragCardIndex >= 0) {
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

                if (this.dragMode === 'place') {
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
                                } else {
                                    // 不同类型/不同等级/满星 → 互换位置
                                    this.towers[targetTowerIdx].node.setPosition(this.slotPositions[this.moveFromSlot]);
                                    this.restoreTowerAppearance(this.towers[targetTowerIdx].node, this.towers[targetTowerIdx].def);
                                    movingTower.node.setPosition(this.slotPositions[slot]);
                                    this.restoreTowerAppearance(movingTower.node, movingTower.def);
                                    console.log(`塔互换: 位置 ${this.moveFromSlot + 1} ↔ ${slot + 1}`);
                                }
                            }
                        } else {
                            // 目标空 → 直接移动
                            movingTower.node.setPosition(this.slotPositions[slot]);
                            this.restoreTowerAppearance(movingTower.node, movingTower.def);
                            this.slotOccupied[this.moveFromSlot] = false;
                            this.slotNodes[this.moveFromSlot].active = true;
                            this.slotOccupied[slot] = true;
                            this.slotNodes[slot].active = false;
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
        this.hud.setLives(this.allyHp, this.ALLY_MAX_HP);
        this.hud.setStatus('点击底部「10金币」按钮随机建塔');

        // === 终点友军建筑（城堡）===
        this.drawAlly(this.battleRoot);

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
    }

    /** 关卡开始倒计时：给玩家时间建塔布防，结束后启动第一波 */
    private startLevelCountdown(): void {
        if (this.statusLabel) {
            this.statusLabel.string = '布防准备中…';
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
     * - 没有毒塔时：不出现溅射/出血（毒塔专属卡）
     * - 下一波有治疗兵：提高治疗抑制出现率
     * - 已获得溅射：溅射强化仍可出现
     * - 减速塔较多（≥2）：提高攻速/范围出现率
     */
    /**
     * 卡牌配置校验（启动时调用）。发现错误仅通过 console.error 报告，不修改数据。
     * 校验项：ID 重复 / requires、excludes 引用存在 / 自引用 / tier>0 / minWave>=1 / maxStacks>0
     */
    private static validateBuffConfigs(): void {
        const buffs = ROGUELIKE_BUFFS;
        const ids = buffs.map(b => b.id);
        for (const buff of buffs) {
            // ID 重复
            const dupCount = ids.filter(id => id === buff.id).length;
            if (dupCount > 1) {
                console.error(`[BuffConfig] 卡牌ID重复: "${buff.id}"（出现 ${dupCount} 次）`);
            }
            // 自引用
            if (buff.requires.includes(buff.id) || buff.excludes.includes(buff.id)) {
                console.error(`[BuffConfig] 卡牌 "${buff.id}" 引用了自身`);
            }
            // requires 引用存在
            for (const req of buff.requires) {
                if (!ids.includes(req)) {
                    console.error(`[BuffConfig] 卡牌 "${buff.id}" 的 requires 引用了不存在的卡牌 "${req}"`);
                }
            }
            // excludes 引用存在
            for (const ex of buff.excludes) {
                if (!ids.includes(ex)) {
                    console.error(`[BuffConfig] 卡牌 "${buff.id}" 的 excludes 引用了不存在的卡牌 "${ex}"`);
                }
            }
            // tier > 0
            if (!(buff.tier > 0)) {
                console.error(`[BuffConfig] 卡牌 "${buff.id}" 的 tier 必须 > 0（当前 ${buff.tier}）`);
            }
            // minWave >= 1
            if (buff.minWave < 1) {
                console.error(`[BuffConfig] 卡牌 "${buff.id}" 的 minWave 必须 >= 1（当前 ${buff.minWave}）`);
            }
            // maxStacks > 0
            if (!(buff.maxStacks > 0)) {
                console.error(`[BuffConfig] 卡牌 "${buff.id}" 的 maxStacks 必须 > 0（当前 ${buff.maxStacks}）`);
            }
        }
    }

    /**
     * 卡牌资格判断：当前波次 / 前置 / 互斥 / 次数限制
     * - 当前波次不得低于 minWave
     * - requires 中的卡牌必须全部已选择
     * - excludes 中任意卡牌已选择时，该卡不得出现
     * - 当前选择次数达到 maxStacks 后，该卡不得出现
     */
    private isBuffEligible(buff: BuffOption): boolean {
        const wave = this.currentWave;  // 选卡发生在波次间，currentWave 已指向下一波
        if (wave < buff.minWave) return false;
        for (const req of buff.requires) {
            if (!this.selectedBuffIds.includes(req)) return false;
        }
        for (const ex of buff.excludes) {
            if (this.selectedBuffIds.includes(ex)) return false;
        }
        const picked = this.buffPickCounts[buff.id] ?? 0;
        if (picked >= buff.maxStacks) return false;
        return true;
    }

    private buildBuffPool(): { buff: BuffOption; weight: number }[] {
        const stats = this.towerStats;
        // 统计当前塔类型
        const towerCounts: Record<string, number> = {};
        for (const t of this.towers) {
            towerCounts[t.def.id] = (towerCounts[t.def.id] ?? 0) + 1;
        }
        const hasPoisonTower = (towerCounts['poison'] ?? 0) > 0;
        const slowTowerCount = towerCounts['slow'] ?? 0;

        // 检查下一波是否有治疗兵
        const nextWave = this.WAVES[this.currentWave];  // currentWave 已 +1，指向下一波
        const nextWaveHasHealer = nextWave?.entries.some(e => e.type === EnemyType.HEALER) ?? false;

        const pool: { buff: BuffOption; weight: number }[] = [];

        for (const buff of ROGUELIKE_BUFFS) {
            // 资格判断（前置/互斥/波次/次数），不通过则不进卡池
            if (!this.isBuffEligible(buff)) {
                continue;
            }

            let weight = 1;  // 默认权重

            // 规则1：没有毒塔时，溅射/出血不出现（毒塔专属）
            if ((buff.id === 'splash' || buff.id === 'bleed') && !hasPoisonTower) {
                continue;  // 跳过，不加入卡池
            }
            // 规则1b：没有减速塔时，减速强化不出现（减速塔专属）
            if (buff.id === 'slow' && slowTowerCount === 0) {
                continue;
            }

            // 规则2：下一波有治疗兵时，提高治疗抑制出现率
            if (buff.id === 'healSuppress' && nextWaveHasHealer) {
                weight = 5;
            }

            // 规则3：已获得溅射后，溅射强化仍可出现（默认权重1即可，已在卡池中）
            // 规则4：减速塔较多（≥2）时，提高攻速/范围出现率
            if (slowTowerCount >= 2 && (buff.id === 'speed' || buff.id === 'range')) {
                weight = 3;
            }

            // 流派深化增权：已解锁的 buff 提高权重，鼓励同一流派继续强化
            if (buff.id === 'splash' && stats.splashLevel > 0) weight = Math.max(weight, 2);
            if (buff.id === 'bleed' && stats.bleedLevel > 0) weight = Math.max(weight, 2);

            // 首次解锁抑制：尚未获得溅射时，相对权重压到 0.2（在加权随机池中占比低，
            // 但不等于 20% 绝对概率；权重含义见 buildBuffPool 的加权随机抽取）。
            // 实际伤害上限已由 TowerStats 降低（Lv1: 43px/30%），此处仅延缓首次解锁节奏。
            if (buff.id === 'splash' && stats.splashLevel === 0) weight = 0.2;

            pool.push({ buff, weight });
        }

        // 确保卡池至少有 3 个选项（如果不足，补通用 buff）
        while (pool.length < 3) {
            const fallback = ROGUELIKE_BUFFS.find(b => !pool.find(p => p.buff.id === b.id));
            if (fallback) {
                pool.push({ buff: fallback, weight: 1 });
            } else {
                break;
            }
        }

        return pool;
    }

    private showBuffSelection(): void {
        // 动态卡池：根据当前局面构建加权卡池
        const pool = this.buildBuffPool();
        this.currentBuffChoices = [];
        for (let i = 0; i < 3; i++) {
            // 加权随机选择
            const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
            let r = Math.random() * totalWeight;
            let idx = 0;
            for (let j = 0; j < pool.length; j++) {
                r -= pool[j].weight;
                if (r <= 0) { idx = j; break; }
            }
            this.currentBuffChoices.push(pool.splice(idx, 1)[0].buff);
        }
        // 显示卡片并填充文字（splash buff 根据当前等级动态显示）
        for (let i = 0; i < 3; i++) {
            const card = this.buffCards[i];
            const buff = this.currentBuffChoices[i];
            const display = getBuffDisplay(buff, this.towerStats);
            card.active = true;
            if (this.buffCardLabels[i].name) {
                this.buffCardLabels[i].name.string = display.name;
            }
            if (this.buffCardLabels[i].desc) {
                this.buffCardLabels[i].desc.string = display.desc;
            }
        }
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
        const display = getBuffDisplay(buff, this.towerStats);
        // 选卡反馈特效
        if (this.buffCards[index]) {
            EffectManager.instance?.playCardSelected(this.buffCards[index], display.name);
        }
        buff.apply(this.towerStats);
        // 记录本局构筑状态
        if (!this.selectedBuffIds.includes(buff.id)) {
            this.selectedBuffIds.push(buff.id);
        }
        this.buffPickCounts[buff.id] = (this.buffPickCounts[buff.id] ?? 0) + 1;
        if (this.mainBuildPath === null && buff.path !== 'general') {
            this.mainBuildPath = buff.path;
        }
        this.buffSelected = true;
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
        transform.setContentSize(160, 96);
        node.setPosition(pos);

        const gfx = node.addComponent(Graphics);
        // 深紫色圆角背景
        gfx.fillColor = new Color(40, 30, 70, 230);
        gfx.roundRect(-80, -48, 160, 96, 10);
        gfx.fill();
        // 金色边框
        gfx.strokeColor = new Color(255, 200, 80, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-80, -48, 160, 96, 10);
        gfx.stroke();

        // buff 名称
        const nameNode = new Node('BuffName');
        nameNode.layer = Layers.Enum.UI_2D;
        nameNode.addComponent(UITransform);
        nameNode.setParent(node);
        nameNode.setPosition(0, 14, 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = '';
        nameLabel.fontSize = 16;
        nameLabel.color = new Color(255, 220, 100, 255);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const nameTransform = nameNode.getComponent(UITransform)!;
        nameTransform.setContentSize(150, 28);

        // buff 描述
        const descNode = new Node('BuffDesc');
        descNode.layer = Layers.Enum.UI_2D;
        descNode.addComponent(UITransform);
        descNode.setParent(node);
        descNode.setPosition(0, -16, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = '';
        descLabel.fontSize = 12;
        descLabel.color = new Color(200, 200, 220, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const descTransform = descNode.getComponent(UITransform)!;
        descTransform.setContentSize(150, 56);

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

    /** 启动下一波 */
    private startNextWave(): void {
        this.stopCountdown();  // 确保倒计时圆环已隐藏
        if (this.currentWave >= this.WAVES.length) {
            this.victory();
            return;
        }

        const wave = this.WAVES[this.currentWave];
        this.currentWave++;
        this.spawnedInWave = 0;
        this.waveActive = true;
        this.waveElapsed = 0;
        this.spawnCursor = 0;
        this.midWaveRewardGiven = false;  // 本波中间奖励尚未发放

        // 当前波次总敌人数 = 时间线条目数
        this.waveTotalCount = wave.entries.length;

        // 出怪改为在 update() 内用 waveElapsed + spawnCursor 推进，
        // 这样暂停（isUserPaused）能完全冻结出怪，不会堆敌人

        console.log(`Wave ${this.currentWave} 开始: ${this.waveTotalCount} 只`);
        if (this.waveLabel) {
            this.waveLabel.string = `Wave: ${this.currentWave}/${this.WAVES.length}`;
        }
    }

    private victory(): void {
        this.waveActive = false;
        this.isGameOver = true;  // 复用 isGameOver 停止 update 逻辑
        this.stopCountdown();
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideGlobalBuffPanel();

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
        btnNode.setPosition(0, -40, 0);

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

        this.gameOverPanel = panel;

        if (this.statusLabel) this.statusLabel.string = '胜利！';
        if (this.waveLabel) this.waveLabel.string = 'Victory!';
        console.log('所有波次完成，胜利！');
    }

    private updateGhostState(local: Vec3): void {
        let nearestSlot = -1;
        let nearestDist = Infinity;
        for (let i = 0; i < this.slotPositions.length; i++) {
            // 移动模式下：跳过自己原来的槽位，但允许其他已占用的槽位（互换）
            if (this.dragMode === 'move' && i === this.moveFromSlot) continue;
            if (this.dragMode === 'place' && (this.slotOccupied[i] || this.lockedSlots[i])) continue;

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
        // 用当前拖拽塔定义的颜色
        const def = this.dragTowerDef;
        const baseColor = def ? new Color(def.color.r, def.color.g, def.color.b, 120) : new Color(255, 255, 255, 120);
        gfx.fillColor = baseColor;
        gfx.circle(0, 0, 20);
        gfx.fill();

        if (canPlace) {
            gfx.strokeColor = new Color(100, 255, 100, 255);
            gfx.lineWidth = 4;
            gfx.circle(0, 0, 28);
            gfx.stroke();
        }
    }

    private eventToGameLocal(event: EventTouch): Vec3 {
        const uiPos = event.getUILocation();
        return this.gameTransform!.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
    }

    /**
     * 按塔类型索敌（每种塔不同优先级）
     * 攻击塔：最靠近基地的敌人（x 坐标最大，靠近终点 x=400）
     * 减速塔：尚未减速、移动最快的敌人（slowMultiplier 最大且 speedMultiplier 最大）
     * 毒塔：尚未中毒、生命较高的敌人
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

        if (def.id === 'attack') {
            // 最靠近基地的敌人（沿路径进度最大；同段则离下个 waypoint 更近）
            let best = inRange[0];
            for (const c of inRange) {
                const cur = c.enemy;
                const bestE = best.enemy;
                if (cur.pathIdx > bestE.pathIdx) {
                    best = c;
                } else if (cur.pathIdx === bestE.pathIdx) {
                    const curTarget = PATH_WAYPOINTS[Math.min(cur.pathIdx, PATH_WAYPOINTS.length - 1)];
                    const bestTarget = PATH_WAYPOINTS[Math.min(bestE.pathIdx, PATH_WAYPOINTS.length - 1)];
                    const dCur = Vec3.distance(cur.node.position, curTarget);
                    const dBest = Vec3.distance(bestE.node.position, bestTarget);
                    if (dCur < dBest) best = c;
                }
            }
            return best.idx;
        }

        if (def.id === 'slow') {
            // 尚未减速、移动最快的敌人
            let best = inRange[0].idx;
            let bestScore = -Infinity;
            for (const c of inRange) {
                const e = c.enemy;
                const eDef = this.getEnemyDef(e.type);
                const speedMult = eDef?.speedMultiplier ?? 1;
                const slowMult = e.slowMultiplier;
                const score = (slowMult >= 1.0 ? 1000 : 0) + speedMult * 100 + (1 - slowMult) * (-50);
                if (score > bestScore) {
                    bestScore = score;
                    best = c.idx;
                }
            }
            return best;
        }

        if (def.id === 'poison') {
            // 尚未中毒、生命较高的敌人
            let best = -1;
            let bestScore = -Infinity;
            for (const c of inRange) {
                const e = c.enemy;
                const hasPoison = e.buffs['poison'] ? 1 : 0;
                // 未中毒优先，再按 hp 排序
                const score = (hasPoison === 0 ? 10000 : 0) + e.hp;
                if (score > bestScore) {
                    bestScore = score;
                    best = c.idx;
                }
            }
            return best;
        }

        // 默认：最近的敌人
        let nearestIdx = inRange[0].idx;
        let nearestDist = Infinity;
        for (const c of inRange) {
            const dist = Vec3.distance(towerPos, c.enemy.node.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = c.idx;
            }
        }
        return nearestIdx;
    }

    private eventToCanvasLocal(event: EventTouch): Vec3 {
        const uiPos = event.getUILocation();
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
    }

    /** 开始移动塔（设置拖拽状态，保留原塔降低透明度） */
    private startMoveTower(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        const tower = this.towers[towerIndex];
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
        // 原塔保留，降低透明度表示正在移动
        const gfx = tower.node.getComponent(Graphics);
        if (gfx) {
            const c = gfx.fillColor;
            gfx.clear();
            gfx.fillColor = new Color(c.r, c.g, c.b, 80);
            gfx.rect(-28, -28, 56, 56);
            gfx.fill();
            gfx.fillColor = tower.def.color;
            gfx.circle(0, 0, 20);
            gfx.fill();
            gfx.fillColor = new Color(255, 255, 255, 80);
            gfx.circle(0, 0, 6);
            gfx.fill();
            gfx.strokeColor = new Color(tower.def.rangeColor.r, tower.def.rangeColor.g, tower.def.rangeColor.b, 30);
            gfx.lineWidth = 2;
            gfx.circle(0, 0, tower.def.range);
            gfx.stroke();
        }
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
        const gfx = towerNode.getComponent(Graphics);
        if (!gfx) return;
        gfx.clear();
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-28, -28, 56, 56);
        gfx.fill();
        gfx.fillColor = def.color;
        gfx.circle(0, 0, 20);
        gfx.fill();
        gfx.fillColor = new Color(255, 255, 255, 255);
        gfx.circle(0, 0, 6);
        gfx.fill();
        gfx.strokeColor = def.rangeColor;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, def.range);
        gfx.stroke();
    }


    /** 通用：销毁指定塔并释放其所在地基（无 AOE，供长按升级合并复用） */
    private removeTowerNode(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        const tower = this.towers[towerIndex];
        const tpos = tower.node.position.clone();
        for (let s = 0; s < this.slotPositions.length; s++) {
            if (Vec3.distance(tpos, this.slotPositions[s]) < 5) {
                this.slotOccupied[s] = false;
                if (this.slotNodes[s]) this.slotNodes[s].active = true;
                break;
            }
        }
        tower.node.removeFromParent();
        tower.node.destroy();
        this.towers.splice(towerIndex, 1);
        this.towerTimers.splice(towerIndex, 1);
    }

    /** BOSS 技能：每 BOSS_SKILL_INTERVAL 秒锁定一座塔，按规则给玩家应对机会 */
    private triggerBossSkill(): void {
        // 已有锁定中的塔，等其结算完再锁定下一座
        if (this.bossLockedTower) return;
        if (this.towers.length === 0) return;

        // 1) 可合并的一星塔：存在同类型另一座一星塔 → 锁定一座，玩家可合并解除
        const mergeable = this.findMergeableOneStar();
        if (mergeable) {
            this.lockTower(mergeable, 'merge');
            return;
        }
        // 2) 存在一星塔但无可合并 → 锁定一座一星塔，倒计时结束停火 8 秒
        const oneStar = this.towers.find(t => t.star === 1);
        if (oneStar) {
            this.lockTower(oneStar, 'ceasefire');
            return;
        }
        // 3) 全是二星塔 → 锁定一座二星塔，倒计时结束降为一星并清词缀
        this.lockTower(this.towers[0], 'downgrade');
    }

    /** 查找一座「可合并的一星塔」（存在同类型另一座一星塔） */
    private findMergeableOneStar(): TowerRuntime | null {
        const counts: Record<string, number> = {};
        for (const t of this.towers) {
            if (t.star === 1) counts[t.def.id] = (counts[t.def.id] ?? 0) + 1;
        }
        for (const t of this.towers) {
            if (t.star === 1 && (counts[t.def.id] ?? 0) >= 2) return t;
        }
        return null;
    }

    /** 锁定一座塔并进入倒计时（玩家在倒计时内成功应对可解除） */
    private lockTower(tower: TowerRuntime, mode: 'merge' | 'ceasefire' | 'downgrade'): void {
        this.bossLockedTower = tower;
        this.bossLockMode = mode;
        this.bossLockTimer = this.BOSS_LOCK_DURATION;
        this.setTowerLockVisual(tower, true);
        const hint = mode === 'merge' ? 'BOSS 锁定了一星塔！合并它可解除锁定'
            : mode === 'ceasefire' ? 'BOSS 锁定了一星塔！无同型可合并则停火 8 秒'
            : 'BOSS 锁定了二星塔！倒计时结束将降为一星并失去词缀';
        if (this.statusLabel) this.statusLabel.string = hint;
        console.log(`BOSS 技能：锁定 ${tower.def.name}(${mode})`);
    }

    /** 每帧推进 BOSS 锁定倒计时并结算 */
    private updateBossLock(dt: number): void {
        const t = this.bossLockedTower;
        if (!t) return;

        // 合并模式：锁定塔已被合并（移除或升为二星）→ 视为玩家成功应对
        if (this.bossLockMode === 'merge') {
            if (!this.towers.includes(t) || t.star !== 1) {
                this.clearBossLock();
                return;
            }
        }

        this.bossLockTimer -= dt;
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
        if (this.bossLockedTower) {
            this.setTowerLockVisual(this.bossLockedTower, false);
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

    /** 锁定视觉：在塔上加红色锁定环 */
    private setTowerLockVisual(tower: TowerRuntime, locked: boolean): void {
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
            }
            ring.active = true;
        } else if (ring) {
            ring.active = false;
        }
    }

    /** 溅射 AOE：在命中点爆炸，伤害周围敌人（伤害 = 主弹有效伤害 × splashDamage 倍率） */
    private triggerSplash(pos: Vec3, def: TowerDef, tower: TowerRuntime): void {
        const ts = this.towerStats;
        const radius = ts.splashRadius;
        const p = this.getTowerParams(tower);
        const splashDmg = p.damage * ts.splashDamage;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            const d = Vec3.distance(pos, e.node.position);
            if (d <= radius) {
                this.damageEnemy(e, splashDmg);
                // 毒塔溅射：对范围内敌人施毒（受二星/词缀影响）
                if (def.id === 'poison') {
                    this.applyPoisonFromTower(tower, e, p);
                }
                // 死亡移除统一在 cleanupDeadEnemies() 处理
            }
        }
        // 爆炸光波动画
        EffectManager.instance?.playExplosion(pos, radius);
    }

    /** 统一清理：移除所有 hp<=0 的敌人。所有致死路径（子弹/溅射/buff）只减血，
     *  死亡移除集中在此，避免遍历 enemies 时嵌套 splice 导致的数组错乱与敌人永久残留 */
    private cleanupDeadEnemies(): void {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.hp > 0) continue;
            // 中毒死亡触发传染词缀
            if (e.buffs['poison']) {
                this.tryContagion(e);
            }
            EffectManager.instance?.playDeath(e.node.position, e.node.getComponent(Graphics)?.fillColor ?? new Color(255, 255, 255, 255));
            e.node.removeFromParent();
            e.node.destroy();
            this.enemies.splice(i, 1);
            this.gold += this.KILL_REWARD;
            this.updateGoldLabel();
            console.log(`击杀！+${this.KILL_REWARD} 金币，当前 ${this.gold}`);
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
            const wave = this.WAVES[this.currentWave - 1];
            if (wave) {
                this.waveElapsed += dt;
                while (this.spawnCursor < wave.entries.length) {
                    const entry = wave.entries[this.spawnCursor];
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

            // 到达终点检测
            const endPos = this.PATH_END;
            if (Vec3.distance(pos, endPos) < 5) {
                // 到达终点 → 伤害友军
                e.node.destroy();
                this.enemies.splice(i, 1);
                this.allyHp -= 1;
                console.log(`漏怪！友军 HP: ${this.allyHp}/${this.ALLY_MAX_HP}`);
                if (this.livesLabel) {
                    this.livesLabel.string = `Base: ${this.allyHp}/${this.ALLY_MAX_HP}`;
                }
                if (this.allyHp <= 0) {
                    console.log('友军被摧毁，游戏结束！');
                    this.gameOver();
                }
            } else {
                // 沿 waypoints 逐段移动（pathIdx 跟踪目标；按本帧步长判定到达，避免掉帧时卡在折点）
                const eDef = this.getEnemyDef(e.type);
                const speedMult = eDef?.speedMultiplier ?? 1;
                const speed = this.ENEMY_SPEED * speedMult * e.slowMultiplier;
                if (e.pathIdx >= PATH_WAYPOINTS.length) e.pathIdx = PATH_WAYPOINTS.length - 1;

                const target = PATH_WAYPOINTS[e.pathIdx];
                const toX = target.x - pos.x;
                const toY = target.y - pos.y;
                const distToTarget = Math.hypot(toX, toY);
                const step = speed * dt;
                // 本帧步长 >= 到当前 waypoint 的距离（或已极近）→ 吸附到该点并前往下一个。
                // 用 step 作为到达阈值：掉帧时单帧移动很大也不会在折点反复横跳卡死。
                if (distToTarget <= step || distToTarget <= 1) {
                    e.node.setPosition(target.x, target.y, 0);
                    if (e.pathIdx < PATH_WAYPOINTS.length - 1) e.pathIdx++;
                } else {
                    e.node.setPosition(
                        pos.x + (toX / distToTarget) * step,
                        pos.y + (toY / distToTarget) * step,
                        0
                    );
                }
            }
        }

        // === HP 显示（选项框显示时保留提示，不覆盖）===
        if (this.statusLabel) {
            if (this.isWavePaused && !this.buffSelected && this.currentWave < this.WAVES.length) {
                this.statusLabel.string = `选择强化 - 三选一  塔: ${this.towers.length}`;
            } else if (this.isWavePaused) {
                this.statusLabel.string = `布防阶段 - 可建塔/移塔  塔: ${this.towers.length}`;
            } else if (this.isUserPaused) {
                this.statusLabel.string = `游戏已暂停  塔: ${this.towers.length}`;
            } else if (this.waveActive) {
                const wave = this.WAVES[this.currentWave - 1];
                const remaining = this.waveTotalCount - this.spawnedInWave + this.enemies.length;
                this.statusLabel.string = `剩余敌人: ${remaining}  塔: ${this.towers.length}`;
            } else {
                this.statusLabel.string = `塔: ${this.towers.length}`;
            }
        }

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
            const p = this.getTowerParams(tower);

            // 按塔类型索敌（每种塔有不同优先级）
            const nearestEnemy = this.findTarget(def, tower.node.position, p.range);
            if (nearestEnemy < 0) continue;

            this.towerTimers[i] += dt;
            if (this.towerTimers[i] >= p.interval) {
                this.towerTimers[i] = 0;
                tower.attackCount += 1;

                // 只对主目标发射 1 颗子弹；分裂在主弹命中后触发（见子弹更新段）
                const target = this.enemies[nearestEnemy];
                if (!target || !target.node.isValid) continue;

                if (def.attackKind === 'bullet') {
                    this.fireBullet(tower.node.position, target.node.position, target.node, def, tower);
                    // 连发词缀：每 4 次攻击追加一发
                    if (p.rapid && tower.attackCount % 4 === 0) {
                        this.fireBullet(tower.node.position, target.node.position, target.node, def, tower);
                    }
                } else {
                    // 瞬间效果型（减速塔）：逐塔施加减速/易伤
                    this.applyTowerEffect(tower, target, p);
                    this.fireBullet(tower.node.position, target.node.position, target.node, def, tower);
                }
            }
        }

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
                const buff = e.buffs[key];
                buff.timer -= dt;
                this.damageEnemy(e, buff.dps * dt);   // 每秒掉 dps 血（受易伤影响）
                if (buff.timer <= 0) {
                    delete e.buffs[key];
                }
            }
            // buff 掉血致死：仅减血，死亡移除统一在 cleanupDeadEnemies() 处理
        }

        // === 敌人特殊行为（治疗者光环等）——遍历注册表的 onUpdate ===
        for (const e of this.enemies) {
            const def = this.getEnemyDef(e.type);
            if (def?.onUpdate) {
                def.onUpdate(e, dt, this.enemies);
            }
        }

        // === BOSS 锁定技能倒计时结算 ===
        this.updateBossLock(dt);

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
                    let dmg = p.damage;
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
                    this.damageEnemy(e, dmg);
                    // 命中特效
                    EffectManager.instance?.playHit(e.node);
                    EffectManager.instance?.playDamageNumber(e.node.position, dmg, isCrit);
                    // Roguelike 出血 buff：概率施加出血状态（2秒，dps=0 纯标记）
                    if (ts.bleedLevel > 0 && Math.random() < ts.bleedChance) {
                        e.buffs['bleed'] = { timer: ts.bleedDuration, dps: 0 };
                    }
                    // 毒塔：命中施加毒 buff（受二星 + 词缀影响）
                    if (b.def.id === 'poison') {
                        this.applyPoisonFromTower(b.tower, e, p);
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
            // 波次进行到一半（已生成过半）时一次性发放 10 金币
            if (!this.midWaveRewardGiven && this.waveTotalCount > 0 &&
                this.spawnedInWave >= Math.ceil(this.waveTotalCount / 2)) {
                this.gold += 10;
                this.midWaveRewardGiven = true;
                this.updateGoldLabel();
                console.log(`波次中间奖励 +10 金币，当前 ${this.gold}`);
            }
            // 全部生成且全部死亡 → 自动暂停，等用户选 buff + 点"开始下一波"
            if (this.spawnedInWave >= this.waveTotalCount && this.enemies.length === 0) {
                this.waveActive = false;
                const waveBonus = this.WAVE_BONUSES[this.currentWave - 1] || 0;
                if (waveBonus > 0) {
                    this.gold += waveBonus;
                    this.updateGoldLabel();
                    console.log(`波次奖励 +${waveBonus} 金币，当前 ${this.gold}`);
                }
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

        const enemy = new Node(def.name);
        enemy.layer = Layers.Enum.UI_2D;
        enemy.setParent(this.battleRoot);
        enemy.setPosition(this.PATH_START);

        const transform = enemy.addComponent(UITransform);
        transform.setContentSize(def.radius * 2, def.radius * 2);

        const gfx = enemy.addComponent(Graphics);

        // 主体圆
        gfx.fillColor = def.color;
        gfx.circle(0, 0, def.radius);
        gfx.fill();

        // 额外外观（如治疗光环）
        def.drawExtra?.(gfx, def);

        this.enemies.push({
            node: enemy, hp: actualHp, maxHp: actualHp,
            slowTimer: 0, slowMultiplier: 1,
            type, healTimer: 0, healCd: 0, extraTimer: 0,
            pathIdx: 1,  // 从起点 waypoint[0] 出发，目标是 waypoint[1]
            buffs: {},
            vulnerable: 1,   // 易伤倍率（默认 1，易伤词缀目标承受额外伤害）
            vulnerableTimer: 0,  // 易伤剩余时间（归零恢复 1）
        });
    }

    /** 发射子弹 */
    private fireBullet(from: Vec3, to: Vec3, target: Node, def: TowerDef, tower: TowerRuntime): void {
        if (!this.battleRoot) return;

        const bullet = new Node('Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(this.battleRoot);
        bullet.setPosition(from);

        const transform = bullet.addComponent(UITransform);
        transform.setContentSize(12, 12);

        const gfx = bullet.addComponent(Graphics);
        gfx.fillColor = new Color(def.color.r, def.color.g, def.color.b, 255);
        gfx.circle(0, 0, 6);
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
        });
    }

    private placeTower(slotIndex: number, def: TowerDef, cost: number = def.cost): void {
        if (this.slotOccupied[slotIndex] || !this.battleRoot) return;
        if (this.lockedSlots[slotIndex]) {
            if (this.statusLabel) this.statusLabel.string = '该格被封锁，需用锤子撬开';
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
        const tower: TowerRuntime = { node, def, star: 1, affix: null, attackCount: 0, disabledTimer: 0 };
        this.setTowerBadge(tower);

        this.towers.push(tower);
        this.towerTimers.push(def.interval);
        this.slotOccupied[slotIndex] = true;
        this.slotNodes[slotIndex].active = false;

        console.log(`${def.name}放置到位置 ${slotIndex + 1}，花费 ${def.cost}，当前 ${this.towers.length} 塔`);
        if (def.id === 'attack' || def.id === 'poison') this.hasOutputTower = true;
    }

    /**
     * 点击底部「10金币」按钮：花费固定金币，随机选一种已有塔，
     * 按网格顺序（BUILD_CELLS 行优先，已排除道路）从第一个空位开始放置。
     */
    private updateGoldLabel(): void {
        if (this.goldLabel) {
            this.goldLabel.string = `Gold: ${this.gold}`;
        }
        if (this.goldAboveButtonLabel) {
            this.goldAboveButtonLabel.string = `gold ${this.gold}`;
        }
        // 抽卡按钮：金币不足 DRAW_COST（30）时灰显，直观体现"每30金币才能开启一次发牌"
        if (this.spendButton) {
            const gfx = this.spendButton.getComponent(Graphics);
            if (gfx) {
                const enabled = this.gold >= SceneInitializer.DRAW_COST;
                gfx.clear();
                gfx.fillColor = enabled ? new Color(60, 120, 70, 255) : new Color(90, 90, 90, 255);
                gfx.strokeColor = enabled ? new Color(255, 220, 100, 255) : new Color(160, 160, 160, 255);
                gfx.lineWidth = 3;
                gfx.roundRect(-90, -32, 180, 64, 12);
                gfx.fill();
                gfx.roundRect(-90, -32, 180, 64, 12);
                gfx.stroke();
            }
        }
    }

    // === 游戏结束弹窗 ===
    private gameOverPanel: Node | null = null;
    private isGameOver = false;

    private gameOver(): void {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.stopCountdown();
        this.waveActive = false;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideGlobalBuffPanel();

        // 清除所有敌人和子弹
        for (const en of this.enemies) en.node.destroy();
        this.enemies.length = 0;
        for (const b of this.bullets) b.node.destroy();
        this.bullets.length = 0;

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
        btnNode.setPosition(0, -40, 0);

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

        this.gameOverPanel = panel;

        if (this.statusLabel) this.statusLabel.string = '守卫失败';
    }

    private restart(): void {
        // 销毁弹窗
        if (this.gameOverPanel) {
            this.gameOverPanel.destroy();
            this.gameOverPanel = null;
        }

        this.stopCountdown();

        // 清除所有塔和建造点
        for (const tower of this.towers) tower.node.destroy();
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

        // 取消任何进行中的长按拖拽调度
        this.unschedule(this.onLongPressMove);

        // 恢复建造点（含重置锁定格）
        const lockedCount = Math.min(SceneInitializer.LOCKED_SLOT_COUNT, this.slotPositions.length);
        for (let i = 0; i < this.slotPositions.length; i++) {
            this.slotOccupied[i] = false;
            this.slotNodes[i].active = true;
            this.lockedSlots[i] = i >= this.slotPositions.length - lockedCount;
            this.redrawSlot(i, this.lockedSlots[i]);
        }
        // 重置卡牌系统
        this.clearHandCards();
        this.handCards = [];
        this.cardMode = false;
        this.usedCardCount = 0;
        this.drawCount = 0;
        this.dragCardIndex = -1;
        if (this.cardGhost) this.cardGhost.active = false;

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
        this.allyHp = this.ALLY_MAX_HP;
        this.currentWave = 0;
        this.spawnedInWave = 0;
        this.spawnTimer = 0;
        this.waveTotalCount = 0;
        this.waveActive = false;
        this.waveElapsed = 0;
        this.spawnCursor = 0;
        this.midWaveRewardGiven = false;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.currentBuffChoices = [];
        this.towerStats.reset();
        this.selectedBuffIds = [];
        this.buffPickCounts = {};
        this.mainBuildPath = null;
        this.hideBuffCards();
        this.updatePauseButton();
        this.hideGlobalBuffPanel();

        // 更新 HUD
        this.updateGoldLabel();
        if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.ALLY_MAX_HP}`;
        if (this.waveLabel) this.waveLabel.string = `Wave: 0/${this.WAVES.length}`;
        if (this.statusLabel) this.statusLabel.string = '点击底部「10金币」按钮随机建塔';

        // 关卡开始倒计时
        this.startLevelCountdown();
        console.log('游戏重新开始');
    }

    /** 创建底部「10金币」随机建塔按钮 */
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
        label.string = `${SceneInitializer.DRAW_COST}金抽卡`;
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

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-28, -28, 56, 56);
        gfx.fill();
        gfx.fillColor = def.color;
        gfx.circle(0, 0, 20);
        gfx.fill();
        gfx.fillColor = new Color(255, 255, 255, 255);
        gfx.circle(0, 0, 6);
        gfx.fill();
        gfx.strokeColor = def.rangeColor;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, def.range);
        gfx.stroke();

        // 星级/词缀徽章（文字显示，setTowerBadge 更新内容）
        const badge = new Node('Badge');
        badge.layer = Layers.Enum.UI_2D;
        badge.setParent(node);
        const bt = badge.addComponent(UITransform);
        bt.setContentSize(80, 16);
        bt.setAnchorPoint(0.5, 0.5);
        const bl = badge.addComponent(Label);
        bl.string = '★';
        bl.fontSize = 13;
        bl.color = new Color(255, 230, 120, 255);
        bl.horizontalAlign = Label.HorizontalAlign.CENTER;
        bl.verticalAlign = Label.VerticalAlign.CENTER;
        badge.setPosition(0, 36, 0);

        return node;
    }

    private createTowerSlot(pos: Vec3, index: number, locked: boolean): Node {
        const node = new Node(`Slot_${index}`);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        const slotSize = CELL_SIZE * SLOT_SIZE_RATIO;   // 塔位尺寸 = 单元格的 70%
        const slotHalf = slotSize / 2;
        transform.setContentSize(slotSize, slotSize);

        const gfx = node.addComponent(Graphics);
        this.drawSlotGfx(gfx, slotHalf, locked);

        return node;
    }

    /** 绘制建造点（locked=true 灰色封锁，false 绿色可用） */
    private drawSlotGfx(gfx: Graphics, slotHalf: number, locked: boolean): void {
        gfx.clear();
        const stroke = locked ? new Color(120, 120, 130) : new Color(100, 200, 100);
        const fill = locked ? new Color(120, 120, 130, 60) : new Color(100, 200, 100, 60);
        gfx.lineWidth = 3;
        gfx.strokeColor = stroke;
        gfx.fillColor = fill;
        gfx.rect(-slotHalf, -slotHalf, slotHalf * 2, slotHalf * 2);
        gfx.fill();
        gfx.stroke();

        if (locked) {
            // 锁图标：锁身 + 锁梁（上半圆）
            gfx.fillColor = new Color(220, 220, 230, 220);
            gfx.rect(-8, -2, 16, 14);
            gfx.fill();
            gfx.lineWidth = 3;
            gfx.strokeColor = new Color(220, 220, 230, 220);
            gfx.arc(0, -2, 7, Math.PI, 0);
            gfx.stroke();
        } else {
            // 十字标记
            gfx.strokeColor = stroke;
            gfx.lineWidth = 3;
            gfx.moveTo(-14, 0); gfx.lineTo(14, 0);
            gfx.moveTo(0, -14); gfx.lineTo(0, 14);
            gfx.stroke();
        }
    }

    /** 重绘某个建造点（用于解锁后由灰变绿） */
    private redrawSlot(index: number, locked: boolean): void {
        const node = this.slotNodes[index];
        if (!node) return;
        const gfx = node.getComponent(Graphics);
        if (!gfx) return;
        const slotSize = CELL_SIZE * SLOT_SIZE_RATIO;
        this.drawSlotGfx(gfx, slotSize / 2, locked);
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

    /** 用锄头卡撬开锁定格 */
    private useHammer(index: number): void {
        if (!this.lockedSlots[index] || this.slotOccupied[index]) return;
        this.lockedSlots[index] = false;
        this.redrawSlot(index, false);
        if (this.statusLabel) this.statusLabel.string = `已撬开格 ${index + 1}，可放塔`;
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
        if (this.gold < SceneInitializer.DRAW_COST) {
            if (this.statusLabel) this.statusLabel.string = `金币不足，需要 ${SceneInitializer.DRAW_COST}`;
            return;
        }
        this.gold -= SceneInitializer.DRAW_COST;
        this.updateGoldLabel();

        this.handCards = this.buildHandCards();
        this.usedCardCount = 0;
        this.cardMode = true;
        this.drawCount++;
        this.showHandCards();
        if (this.statusLabel) {
            this.statusLabel.string = '拖动 2 张卡使用（塔→空格/已有同型塔升级，锄头→灰格），剩余自动消失';
        }
    }

    /** 按规则构建 5 张手牌 */
    private buildHandCards(): CardDef[] {
        const hasLocked = this.lockedSlots.some(l => l);

        // 锄头数量（0 或 1）：最多一张；无锁定格则退出牌池
        let hammerCount = 0;
        if (hasLocked) {
            const usable = this.slotPositions.filter((_, i) => !this.slotOccupied[i] && !this.lockedSlots[i]).length;
            if (usable === 0) {
                hammerCount = 1;   // 兜底：无可用位置且可能无锄头时强制给锄头
            } else if (Math.random() < 0.4) {
                hammerCount = 1;
            }
        }

        const towerCount = 5 - hammerCount;
        const towers: CardDef[] = [];

        // 前两次刷新保证基础塔类型相对完整
        if (this.drawCount < 2 && towerCount >= 3) {
            towers.push(this.makeTowerCard('attack'));
            towers.push(this.makeTowerCard('slow'));
            towers.push(this.makeTowerCard('poison'));
        }
        while (towers.length < towerCount) {
            // 加权随机（attack 权重更高），允许重复
            const weights = this.TOWER_REGISTRY.map(t => (t.id === 'attack' ? 2 : 1));
            const total = weights.reduce((s, w) => s + w, 0);
            let r = Math.random() * total;
            let idx = 0;
            for (; idx < weights.length; idx++) {
                r -= weights[idx];
                if (r < 0) break;
            }
            towers.push(this.makeTowerCard(this.TOWER_REGISTRY[idx].id));
        }

        const result: CardDef[] = [...towers];
        if (hammerCount > 0) {
            result.push({ kind: 'hammer', name: '锄头', desc: '撬开一个封锁格', color: new Color(200, 200, 210, 255) });
        }
        // 打乱顺序（避免锄头总在末尾）
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    private makeTowerCard(id: string): CardDef {
        const def = this.TOWER_REGISTRY.find(t => t.id === id)!;
        return { kind: 'tower', towerId: id, name: def.name, desc: `花费 ${def.cost}`, color: def.color };
    }

    /** 显示手牌 5 张（横向排列于卡牌栏） */
    private showHandCards(): void {
        this.clearHandCards();
        for (let i = 0; i < this.handCards.length; i++) {
            const node = this.createHandCard(this.handCards[i], i);
            node.setParent(this.node);
            this.handCardNodes.push(node);
        }
        this.repositionHandCards();
    }

    private createHandCard(card: CardDef, index: number): Node {
        const node = new Node(`HandCard_${index}`);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(96, 116);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(40, 44, 60, 245);
        gfx.roundRect(-48, -58, 96, 116, 10);
        gfx.fill();
        gfx.strokeColor = card.kind === 'hammer' ? new Color(200, 200, 210, 255) : card.color;
        gfx.lineWidth = 3;
        gfx.roundRect(-48, -58, 96, 116, 10);
        gfx.stroke();
        gfx.fillColor = card.color;
        if (card.kind === 'hammer') {
            gfx.rect(-10, -6, 20, 16);
            gfx.fill();
        } else {
            gfx.circle(0, -4, 16);
            gfx.fill();
        }
        const nameNode = new Node('Name');
        nameNode.layer = Layers.Enum.UI_2D;
        nameNode.addComponent(UITransform);
        nameNode.setParent(node);
        nameNode.setPosition(0, 34, 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = card.name;
        nameLabel.fontSize = 15;
        nameLabel.color = new Color(255, 255, 255, 255);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const descNode = new Node('Desc');
        descNode.layer = Layers.Enum.UI_2D;
        descNode.addComponent(UITransform);
        descNode.setParent(node);
        descNode.setPosition(0, -38, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = card.desc;
        descLabel.fontSize = 12;
        descLabel.color = new Color(200, 200, 210, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        return node;
    }

    /** 重排手牌位置（抽卡后 / 用掉一张后） */
    private repositionHandCards(): void {
        const n = this.handCardNodes.length;
        const gap = 104;
        for (let i = 0; i < n; i++) {
            this.handCardNodes[i].setPosition((i - (n - 1) / 2) * gap, this.CARD_BAR_Y, 0);
        }
    }

    private clearHandCards(): void {
        for (const node of this.handCardNodes) node.destroy();
        this.handCardNodes = [];
    }

    /** 移除指定手牌（使用成功后）并重排 */
    private removeHandCard(index: number): void {
        if (this.handCardNodes[index]) this.handCardNodes[index].destroy();
        this.handCardNodes.splice(index, 1);
        this.handCards.splice(index, 1);
        this.repositionHandCards();
    }

    /** 命中检测：点击位置命中的手牌索引，未命中返回 -1 */
    private findHandCardAt(local: Vec3): number {
        for (let i = 0; i < this.handCardNodes.length; i++) {
            const p = this.handCardNodes[i].getPosition();
            if (Math.abs(local.x - p.x) <= 48 && Math.abs(local.y - p.y) <= 58) return i;
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
        for (let i = 0; i < this.towers.length; i++) {
            if (Vec3.distance(local, this.towers[i].node.position) < 40) return i;
        }
        return -1;
    }

    /** 升级一座塔（star+1，二星随机词缀），刷新徽章/特效/状态（不负责移除被合并塔） */
    private upgradeTower(targetTower: TowerRuntime): void {
        targetTower.star += 1;
        if (targetTower.star === 2) {
            const affixes = TOWER_AFFIXES[targetTower.def.id] ?? [];
            targetTower.affix = affixes.length > 0
                ? affixes[Math.floor(Math.random() * affixes.length)].id
                : null;
        }
        this.setTowerBadge(targetTower);
        EffectManager.instance?.playExplosion(targetTower.node.position.clone(), 50);
        if (this.statusLabel) this.statusLabel.string = `${targetTower.def.name} 升级到 ${targetTower.star} 星！`;
        console.log(`塔升级合并: ${targetTower.def.id} → ${targetTower.star}星`);
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
                    this.upgradeTower(target);  // 卡牌即消耗，不二次扣费
                    used = true;
                }
            } else {
                // 2) 落点在空格 → 新建塔
                const slot = this.findNearestUsableSlot(local);
                if (slot >= 0) {
                    this.placeTower(slot, def, 0); used = true;  // 卡牌放置不再二次扣费（抽卡时已付）
                } else {
                    // 3) 命中灰色（锁定）坑位：提示并自动复位卡牌
                    const hit = this.findSlotAt(local);
                    if (hit >= 0 && this.lockedSlots[hit]) {
                        if (this.statusLabel) this.statusLabel.string = '坑位还未锤开（用锄头卡撬开）';
                    }
                }
            }
        } else {
            const slot = this.findSlotAt(local);
            if (slot >= 0 && this.lockedSlots[slot]) {
                this.useHammer(slot);
                used = true;
            }
        }
        this.cardGhost!.active = false;
        this.isDragging = false;
        this.dragCardIndex = -1;
        if (used) {
            this.removeHandCard(ci);
            this.usedCardCount++;
            if (this.usedCardCount >= 2) {
                this.clearHandCards();
                this.handCards = [];
                this.cardMode = false;
            } else if (this.statusLabel) {
                this.statusLabel.string = `已用 1 张，再拖 1 张（剩 ${this.handCards.length} 张）`;
            }
        }
        // 未 used：松手在无效位置 → 卡回到手牌（取消选择），不改变状态
    }

    /** 绘制终点友军建筑（城堡）*/
    private drawAlly(parent: Node): void {
        const node = new Node('Ally');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(parent);
        node.setPosition(this.PATH_END);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(60, 60);

        const gfx = node.addComponent(Graphics);
        // 城堡主体
        gfx.fillColor = new Color(120, 80, 60, 255);
        gfx.rect(-20, -20, 40, 40);
        gfx.fill();
        // 城垛
        gfx.rect(-20, 10, 10, 10);
        gfx.rect(-5, 10, 10, 10);
        gfx.rect(10, 10, 10, 10);
        gfx.fill();
        // 城门
        gfx.fillColor = new Color(40, 40, 40, 255);
        gfx.rect(-6, -20, 12, 16);
        gfx.fill();
    }

    private drawPath(parent: Node): void {
        const node = new Node('Path');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(parent);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(2000, 2000);
        transform.setAnchorPoint(0.5, 0.5);

        const gfx = node.addComponent(Graphics);
        gfx.lineWidth = CELL_SIZE * ROAD_WIDTH_RATIO;   // 道路宽度 = 单元格的 65%
        gfx.strokeColor = new Color(200, 180, 140, 180);
        // 绘制折线路径
        gfx.moveTo(PATH_WAYPOINTS[0].x, PATH_WAYPOINTS[0].y);
        for (let i = 1; i < PATH_WAYPOINTS.length; i++) {
            gfx.lineTo(PATH_WAYPOINTS[i].x, PATH_WAYPOINTS[i].y);
        }
        gfx.stroke();

        // 起点（绿色）
        gfx.fillColor = new Color(0, 255, 0, 200);
        gfx.circle(this.PATH_START.x, this.PATH_START.y, 20);
        gfx.fill();

        // 终点（红色）
        gfx.fillColor = new Color(255, 0, 0, 200);
        gfx.circle(this.PATH_END.x, this.PATH_END.y, 20);
        gfx.fill();
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
        const def = tower.def;
        const ts = this.towerStats;
        const star = tower.star;
        const affix = tower.affix;

        // 基础（全局 roguelike 倍率）；各塔攻击力统一 +20%（Math.round 取整）
        let damage = Math.round(def.damage * 1.2 * ts.damageMultiplier);
        let interval = def.interval / ts.speedMultiplier;
        let range = def.range * ts.rangeMultiplier;
        let poisonDps = 8;            // 毒塔基础毒伤（子弹命中）
        let poisonDuration = 6.0;
        let slowMultiplier = 0.7;     // 减速塔基础减速倍率
        let slowDuration = 1.0;
        let vulnerable = 1.0;         // 易伤：目标承受伤害倍率
        let executeBonus = 0;         // 处决：低血增伤
        let rapid = false;            // 连发

        // 二星固定强化核心属性
        if (star === 2) {
            damage *= 1.3;
            range *= 1.15;
            interval /= 1.1;
            poisonDps *= 1.3;
            poisonDuration *= 1.3;
            slowMultiplier = Math.min(slowMultiplier, 0.55);
            slowDuration *= 1.3;
        }

        // 随机词缀
        if (affix === 'heavy') damage *= 1.25;
        if (affix === 'execute') executeBonus = 0.5;
        if (affix === 'rapid') rapid = true;
        if (affix === 'virulent') poisonDps *= 1.25;
        if (affix === 'persistent') poisonDuration *= 1.5;
        if (affix === 'deepfreeze') slowMultiplier = Math.min(slowMultiplier, 0.45);
        if (affix === 'linger') slowDuration *= 1.5;
        if (affix === 'vulnerable') vulnerable = 1.2;

        return { damage, interval, range, poisonDps, poisonDuration, slowMultiplier, slowDuration, vulnerable, executeBonus, rapid };
    }

    /** 统一扣血入口，自动应用易伤倍率 */
    private damageEnemy(e: EnemyRuntime, amount: number): void {
        e.hp -= amount * (e.vulnerable > 0 ? e.vulnerable : 1);
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

    /** 毒塔施毒（受二星 + 词缀影响） */
    private applyPoisonFromTower(tower: TowerRuntime, enemy: EnemyRuntime, p: TowerParams, dpsScale = 1): void {
        const dps = p.poisonDps * dpsScale;
        const dur = p.poisonDuration;
        const existing = enemy.buffs['poison'];
        if (existing) {
            existing.timer = dur;
            existing.dps = Math.max(existing.dps, dps);
        } else {
            enemy.buffs['poison'] = { timer: dur, dps };
        }
        EffectManager.instance?.playPoison(enemy.node, dur);
    }

    /** 传染词缀：中毒敌人死亡时概率把毒传播给附近敌人 */
    private tryContagion(dead: EnemyRuntime): void {
        if (!dead.buffs['poison']) return;
        const source = this.towers.find(t => t.def.id === 'poison' && t.affix === 'contagious');
        if (!source) return;
        if (Math.random() < 0.5) return;  // 50% 概率
        const p = this.getTowerParams(source);
        const radius = 60;
        for (const e of this.enemies) {
            if (e === dead || !e.node.isValid) continue;
            if (Vec3.distance(dead.node.position, e.node.position) <= radius) {
                const existing = e.buffs['poison'];
                if (existing) {
                    existing.timer = Math.max(existing.timer, p.poisonDuration);
                    existing.dps = Math.max(existing.dps, p.poisonDps);
                } else {
                    e.buffs['poison'] = { timer: p.poisonDuration, dps: p.poisonDps };
                }
                EffectManager.instance?.playPoison(e.node, p.poisonDuration);
            }
        }
    }

    /** 更新塔的星级/词缀显示徽章 */
    private setTowerBadge(tower: TowerRuntime): void {
        const badge = tower.node.getChildByName('Badge');
        if (!badge) return;
        const bl = badge.getComponent(Label);
        if (!bl) return;
        const stars = tower.star === 2 ? '★★' : '★';
        const affixName = tower.affix
            ? TOWER_AFFIXES[tower.def.id]?.find(a => a.id === tower.affix)?.name ?? ''
            : '';
        bl.string = affixName ? `${stars}${affixName}` : stars;
    }

    // ============================================================
    //  单击塔信息面板
    // ============================================================

    /** 懒创建信息面板 */
    private ensureTowerInfoPanel(): void {
        if (this.towerInfoPanel) return;
        const canvas = this.node;
        const panel = new Node('TowerInfoPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        const t = panel.addComponent(UITransform);
        t.setContentSize(300, 220);
        t.setAnchorPoint(0.5, 0.5);
        const g = panel.addComponent(Graphics);
        g.fillColor = new Color(18, 20, 32, 230);
        g.roundRect(-150, -110, 300, 220, 12);
        g.fill();
        g.strokeColor = new Color(120, 200, 255, 255);
        g.lineWidth = 2;
        g.roundRect(-150, -110, 300, 220, 12);
        g.stroke();

        const label = new Node('InfoText');
        label.layer = Layers.Enum.UI_2D;
        label.setParent(panel);
        const lt = label.addComponent(UITransform);
        lt.setContentSize(280, 200);
        lt.setAnchorPoint(0.5, 0.5);
        const ll = label.addComponent(Label);
        ll.string = '';
        ll.fontSize = 15;
        ll.color = new Color(255, 255, 255, 255);
        ll.lineHeight = 21;
        ll.horizontalAlign = Label.HorizontalAlign.LEFT;
        ll.verticalAlign = Label.VerticalAlign.CENTER;
        ll.enableWrapText = true;

        panel.setPosition(0, 130, 0);
        panel.active = false;
        this.towerInfoPanel = panel;
        this.towerInfoPanelLabel = ll;
    }

    /** 展示指定塔的信息面板 */
    private showTowerInfo(tower: TowerRuntime): void {
        this.ensureTowerInfoPanel();
        if (!this.towerInfoPanel || !this.towerInfoPanelLabel) return;
        this.towerInfoPanelLabel.string = this.buildTowerInfoText(tower);
        this.towerInfoPanel.active = true;
        this.towerInfoTimer = 3.0;   // 3 秒后自动隐藏
    }

    /** 隐藏信息面板 */
    private hideTowerInfo(): void {
        if (this.towerInfoPanel) this.towerInfoPanel.active = false;
        this.towerInfoTimer = 0;
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
            lines.push(`毒：${p.poisonDps.toFixed(1)}/s · ${p.poisonDuration.toFixed(1)}s`);
        } else if (def.id === 'slow') {
            lines.push(`减速：${Math.round((1 - p.slowMultiplier) * 100)}% · ${p.slowDuration.toFixed(1)}s`);
        }
        if (p.executeBonus > 0) {
            lines.push(`处决：低血(<30%)增伤 ${Math.round(p.executeBonus * 100)}%`);
        }

        // 词缀效果描述
        if (affixName) lines.push(`词缀：${affixName}（${affixDesc}）`);

        // 全局 roguelike 增益（作用于所有塔）
        const ts = this.towerStats;
        const globals: string[] = [];
        if (ts.damageBonus > 0) globals.push(`伤害+${Math.round(ts.damageBonus * 100)}%`);
        if (ts.speedBonus > 0) globals.push(`攻速+${Math.round(ts.speedBonus * 100)}%`);
        if (ts.rangeBonus > 0) globals.push(`范围+${Math.round(ts.rangeBonus * 100)}%`);
        if (ts.splashLevel > 0) globals.push(`溅射Lv${ts.splashLevel}`);
        if (ts.bleedLevel > 0) globals.push(`出血Lv${ts.bleedLevel}`);
        if (ts.slowLevel > 0) globals.push(`减速Lv${ts.slowLevel}`);
        if (ts.healSuppression > 0) globals.push(`治疗抑制${Math.round(ts.healSuppression * 100)}%`);
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
        const panel = new Node('GlobalBuffPanel');
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(canvas);
        const t = panel.addComponent(UITransform);
        t.setContentSize(320, 280);
        t.setAnchorPoint(0.5, 0.5);
        const g = panel.addComponent(Graphics);
        g.fillColor = new Color(18, 20, 32, 235);
        g.roundRect(-160, -140, 320, 280, 12);
        g.fill();
        g.strokeColor = new Color(255, 215, 120, 255);
        g.lineWidth = 2;
        g.roundRect(-160, -140, 320, 280, 12);
        g.stroke();

        const label = new Node('BuffText');
        label.layer = Layers.Enum.UI_2D;
        label.setParent(panel);
        const lt = label.addComponent(UITransform);
        lt.setContentSize(300, 260);
        lt.setAnchorPoint(0.5, 0.5);
        const ll = label.addComponent(Label);
        ll.string = '';
        ll.fontSize = 16;
        ll.color = new Color(255, 255, 255, 255);
        ll.lineHeight = 24;
        ll.horizontalAlign = Label.HorizontalAlign.LEFT;
        ll.verticalAlign = Label.VerticalAlign.CENTER;
        ll.enableWrapText = true;

        panel.setPosition(0, 40, 0);
        panel.active = false;
        this.globalBuffPanel = panel;
        this.globalBuffLabel = ll;
    }

    /** 显示全局 buff 面板 */
    private showGlobalBuffPanel(): void {
        this.ensureGlobalBuffPanel();
        if (!this.globalBuffPanel || !this.globalBuffLabel) return;
        this.globalBuffLabel.string = this.buildGlobalBuffText();
        this.globalBuffPanel.active = true;
    }

    /** 隐藏全局 buff 面板 */
    private hideGlobalBuffPanel(): void {
        if (this.globalBuffPanel) this.globalBuffPanel.active = false;
    }

    /** 组装全局 buff 文本（当前已累计的 roguelike 加成） */
    private buildGlobalBuffText(): string {
        const ts = this.towerStats;
        const lines: string[] = ['全局强化'];
        if (ts.damageBonus > 0) lines.push(`· 攻击伤害 +${Math.round(ts.damageBonus * 100)}%`);
        if (ts.speedBonus > 0) lines.push(`· 攻速 +${Math.round(ts.speedBonus * 100)}%`);
        if (ts.rangeBonus > 0) lines.push(`· 范围 +${Math.round(ts.rangeBonus * 100)}%`);
        if (ts.splashLevel > 0) lines.push(`· 溅射 Lv${ts.splashLevel}（${ts.splashRadius}px / ${Math.round(ts.splashDamage * 100)}%）`);
        if (ts.bleedLevel > 0) lines.push(`· 出血 Lv${ts.bleedLevel}（${Math.round(ts.bleedChance * 100)}% 施加 / ${Math.round(ts.critChance * 100)}% 暴击 / ${ts.critMultiplier}x 暴伤）`);
        if (ts.slowLevel > 0) lines.push(`· 减速 Lv${ts.slowLevel}（${Math.round((1 - ts.slowMultiplier) * 100)}% / ${ts.slowDuration.toFixed(1)}s）`);
        if (ts.healSuppression > 0) lines.push(`· 治疗抑制 ${Math.round(ts.healSuppression * 100)}%`);
        if (lines.length === 1) lines.push('（暂无，波次间三选一可获取）');
        return lines.join('\n');
    }

}
