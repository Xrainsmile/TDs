import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';
import { HUD } from '../ui/HUD';

const { ccclass } = _decorator;

// ============================================================
//  系统扩展约定：塔/敌人配置表
//  新增一种塔 → 在 TOWER_REGISTRY 注册一个 TowerDef
//  新增一种敌人 → 在 ENEMY_REGISTRY 注册一个 EnemyDef
//  注册后自动接入：按钮/外观/属性/攻击逻辑/移动逻辑/光环逻辑
//  详见 doc/extension-guide.md
// ============================================================

/** 全局塔属性（roguelike 加成累计，加法叠加不复利） */
class TowerStats {
    damageBonus = 0;       // 伤害加成（0.1 = +10%，累加）
    speedBonus = 0;         // 攻速加成（0.05 = +5%，累加）
    rangeBonus = 0;         // 范围加成（0.1 = +10%，累加）
    healSuppression = 0;    // 治疗抑制（0.1 = 抑制10%，累加）
    splitCount = 0;         // 分裂攻击额外目标数
    slowLevel = 0;          // 减速等级（>0 时所有子弹附带减速）

    // 最终倍率 = 1 + 累计加成（加法叠加）
    get damageMultiplier() { return 1 + this.damageBonus; }
    get speedMultiplier() { return 1 + this.speedBonus; }
    get rangeMultiplier() { return 1 + this.rangeBonus; }
    get healMultiplier() { return Math.max(0, 1 - this.healSuppression); }

    reset(): void {
        this.damageBonus = 0;
        this.speedBonus = 0;
        this.rangeBonus = 0;
        this.healSuppression = 0;
        this.splitCount = 0;
        this.slowLevel = 0;
    }
}

/** Roguelike buff 选项定义 */
interface BuffOption {
    id: string;
    name: string;          // 显示名
    desc: string;           // 描述
    apply: (stats: TowerStats) => void;
}

/** 6 种 buff（每次随机选 3 种，玩家三选一） */
const ROGUELIKE_BUFFS: BuffOption[] = [
    {
        id: 'damage', name: '攻击伤害 +10%', desc: '所有塔伤害提升',
        apply: s => { s.damageBonus += 0.1; },
    },
    {
        id: 'speed', name: '攻速 +5%', desc: '所有塔攻击速度提升',
        apply: s => { s.speedBonus += 0.05; },
    },
    {
        id: 'range', name: '范围 +10%', desc: '所有塔攻击范围提升',
        apply: s => { s.rangeBonus += 0.1; },
    },
    {
        id: 'healSuppress', name: '治疗抑制', desc: '抑制10%的敌人回复量',
        apply: s => { s.healSuppression += 0.1; },
    },
    {
        id: 'split', name: '分裂攻击', desc: '子弹命中后分裂2颗小弹',
        apply: s => { s.splitCount += 1; },
    },
    {
        id: 'slow', name: '减速', desc: '攻击附带减速效果',
        apply: s => { s.slowLevel += 1; },
    },
];

/** 塔攻击行为类型 */
type TowerAttackKind = 'bullet'   // 发射子弹（命中扣血）
                      | 'instant'; // 瞬间效果（如减速，直接改敌人状态）

/** 塔定义（新增塔时注册此结构） */
interface TowerDef {
    id: string;              // 唯一标识（如 'attack' / 'slow'）
    name: string;            // 中文名（日志用）
    cost: number;            // 花费
    range: number;           // 攻击范围
    interval: number;        // 攻击间隔（秒）
    damage: number;          // 子弹伤害（命中扣血，instant 类型也可填非 0）
    attackKind: TowerAttackKind;
    color: Color;            // 塔主体颜色
    rangeColor: Color;       // 范围圈颜色
    buttonPos: Vec3;         // 拖拽按钮位置
    /** 瞬间效果：直接修改敌人状态（返回值无意义，直接改入参 enemy） */
    applyInstant?: (enemy: EnemyRuntime) => void;
    /** 子弹命中时的额外效果（如施加 buff），在扣血之后调用 */
    onBulletHit?: (enemy: EnemyRuntime) => void;
}

/** 敌人运行时数据（定义在配置表之外，因为含运行时状态） */
interface EnemyRuntime {
    node: Node; hp: number; maxHp: number;
    slowTimer: number; slowMultiplier: number;
    type: string;           // 对应 EnemyDef.id
    healTimer: number;      // 治疗者光环计时
    // 扩展字段：新敌人的特殊计时器都挂这里，避免改结构
    extraTimer: number;
    // 通用 buff 字典：存 { timer: 剩余秒数, dps: 每秒掉血量 }
    // 新增 buff 只需往这里写一个 key，update 中自动处理掉血
    buffs: Record<string, { timer: number; dps: number }>;
}

/** 敌人定义（新增敌人时注册此结构） */
interface EnemyDef {
    id: string;              // 唯一标识（如 'normal' / 'healer'）
    name: string;            // 中文名
    speedMultiplier: number; // 相对基础速度的倍率（1=普通，0.9=慢10%）
    hpMultiplier: number;    // 相对配置 hp 的倍率（1=普通，0.8=血少20%）
    color: Color;            // 敌人主体颜色
    radius: number;          // 敌人半径（碰撞+绘制）
    /** 特殊行为：每帧调用，返回值无意义（直接改入参 enemy） */
    onUpdate?: (enemy: EnemyRuntime, dt: number, allEnemies: EnemyRuntime[]) => void;
    /** 绘制特殊外观（在主体圆之后画，如治疗光环） */
    drawExtra?: (gfx: Graphics, def: EnemyDef) => void;
}

/** 敌人类型（向后兼容，实际用 string） */
type EnemyType = string;

/** 单只敌人生成配置（时间线格式） */
interface SpawnEntry {
    time: number;       // 从波次开始第几秒生成这只（秒，可写小数）
    type: EnemyType;    // 敌人 id（对应 EnemyDef.id）
    hp: number;         // 这只敌人的基础血量（实际 hp = hp * EnemyDef.hpMultiplier）
}

/** 波次配置 */
interface WaveConfig {
    entries: SpawnEntry[];
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

    // 路径
    private readonly PATH_START = new Vec3(-400, 0, 0);
    private readonly PATH_END = new Vec3(400, 0, 0);

    // 敌人属性（基础值，各类型用 multiplier 调整）
    private readonly ENEMY_SPEED = 80;

    // 金币
    private readonly INITIAL_GOLD = 300;
    private readonly KILL_REWARD = 20;
    private readonly TOWER_REMOVE_COST = 40;       // 删塔花费
    private readonly LONG_PRESS_THRESHOLD = 0.5;   // 长按触发阈值（秒）
    private readonly LONG_PRESS_MOVE_TOLERANCE = 10; // 波次间长按手指允许移动距离（超过转移动拖拽）
    private readonly LONG_PRESS_MOVE_TOLERANCE_COMBAT = 30; // 进攻中长按手指允许移动距离（更大，避免误取消）
    private readonly EXPLOSION_RADIUS = 60;          // 自爆 AOE 半径
    private readonly EXPLOSION_DAMAGE = 80;         // 自爆 AOE 伤害

    // 关卡开始倒计时（秒）
    private readonly LEVEL_START_COUNTDOWN = 5;

    // 子弹
    private readonly BULLET_SPEED = 500;

    // ===== 塔注册表：新增塔只需在此数组追加一个 TowerDef =====
    // 位置常量（供注册表引用）
    private readonly ATTACK_BUTTON_POS = new Vec3(-400, -200, 0);
    private readonly SLOW_BUTTON_POS = new Vec3(-400, -100, 0);
    private readonly TOWER_REGISTRY: TowerDef[] = [
        {
            id: 'attack',
            name: '攻击塔',
            cost: 100,
            range: 200,
            interval: 0.56,
            damage: 20,
            attackKind: 'bullet',
            color: new Color(50, 150, 255, 255),
            rangeColor: new Color(50, 150, 255, 60),
            buttonPos: this.ATTACK_BUTTON_POS,
        },
        {
            id: 'slow',
            name: '减速塔',
            cost: 150,
            range: 200,
            interval: 0.84,       // 攻速降低 20%（0.7 × 1.2）
            damage: 0,            // 纯减速不扣血
            attackKind: 'instant',
            color: new Color(180, 80, 220, 255),
            rangeColor: new Color(180, 80, 220, 60),
            buttonPos: this.SLOW_BUTTON_POS,
            applyInstant: (enemy) => {
                enemy.slowMultiplier = 0.7;
                enemy.slowTimer = 2.0;
            },
        },
        {
            id: 'poison',
            name: '毒塔',
            cost: 180,
            range: 180,
            interval: 0.8,
            damage: 10,           // 子弹直接伤害
            attackKind: 'bullet',
            color: new Color(100, 200, 50, 255),   // 绿色
            rangeColor: new Color(100, 200, 50, 60),
            buttonPos: new Vec3(-400, 0, 0),       // 新按钮位置
            // 命中时施加毒性 buff：每秒掉 8 血，持续 5 秒
            onBulletHit: (enemy) => {
                // 刷新或叠加毒 buff（取更强的）
                const existing = enemy.buffs['poison'];
                if (existing) {
                    existing.timer = 5.0;  // 刷新持续时间
                    existing.dps = Math.max(existing.dps, 8);
                } else {
                    enemy.buffs['poison'] = { timer: 5.0, dps: 8 };
                }
            },
        },
    ];

    // ===== 敌人注册表：新增敌人只需在此数组追加一个 EnemyDef =====
    private readonly HEAL_RADIUS = 120;         // 治疗光环范围（healer 用）
    private readonly HEAL_INTERVAL = 3.0;       // 每 3 秒治疗一次
    private readonly HEAL_AMOUNT = 5;           // 回复 5 点 HP
    private readonly ENEMY_REGISTRY: EnemyDef[] = [
        {
            id: 'normal',
            name: '普通兵',
            speedMultiplier: 1,
            hpMultiplier: 1,
            color: new Color(80, 200, 80, 255),
            radius: 14,
        },
        {
            id: 'healer',
            name: '治疗兵',
            speedMultiplier: 0.9,
            hpMultiplier: 1.0,
            color: new Color(255, 150, 200, 255),
            radius: 14,
            onUpdate: (enemy, dt, allEnemies) => {
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
    ];

    /** 按 id 查塔定义 */
    private getTowerDef(id: string): TowerDef | undefined {
        return this.TOWER_REGISTRY.find(t => t.id === id);
    }
    /** 按 id 查敌人定义 */
    private getEnemyDef(id: string): EnemyDef | undefined {
        return this.ENEMY_REGISTRY.find(e => e.id === id);
    }

    // ===== 波次配置（时间线格式：一行一只敌人）=====
    // time:  从波次开始第几秒生成（秒，可写小数）
    // type:  'normal' 普通兵 / 'healer' 治疗兵（治疗兵速度慢10%、血量建议是普通的 0.8 倍）
    // hp:    这只敌人多少血
    private readonly WAVES: WaveConfig[] = [
        // Wave 1：30 只普通兵，HP=35，每隔 1.2s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 35 },  { time: 1.2,  type: 'normal', hp: 35 },
            { time: 2.4,  type: 'normal', hp: 35 },  { time: 3.6,  type: 'normal', hp: 35 },
            { time: 4.8,  type: 'normal', hp: 35 },  { time: 6.0,  type: 'normal', hp: 35 },
            { time: 7.2,  type: 'normal', hp: 35 },  { time: 8.4,  type: 'normal', hp: 35 },
            { time: 9.6,  type: 'normal', hp: 35 },  { time: 10.8, type: 'normal', hp: 35 },
            { time: 12.0, type: 'normal', hp: 35 },  { time: 13.2, type: 'normal', hp: 35 },
            { time: 14.4, type: 'normal', hp: 35 },  { time: 15.6, type: 'normal', hp: 35 },
            { time: 16.8, type: 'normal', hp: 35 },  { time: 18.0, type: 'normal', hp: 35 },
            { time: 19.2, type: 'normal', hp: 35 },  { time: 20.4, type: 'normal', hp: 35 },
            { time: 21.6, type: 'normal', hp: 35 },  { time: 22.8, type: 'normal', hp: 35 },
            { time: 24.0, type: 'normal', hp: 35 },  { time: 25.2, type: 'normal', hp: 35 },
            { time: 26.4, type: 'normal', hp: 35 },  { time: 27.6, type: 'normal', hp: 35 },
            { time: 28.8, type: 'normal', hp: 35 },  { time: 30.0, type: 'normal', hp: 35 },
            { time: 31.2, type: 'normal', hp: 35 },  { time: 32.4, type: 'normal', hp: 35 },
            { time: 33.6, type: 'normal', hp: 35 },  { time: 34.8, type: 'normal', hp: 35 },
        ]},
        // Wave 2：30 只普通兵，HP=85，每隔 1.0s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 85 },  { time: 1.0,  type: 'normal', hp: 85 },
            { time: 2.0,  type: 'normal', hp: 85 },  { time: 3.0,  type: 'normal', hp: 85 },
            { time: 4.0,  type: 'normal', hp: 85 },  { time: 5.0,  type: 'normal', hp: 85 },
            { time: 6.0,  type: 'normal', hp: 85 },  { time: 7.0,  type: 'normal', hp: 85 },
            { time: 8.0,  type: 'normal', hp: 85 },  { time: 9.0,  type: 'normal', hp: 85 },
            { time: 10.0, type: 'normal', hp: 85 },  { time: 11.0, type: 'normal', hp: 85 },
            { time: 12.0, type: 'normal', hp: 85 },  { time: 13.0, type: 'normal', hp: 85 },
            { time: 14.0, type: 'normal', hp: 85 },  { time: 15.0, type: 'normal', hp: 85 },
            { time: 16.0, type: 'normal', hp: 85 },  { time: 17.0, type: 'normal', hp: 85 },
            { time: 18.0, type: 'normal', hp: 85 },  { time: 19.0, type: 'normal', hp: 85 },
            { time: 20.0, type: 'normal', hp: 85 },  { time: 21.0, type: 'normal', hp: 85 },
            { time: 22.0, type: 'normal', hp: 85 },  { time: 23.0, type: 'normal', hp: 85 },
            { time: 24.0, type: 'normal', hp: 85 },  { time: 25.0, type: 'normal', hp: 85 },
            { time: 26.0, type: 'normal', hp: 85 },  { time: 27.0, type: 'normal', hp: 85 },
            { time: 28.0, type: 'normal', hp: 85 },  { time: 29.0, type: 'normal', hp: 85 },
        ]},
        // Wave 3：30 只，3 普通 + 1 治疗循环穿插（23 普通 HP=140 + 7 治疗 HP=175），每隔 1.4s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 140 },  { time: 1.4,  type: 'normal', hp: 140 },
            { time: 2.8,  type: 'normal', hp: 140 },  { time: 4.2,  type: 'healer', hp: 175 },
            { time: 5.6,  type: 'normal', hp: 140 },  { time: 7.0,  type: 'normal', hp: 140 },
            { time: 8.4,  type: 'normal', hp: 140 },  { time: 9.8,  type: 'healer', hp: 175 },
            { time: 11.2, type: 'normal', hp: 140 },  { time: 12.6, type: 'normal', hp: 140 },
            { time: 14.0, type: 'normal', hp: 140 },  { time: 15.4, type: 'healer', hp: 175 },
            { time: 16.8, type: 'normal', hp: 140 },  { time: 18.2, type: 'normal', hp: 140 },
            { time: 19.6, type: 'normal', hp: 140 },  { time: 21.0, type: 'healer', hp: 175 },
            { time: 22.4, type: 'normal', hp: 140 },  { time: 23.8, type: 'normal', hp: 140 },
            { time: 25.2, type: 'normal', hp: 140 },  { time: 26.6, type: 'healer', hp: 175 },
            { time: 28.0, type: 'normal', hp: 140 },  { time: 29.4, type: 'normal', hp: 140 },
            { time: 30.8, type: 'normal', hp: 140 },  { time: 32.2, type: 'healer', hp: 175 },
            { time: 33.6, type: 'normal', hp: 140 },  { time: 35.0, type: 'normal', hp: 140 },
            { time: 36.4, type: 'normal', hp: 140 },  { time: 37.8, type: 'healer', hp: 175 },
            { time: 39.2, type: 'normal', hp: 140 },  { time: 40.6, type: 'normal', hp: 140 },
        ]},
        // Wave 4：30 只普通兵，HP=180，每隔 0.8s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 180 },  { time: 0.8,  type: 'normal', hp: 180 },
            { time: 1.6,  type: 'normal', hp: 180 },  { time: 2.4,  type: 'normal', hp: 180 },
            { time: 3.2,  type: 'normal', hp: 180 },  { time: 4.0,  type: 'normal', hp: 180 },
            { time: 4.8,  type: 'normal', hp: 180 },  { time: 5.6,  type: 'normal', hp: 180 },
            { time: 6.4,  type: 'normal', hp: 180 },  { time: 7.2,  type: 'normal', hp: 180 },
            { time: 8.0,  type: 'normal', hp: 180 },  { time: 8.8,  type: 'normal', hp: 180 },
            { time: 9.6,  type: 'normal', hp: 180 },  { time: 10.4, type: 'normal', hp: 180 },
            { time: 11.2, type: 'normal', hp: 180 },  { time: 12.0, type: 'normal', hp: 180 },
            { time: 12.8, type: 'normal', hp: 180 },  { time: 13.6, type: 'normal', hp: 180 },
            { time: 14.4, type: 'normal', hp: 180 },  { time: 15.2, type: 'normal', hp: 180 },
            { time: 16.0, type: 'normal', hp: 180 },  { time: 16.8, type: 'normal', hp: 180 },
            { time: 17.6, type: 'normal', hp: 180 },  { time: 18.4, type: 'normal', hp: 180 },
            { time: 19.2, type: 'normal', hp: 180 },  { time: 20.0, type: 'normal', hp: 180 },
            { time: 20.8, type: 'normal', hp: 180 },  { time: 21.6, type: 'normal', hp: 180 },
            { time: 22.4, type: 'normal', hp: 180 },  { time: 23.2, type: 'normal', hp: 180 },
        ]},
    ];

    // 建造点（下面 3 个 + 上面 3 个，路径在 y=0 上下对称）
    private readonly SLOT_POSITIONS = [
        new Vec3(-150, -64, 0),
        new Vec3(0, -64, 0),
        new Vec3(150, -64, 0),
        new Vec3(-150, 64, 0),
        new Vec3(0, 64, 0),
        new Vec3(150, 64, 0),
    ];
    private slotNodes: Node[] = [];
    private slotOccupied: boolean[] = [false, false, false, false, false, false];

    // 拖拽
    private ghostNode: Node | null = null;
    private ghostGfx: Graphics | null = null;
    private isDragging = false;
    private canPlace = false;
    private targetSlot = -1;  // 当前拖拽目标槽位（TOUCH_MOVE 时确定，TOUCH_END 直接用）

    // 运行时状态
    private gameLayer: Node | null = null;
    private gameTransform: UITransform | null = null;
    private enemies: EnemyRuntime[] = [];
    private towers: { node: Node; def: TowerDef }[] = [];
    private towerTimers: number[] = [];
    private bullets: { node: Node; vx: number; vy: number; target: Node; def: TowerDef; isSplit: boolean; life: number }[] = [];
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
    private waveDelay = 0;  // 波次间延迟（保留兼容，未使用）
    private levelCountdown = 0;  // 关卡开始倒计时剩余秒数（>0 时正在倒计时）
    // 暂停状态：
    // - isWavePaused: 波次结束后的"自动暂停"→ 可以建塔/移塔，点"开始下一波"继续
    // - isUserPaused: 用户在波次进行中主动暂停 → 完全冻结，不能拖拽
    private isWavePaused = false;
    private isUserPaused = false;
    // 游戏暂停按钮（右上角）
    private pauseButton: Node | null = null;
    private pauseButtonLabel: Label | null = null;
    // 开始下一波按钮（中上，波次间自动暂停时显示）
    private nextWaveButton: Node | null = null;
    private nextWaveButtonLabel: Label | null = null;

    // ===== Roguelike 系统 =====
    private towerStats = new TowerStats();
    private buffCards: Node[] = [];          // 3 张 buff 卡片
    private buffCardLabels: { name: Label; desc: Label }[] = [];
    private currentBuffChoices: BuffOption[] = [];
    private buffSelected = false;             // 本轮是否已选 buff

    // 塔按钮位置已移入 TOWER_REGISTRY.buttonPos
    // 游戏暂停按钮：右上角（避开 Wave 标签 y=280）
    private readonly PAUSE_BUTTON_POS = new Vec3(420, 220, 0);
    private readonly PAUSE_BUTTON_RADIUS = 36;  // 触摸判定半径
    // 开始下一波按钮：中上（独立一行，避开顶部 HUD）
    private readonly NEXT_WAVE_BUTTON_POS = new Vec3(0, 220, 0);
    private readonly NEXT_WAVE_BUTTON_RADIUS = 80;  // 触摸判定半径（按钮加宽）

    // 拖拽中的塔定义
    private dragTowerDef: TowerDef | null = null;
    // 拖拽模式：'place' 新建 / 'move' 移动已建好的塔
    private dragMode: 'place' | 'move' = 'place';
    // 移动塔时记录原槽位
    private moveFromSlot = -1;
    // 长按删塔状态
    private longPressTower = -1;     // 长按中的塔索引（>=0 时正在长按）
    private longPressTimer = 0;       // 长按计时（秒）
    private longPressStartPos: Vec3 | null = null;  // 长按起始触摸点（gameLocal）
    private longPressTriggered = false;  // 长按是否已触发（弹出选项框）
    // 自爆选项框（长按塔后弹出）
    private explodeMenu: Node | null = null;
    private explodeMenuTowerIndex = -1;  // 选项框对应的塔索引

    protected start(): void {
        view.setDesignResolutionSize(960, 640, 3);
        this.setupScene();
    }

    private setupScene(): void {
        const canvas = this.node;

        // === GameLayer ===
        this.gameLayer = new Node('GameLayer');
        this.gameLayer.layer = Layers.Enum.UI_2D;
        this.gameLayer.setParent(canvas);
        this.gameTransform = this.gameLayer.addComponent(UITransform);
        this.gameTransform.setContentSize(960, 640);

        // === 路径 ===
        this.drawPath(this.gameLayer);

        // === 3个建造点 ===
        for (let i = 0; i < this.SLOT_POSITIONS.length; i++) {
            const slot = this.createTowerSlot(this.SLOT_POSITIONS[i], i);
            slot.setParent(this.gameLayer);
            this.slotNodes.push(slot);
        }

        // === 拖拽幽灵塔 ===
        this.ghostNode = new Node('DragGhost');
        this.ghostNode.layer = Layers.Enum.UI_2D;
        this.ghostNode.setParent(this.gameLayer);
        const ghostTransform = this.ghostNode.addComponent(UITransform);
        ghostTransform.setContentSize(48, 48);
        ghostTransform.setAnchorPoint(0.5, 0.5);
        this.ghostGfx = this.ghostNode.addComponent(Graphics);
        this.drawGhost(false);
        this.ghostNode.active = false;

        // === 塔按钮（从注册表自动生成）===
        for (const def of this.TOWER_REGISTRY) {
            const btn = this.createTowerButton(def);
            btn.setParent(canvas);
        }

        // === 游戏暂停按钮（右上角）===
        this.pauseButton = this.createPauseButton();
        this.pauseButton.setParent(canvas);
        this.pauseButtonLabel = this.pauseButton.getChildByName('Text')?.getComponent(Label) ?? null;
        this.updatePauseButton();

        // === 开始下一波按钮（中上，波次间自动暂停时才显示）===
        this.nextWaveButton = this.createNextWaveButton();
        this.nextWaveButton.setParent(canvas);
        this.nextWaveButtonLabel = this.nextWaveButton.getChildByName('Text')?.getComponent(Label) ?? null;
        this.nextWaveButton.active = false;  // 初始隐藏

        // === Roguelike buff 卡片（3 张，波次间暂停时显示）===
        const cardPositions = [new Vec3(-220, 40, 0), new Vec3(0, 40, 0), new Vec3(220, 40, 0)];
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

            // 0. 判定：是否点中了自爆选项框的按钮（长按塔后弹出）
            if (this.explodeMenu && this.explodeMenu.active) {
                const menuWorldPos = this.explodeMenu.getPosition();
                // 选项框在 canvas 下，buttonLocal 也是 canvas 坐标系
                const explodeBtnPos = new Vec3(menuWorldPos.x, menuWorldPos.y - 25, 0);
                const cancelBtnPos = new Vec3(menuWorldPos.x, menuWorldPos.y - 65, 0);
                // 自爆按钮
                if (Math.abs(buttonLocal.x - explodeBtnPos.x) <= 70 && Math.abs(buttonLocal.y - explodeBtnPos.y) <= 18) {
                    this.executeExplode(this.explodeMenuTowerIndex);
                    this.hideExplodeMenu();
                    this.resetLongPress();
                    return;
                }
                // 取消按钮
                if (Math.abs(buttonLocal.x - cancelBtnPos.x) <= 70 && Math.abs(buttonLocal.y - cancelBtnPos.y) <= 18) {
                    this.hideExplodeMenu();
                    this.resetLongPress();
                    return;
                }
                // 点了选项框外部 → 关闭选项框并继续后续判定
                this.hideExplodeMenu();
                this.resetLongPress();
            }

            // 0a. 判定：是否点中了 buff 卡片（仅波次间暂停且未选时可见）
            if (this.isWavePaused && !this.buffSelected) {
                for (let i = 0; i < this.buffCards.length; i++) {
                    const card = this.buffCards[i];
                    if (!card.active) continue;
                    const cardPos = new Vec3(-220 + i * 220, 40, 0);
                    if (Math.abs(buttonLocal.x - cardPos.x) <= 100 && Math.abs(buttonLocal.y - cardPos.y) <= 70) {
                        this.selectBuff(i);
                        return;
                    }
                }
            }

            // 0b. 判定：是否点中了中上"开始下一波"按钮（选完 buff 后才可见）
            if (this.isWavePaused && this.nextWaveButton && this.nextWaveButton.active
                && Vec3.distance(buttonLocal, this.NEXT_WAVE_BUTTON_POS) <= this.NEXT_WAVE_BUTTON_RADIUS) {
                this.startNextWaveFromButton();
                return;
            }

            // 1. 判定：是否点中了右上角游戏暂停按钮
            if (Vec3.distance(buttonLocal, this.PAUSE_BUTTON_POS) <= this.PAUSE_BUTTON_RADIUS) {
                this.toggleGamePause();
                return;
            }

            // 2. 游戏暂停时完全冻结，不允许拖拽
            if (this.isUserPaused) return;

            // 3. 判断是否点中了塔按钮（新建）——遍历注册表
            let hitButton = false;
            for (const def of this.TOWER_REGISTRY) {
                if (Vec3.distance(buttonLocal, def.buttonPos) <= 40) {
                    this.dragTowerDef = def;
                    this.dragMode = 'place';
                    hitButton = true;
                    break;
                }
            }
            if (!hitButton) {
                // 2. 判断是否点中了已建好的塔（长按删除 / 短按移动）
                let hitTower = -1;
                for (let i = 0; i < this.towers.length; i++) {
                    if (Vec3.distance(gameLocal, this.towers[i].node.position) < 30) {
                        hitTower = i;
                        break;
                    }
                }
                if (hitTower < 0) return;

                // 波次进行中也能长按删塔/移动塔

                // 记录原槽位（移动时用）
                const towerPos = this.towers[hitTower].node.position;
                for (let s = 0; s < this.SLOT_POSITIONS.length; s++) {
                    if (Vec3.distance(towerPos, this.SLOT_POSITIONS[s]) < 5) {
                        this.moveFromSlot = s;
                        break;
                    }
                }
                this.dragTowerDef = this.towers[hitTower].def;
                this.dragMode = 'move';

                // 启动长按检测：不立即拖拽，update 推进计时到阈值则进入删除模式；
                // 若 TOUCH_MOVE 移动超过容忍距离则转为移动拖拽
                this.longPressTower = hitTower;
                this.longPressTimer = 0;
                this.longPressStartPos = gameLocal.clone();
                this.longPressTriggered = false;
                return;  // 不进入 isDragging，等长按触发或移动转拖拽
            }

            // place 模式：立即进入拖拽
            this.isDragging = true;
            this.ghostNode!.active = true;
            this.drawGhost(false);
            this.ghostNode!.setPosition(gameLocal);
            this.updateGhostState(gameLocal);
        });

        canvas.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            // 长按检测中：手指移动超过容忍距离 → 取消长按
            if (this.longPressTower >= 0 && this.longPressStartPos) {
                const local = this.eventToGameLocal(event);
                const moved = Vec3.distance(local, this.longPressStartPos);
                // 未触发：小移动即取消；已触发：大移动才取消（给玩家反悔机会）
                const baseTolerance = this.waveActive
                    ? this.LONG_PRESS_MOVE_TOLERANCE_COMBAT
                    : this.LONG_PRESS_MOVE_TOLERANCE;
                const tolerance = this.longPressTriggered
                    ? baseTolerance * 3
                    : baseTolerance;
                if (moved > tolerance) {
                    if (!this.longPressTriggered && !this.waveActive) {
                        // 波次之间：转为移动拖拽（moveFromSlot/dragTowerDef/dragMode='move' 已在 TOUCH_START 设好）
                        this.isDragging = true;
                        this.ghostNode!.active = true;
                        this.drawGhost(false);
                        this.ghostNode!.setPosition(local);
                        this.updateGhostState(local);
                    }
                    // 进攻中或已触发的删除模式被移动取消 → 直接清空，不进入拖拽
                    this.resetLongPress();
                }
                return;
            }
            if (!this.isDragging) return;
            const local = this.eventToGameLocal(event);
            this.ghostNode!.setPosition(local);
            this.updateGhostState(local);
        });

        canvas.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            // 长按已触发（选项框已弹出）→ 松手不做操作，等用户点选项框按钮
            if (this.longPressTriggered) {
                return;
            }
            // 长按未触发但还在检测中 → 松手取消，什么都不做
            if (this.longPressTower >= 0) {
                this.resetLongPress();
                return;
            }
            if (!this.isDragging) return;
            this.isDragging = false;
            this.ghostNode!.active = false;

            // 直接用 targetSlot（在 TOUCH_MOVE 中已确定）
            // 进攻中禁止移动已放置的塔（只允许新建放置）
            if (this.canPlace && this.targetSlot >= 0 && !(this.dragMode === 'move' && this.waveActive)) {
                const slot = this.targetSlot;

                if (this.dragMode === 'place') {
                    this.placeTower(slot, this.dragTowerDef!);
                } else if (this.dragMode === 'move' && this.moveFromSlot >= 0 && this.moveFromSlot !== slot) {
                    // 找到拖动的塔
                    const movingTowerIdx = this.towers.findIndex(t =>
                        Vec3.distance(t.node.position, this.SLOT_POSITIONS[this.moveFromSlot]) < 5
                    );

                    if (movingTowerIdx >= 0) {
                        if (this.slotOccupied[slot]) {
                            // 目标已占用 → 互换
                            const swapTowerIdx = this.towers.findIndex(t =>
                                Vec3.distance(t.node.position, this.SLOT_POSITIONS[slot]) < 5
                            );
                            if (swapTowerIdx >= 0) {
                                this.towers[movingTowerIdx].node.setPosition(this.SLOT_POSITIONS[slot]);
                                this.towers[swapTowerIdx].node.setPosition(this.SLOT_POSITIONS[this.moveFromSlot]);
                                console.log(`塔互换: 位置 ${this.moveFromSlot + 1} ↔ ${slot + 1}`);
                            }
                        } else {
                            // 目标空 → 直接移动
                            this.towers[movingTowerIdx].node.setPosition(this.SLOT_POSITIONS[slot]);
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
            this.canPlace = false;
            this.targetSlot = -1;
            this.moveFromSlot = -1;
        });

        canvas.on(Node.EventType.TOUCH_CANCEL, () => {
            this.isDragging = false;
            this.ghostNode!.active = false;
            this.canPlace = false;
            this.targetSlot = -1;
            this.moveFromSlot = -1;
            this.resetLongPress();
        });

        // === HUD（统一顶部状态栏：Gold / Base / Status / Wave）===
        const hudNode = new Node('HUD');
        hudNode.layer = Layers.Enum.UI_2D;
        hudNode.setParent(canvas);
        this.hud = hudNode.addComponent(HUD);
        this.hud.init();
        // 兼容旧字段引用：现有 goldLabel/waveLabel/livesLabel/statusLabel 调用无需改动
        this.goldLabel = this.hud.goldLabel;
        this.waveLabel = this.hud.waveLabel;
        this.livesLabel = this.hud.livesLabel;
        this.statusLabel = this.hud.statusLabel;
        this.gold = this.INITIAL_GOLD;
        this.hud.setGold(this.gold);
        this.hud.setWave(0, this.WAVES.length);
        this.hud.setLives(this.allyHp, this.ALLY_MAX_HP);
        this.hud.setStatus('拖拽左侧塔按钮到绿色格子');

        // === 终点友军建筑（城堡）===
        this.drawAlly(this.gameLayer);

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
    }

    /** 关卡开始倒计时：给玩家时间建塔布防，结束后启动第一波 */
    private startLevelCountdown(): void {
        this.levelCountdown = this.LEVEL_START_COUNTDOWN;
        if (this.statusLabel) {
            this.statusLabel.string = `${Math.ceil(this.levelCountdown)} 秒后开始 - 可建塔布防`;
        }
        console.log(`关卡开始倒计时 ${this.LEVEL_START_COUNTDOWN} 秒`);
    }

    /** 开始下一波按钮：波次间自动暂停时点击启动下一波 */
    private startNextWaveFromButton(): void {
        if (!this.isWavePaused) return;
        this.isWavePaused = false;
        this.buffSelected = false;
        this.hideBuffCards();
        this.updateNextWaveButton();
        this.startNextWave();
        console.log('用户点击开始下一波 → 启动 Wave', this.currentWave + 1);
    }

    /** 波次间暂停时：随机选 3 种 buff 并显示卡片 */
    private showBuffSelection(): void {
        // 从 6 种 buff 中随机选 3 种
        const pool = [...ROGUELIKE_BUFFS];
        this.currentBuffChoices = [];
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            this.currentBuffChoices.push(pool.splice(idx, 1)[0]);
        }
        // 显示卡片并填充文字
        for (let i = 0; i < 3; i++) {
            const card = this.buffCards[i];
            const buff = this.currentBuffChoices[i];
            card.active = true;
            if (this.buffCardLabels[i].name) {
                this.buffCardLabels[i].name.string = buff.name;
            }
            if (this.buffCardLabels[i].desc) {
                this.buffCardLabels[i].desc.string = buff.desc;
            }
        }
        this.buffSelected = false;
        // 选 buff 期间隐藏"开始下一波"
        if (this.nextWaveButton) this.nextWaveButton.active = false;
    }

    /** 玩家选中一个 buff */
    private selectBuff(index: number): void {
        const buff = this.currentBuffChoices[index];
        if (!buff) return;
        buff.apply(this.towerStats);
        this.buffSelected = true;
        this.hideBuffCards();
        // 选完后显示"开始下一波"
        this.updateNextWaveButton();
        // 更新 status 显示当前加成
        if (this.statusLabel) {
            this.statusLabel.string = `已选: ${buff.name}  塔: ${this.towers.length}`;
        }
        console.log(`Roguelike 选择: ${buff.name}`);
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
        transform.setContentSize(200, 140);
        node.setPosition(pos);

        const gfx = node.addComponent(Graphics);
        // 深紫色圆角背景
        gfx.fillColor = new Color(40, 30, 70, 230);
        gfx.roundRect(-100, -70, 200, 140, 12);
        gfx.fill();
        // 金色边框
        gfx.strokeColor = new Color(255, 200, 80, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-100, -70, 200, 140, 12);
        gfx.stroke();

        // buff 名称
        const nameNode = new Node('BuffName');
        nameNode.layer = Layers.Enum.UI_2D;
        nameNode.addComponent(UITransform);
        nameNode.setParent(node);
        nameNode.setPosition(0, 20, 0);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = '';
        nameLabel.fontSize = 18;
        nameLabel.color = new Color(255, 220, 100, 255);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const nameTransform = nameNode.getComponent(UITransform)!;
        nameTransform.setContentSize(190, 30);

        // buff 描述
        const descNode = new Node('BuffDesc');
        descNode.layer = Layers.Enum.UI_2D;
        descNode.addComponent(UITransform);
        descNode.setParent(node);
        descNode.setPosition(0, -15, 0);
        const descLabel = descNode.addComponent(Label);
        descLabel.string = '';
        descLabel.fontSize = 14;
        descLabel.color = new Color(200, 200, 220, 255);
        descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const descTransform = descNode.getComponent(UITransform)!;
        descTransform.setContentSize(190, 60);

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

    /** 同步"开始下一波"按钮的可见性和文字 */
    private updateNextWaveButton(): void {
        if (!this.nextWaveButton || !this.nextWaveButtonLabel) return;
        // 只在波次间暂停 + 已选buff（或无下一波）+ 非游戏结束时显示
        const hasMoreWaves = this.currentWave < this.WAVES.length;
        const canStart = this.isWavePaused && !this.isGameOver && (this.buffSelected || !hasMoreWaves);
        this.nextWaveButton.active = canStart;
        if (canStart) {
            const nextWave = this.currentWave + 1;
            this.nextWaveButtonLabel.string = nextWave <= this.WAVES.length
                ? `▶ 开始 Wave ${nextWave}`
                : '▶ 继续';
        }
    }

    /** 启动下一波 */
    private startNextWave(): void {
        if (this.currentWave >= this.WAVES.length) {
            this.victory();
            return;
        }

        const wave = this.WAVES[this.currentWave];
        this.currentWave++;
        this.spawnedInWave = 0;
        this.waveActive = true;

        // 当前波次总敌人数 = 时间线条目数
        this.waveTotalCount = wave.entries.length;

        // 逐只按时间线调度生成
        for (const entry of wave.entries) {
            this.scheduleOnce(() => {
                if (this.isGameOver) return;
                this.spawnEnemy(entry.hp, entry.type);
                this.spawnedInWave++;
            }, entry.time);
        }

        console.log(`Wave ${this.currentWave} 开始: ${this.waveTotalCount} 只`);
        if (this.waveLabel) {
            this.waveLabel.string = `Wave: ${this.currentWave}/${this.WAVES.length}`;
        }
    }

    private victory(): void {
        this.waveActive = false;
        this.isGameOver = true;  // 复用 isGameOver 停止 update 逻辑
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideExplodeMenu();
        this.resetLongPress();
        this.hideBuffCards();
        this.updatePauseButton();
        this.updateNextWaveButton();

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
        for (let i = 0; i < this.SLOT_POSITIONS.length; i++) {
            // 移动模式下：跳过自己原来的槽位，但允许其他已占用的槽位（互换）
            if (this.dragMode === 'move' && i === this.moveFromSlot) continue;
            if (this.dragMode === 'place' && this.slotOccupied[i]) continue;

            const dist = Vec3.distance(local, this.SLOT_POSITIONS[i]);
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
            this.ghostNode!.setPosition(this.SLOT_POSITIONS[nearestSlot]);
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

    private eventToCanvasLocal(event: EventTouch): Vec3 {
        const uiPos = event.getUILocation();
        return this.node.getComponent(UITransform)!.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
    }

    /** 重置长按状态 */
    private resetLongPress(): void {
        this.longPressTower = -1;
        this.longPressTimer = 0;
        this.longPressStartPos = null;
        this.longPressTriggered = false;
    }

    /** 弹出自爆选项框（跟随塔位置） */
    private showExplodeMenu(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        this.hideExplodeMenu();  // 先清理已有的
        const tower = this.towers[towerIndex];
        // 塔在 gameLayer 下，选项框挂在 canvas 下，需把塔世界坐标转为 canvas 局部坐标
        const worldPos = new Vec3();
        tower.node.getWorldPosition(worldPos);
        const canvasTransform = this.node.getComponent(UITransform)!;
        const canvasPos = canvasTransform.convertToNodeSpaceAR(worldPos);

        const menu = new Node('ExplodeMenu');
        menu.layer = Layers.Enum.UI_2D;
        menu.setParent(this.node);
        menu.setPosition(canvasPos.x, canvasPos.y + 60, 0);
        const transform = menu.addComponent(UITransform);
        transform.setContentSize(160, 100);

        const gfx = menu.addComponent(Graphics);
        // 深色半透明背景
        gfx.fillColor = new Color(30, 30, 40, 230);
        gfx.roundRect(-80, -50, 160, 100, 10);
        gfx.fill();
        gfx.strokeColor = new Color(255, 150, 80, 255);
        gfx.lineWidth = 2;
        gfx.roundRect(-80, -50, 160, 100, 10);
        gfx.stroke();

        // 自爆按钮（红橙）
        gfx.fillColor = new Color(200, 60, 40, 255);
        gfx.roundRect(-70, -43, 140, 36, 8);
        gfx.fill();
        const explodeLabelNode = new Node('ExplodeLabel');
        explodeLabelNode.layer = Layers.Enum.UI_2D;
        explodeLabelNode.setParent(menu);
        explodeLabelNode.addComponent(UITransform);
        explodeLabelNode.setPosition(0, -25, 0);
        const explodeLabel = explodeLabelNode.addComponent(Label);
        explodeLabel.string = `自爆（-${this.TOWER_REMOVE_COST}金币）`;
        explodeLabel.fontSize = 16;
        explodeLabel.color = new Color(255, 255, 255, 255);
        explodeLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        explodeLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const explodeT = explodeLabelNode.getComponent(UITransform)!;
        explodeT.setContentSize(140, 36);

        // 取消按钮（灰色）
        gfx.fillColor = new Color(70, 70, 80, 255);
        gfx.roundRect(-70, -83, 140, 36, 8);
        gfx.fill();
        const cancelLabelNode = new Node('CancelLabel');
        cancelLabelNode.layer = Layers.Enum.UI_2D;
        cancelLabelNode.setParent(menu);
        cancelLabelNode.addComponent(UITransform);
        cancelLabelNode.setPosition(0, -65, 0);
        const cancelLabel = cancelLabelNode.addComponent(Label);
        cancelLabel.string = '取消';
        cancelLabel.fontSize = 16;
        cancelLabel.color = new Color(220, 220, 220, 255);
        cancelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        cancelLabel.verticalAlign = Label.VerticalAlign.CENTER;
        const cancelT = cancelLabelNode.getComponent(UITransform)!;
        cancelT.setContentSize(140, 36);

        this.explodeMenu = menu;
        this.explodeMenuTowerIndex = towerIndex;
        console.log(`长按塔 ${towerIndex}，弹出选项框`);
    }

    /** 隐藏自爆选项框 */
    private hideExplodeMenu(): void {
        if (this.explodeMenu) {
            this.explodeMenu.destroy();
            this.explodeMenu = null;
        }
        this.explodeMenuTowerIndex = -1;
    }

    /** 执行自爆：扣金币 + 删除塔 + AOE 爆炸伤害 + 光波动画 */
    private executeExplode(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        if (this.gold < this.TOWER_REMOVE_COST) {
            console.log(`金币不足，自爆需要 ${this.TOWER_REMOVE_COST}`);
            if (this.statusLabel) this.statusLabel.string = `金币不足！自爆需要 ${this.TOWER_REMOVE_COST} 金币`;
            return;
        }
        const tower = this.towers[towerIndex];
        const explodePos = tower.node.position.clone();
        const def = tower.def;
        // 扣金币
        this.gold -= this.TOWER_REMOVE_COST;
        this.updateGoldLabel();
        // 释放槽位
        for (let s = 0; s < this.SLOT_POSITIONS.length; s++) {
            if (Vec3.distance(explodePos, this.SLOT_POSITIONS[s]) < 5) {
                this.slotOccupied[s] = false;
                this.slotNodes[s].active = true;
                break;
            }
        }
        // 删除塔
        tower.node.destroy();
        this.towers.splice(towerIndex, 1);
        this.towerTimers.splice(towerIndex, 1);
        // AOE 伤害
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            const d = Vec3.distance(explodePos, e.node.position);
            if (d <= this.EXPLOSION_RADIUS) {
                e.hp -= this.EXPLOSION_DAMAGE;
                def.onBulletHit?.(e);  // 触发塔的命中效果（如毒 buff）
                if (e.hp <= 0) {
                    e.node.destroy();
                    this.enemies.splice(j, 1);
                    this.gold += this.KILL_REWARD;
                    this.updateGoldLabel();
                    console.log(`爆炸击杀！+${this.KILL_REWARD} 金币`);
                }
            }
        }
        // 爆炸光波动画
        this.createExplosionWave(explodePos);
        console.log(`塔自爆！位置 (${explodePos.x}, ${explodePos.y})，AOE ${this.EXPLOSION_RADIUS}px / ${this.EXPLOSION_DAMAGE} 伤害`);
    }

    /** 创建爆炸光波动画（扩散+淡出，约 0.4 秒） */
    private createExplosionWave(pos: Vec3): void {
        if (!this.gameLayer) return;
        const wave = new Node('ExplosionWave');
        wave.layer = Layers.Enum.UI_2D;
        wave.setParent(this.gameLayer);
        wave.setPosition(pos);
        const transform = wave.addComponent(UITransform);
        transform.setContentSize(this.EXPLOSION_RADIUS * 2, this.EXPLOSION_RADIUS * 2);
        transform.setAnchorPoint(0.5, 0.5);
        const gfx = wave.addComponent(Graphics);

        // 初始光波
        const drawWave = (radius: number, alpha: number) => {
            gfx.clear();
            // 外圈光波（橙色，扩散）
            gfx.strokeColor = new Color(255, 180, 80, alpha);
            gfx.lineWidth = 6;
            gfx.circle(0, 0, radius);
            gfx.stroke();
            // 内圈填充（红橙，淡出）
            gfx.fillColor = new Color(255, 100, 50, alpha * 0.4);
            gfx.circle(0, 0, radius * 0.7);
            gfx.fill();
        };

        // 动画分 5 帧，半径从 10 扩散到 60，alpha 从 255 淡出到 0
        let frame = 0;
        const totalFrames = 5;
        const startRadius = 10;
        const endRadius = this.EXPLOSION_RADIUS;
        drawWave(startRadius, 255);

        this.schedule(() => {
            frame++;
            const t = frame / totalFrames;  // 0→1
            const radius = startRadius + (endRadius - startRadius) * t;
            const alpha = Math.round(255 * (1 - t));
            if (frame >= totalFrames) {
                wave.destroy();
            } else {
                drawWave(radius, alpha);
            }
        }, 0.08, totalFrames - 1, 0);
    }

    protected update(dt: number): void {
        if (this.isGameOver) return;

        // 用户暂停：完全冻结游戏逻辑（敌人/塔/子弹都不动），拖拽也在 TOUCH_START 中被阻止
        if (this.isUserPaused) return;

        // === 关卡开始倒计时 ===
        if (this.levelCountdown > 0) {
            this.levelCountdown -= dt;
            if (this.levelCountdown <= 0) {
                this.levelCountdown = 0;
                this.startNextWave();
            } else {
                if (this.statusLabel) {
                    this.statusLabel.string = `${Math.ceil(this.levelCountdown)} 秒后开始 - 可建塔布防`;
                }
            }
            return;  // 倒计时期间不推进波次/敌人/塔逻辑
        }

        // === 长按删塔检测 ===
        if (this.longPressTower >= 0 && !this.longPressTriggered) {
            this.longPressTimer += dt;
            if (this.longPressTimer >= this.LONG_PRESS_THRESHOLD) {
                this.longPressTriggered = true;
                this.showExplodeMenu(this.longPressTower);
            }
        }

        // === 波次完成检测 ===
        if (this.waveActive) {
            // 全部生成且全部死亡 → 自动暂停，等用户选 buff + 点"开始下一波"
            if (this.spawnedInWave >= this.waveTotalCount && this.enemies.length === 0) {
                this.waveActive = false;
                this.isWavePaused = true;
                this.updatePauseButton();
                // 还有下一波才显示 buff 选择，否则直接显示"开始下一波"（会触发胜利）
                if (this.currentWave < this.WAVES.length) {
                    this.showBuffSelection();
                } else {
                    this.updateNextWaveButton();
                }
                console.log(`Wave ${this.currentWave} 完成（${this.waveTotalCount} 只全部消灭），已自动暂停`);
            }
        }
        // 注意：原 waveDelay 自动倒计时逻辑已删除——下一波由用户点暂停按钮触发

        // === 敌人移动 ===
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.node.isValid) {
                this.enemies.splice(i, 1);
                continue;
            }

            const pos = e.node.position;
            const dx = this.PATH_END.x - pos.x;

            if (Math.abs(dx) < 5) {
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
                const eDef = this.getEnemyDef(e.type);
                const speedMult = eDef?.speedMultiplier ?? 1;
                const speed = this.ENEMY_SPEED * speedMult * e.slowMultiplier;
                e.node.setPosition(pos.x + Math.sign(dx) * speed * dt, pos.y, 0);
            }
        }

        // === HP 显示（选项框显示时保留提示，不覆盖）===
        if (this.statusLabel && !this.explodeMenu) {
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
        const ts = this.towerStats;
        const effectiveRange = (def: TowerDef) => def.range * ts.rangeMultiplier;
        const effectiveInterval = (def: TowerDef) => def.interval / ts.speedMultiplier;
        for (let i = 0; i < this.towers.length; i++) {
            if (this.enemies.length === 0) continue;
            const tower = this.towers[i];
            const def = tower.def;

            // 找最近的敌人（用 roguelike 范围加成）
            let nearestEnemy = -1;
            let nearestDist = Infinity;
            for (let j = 0; j < this.enemies.length; j++) {
                if (!this.enemies[j].node.isValid) continue;
                const dist = Vec3.distance(tower.node.position, this.enemies[j].node.position);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestEnemy = j;
                }
            }

            if (nearestEnemy < 0 || nearestDist > effectiveRange(def)) continue;

            this.towerTimers[i] += dt;
            if (this.towerTimers[i] >= effectiveInterval(def)) {
                this.towerTimers[i] = 0;

                // 只对主目标发射 1 颗子弹；分裂在主弹命中后触发（见子弹更新段）
                const target = this.enemies[nearestEnemy];
                if (!target || !target.node.isValid) continue;

                if (def.attackKind === 'bullet') {
                    this.fireBullet(tower.node.position, target.node.position, target.node, def);
                } else {
                    // 瞬间效果型：调用注册的 applyInstant
                    def.applyInstant?.(target);
                    this.fireBullet(tower.node.position, target.node.position, target.node, def);
                }
            }
        }

        // === 敌人减速计时 ===
        for (const e of this.enemies) {
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                if (e.slowTimer <= 0) {
                    e.slowMultiplier = 1;
                }
            }
        }

        // === 通用 buff 处理（毒 buff 等：每秒掉血 + 倒计时）===
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            for (const key in e.buffs) {
                const buff = e.buffs[key];
                buff.timer -= dt;
                e.hp -= buff.dps * dt;   // 每秒掉 dps 血
                if (buff.timer <= 0) {
                    delete e.buffs[key];
                }
            }
            // buff 掉血致死
            if (e.hp <= 0) {
                e.node.destroy();
                this.enemies.splice(i, 1);
                this.gold += this.KILL_REWARD;
                this.updateGoldLabel();
                console.log(`buff击杀！+${this.KILL_REWARD} 金币`);
            }
        }

        // === 敌人特殊行为（治疗者光环等）——遍历注册表的 onUpdate ===
        for (const e of this.enemies) {
            const def = this.getEnemyDef(e.type);
            if (def?.onUpdate) {
                def.onUpdate(e, dt, this.enemies);
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
            const moveDist = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
            b.node.setPosition(pos.x + b.vx * dt, pos.y + b.vy * dt, 0);

            if (b.isSplit) {
                // === 分裂弹：检查命中附近任何敌人（不追踪固定目标）===
                let hit = false;
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    if (!e.node.isValid) continue;
                    const d = Vec3.distance(b.node.position, e.node.position);
                    if (d < 16) {
                        // 分裂弹伤害（主弹的一半）
                        e.hp -= b.def.damage * this.towerStats.damageMultiplier * 0.5;
                        b.def.onBulletHit?.(e);
                        if (this.towerStats.slowLevel > 0) {
                            const slowMult = Math.max(0.3, 0.85 - this.towerStats.slowLevel * 0.05);
                            if (e.slowMultiplier > slowMult) {
                                e.slowMultiplier = slowMult;
                                e.slowTimer = 1.5;
                            }
                        }
                        b.node.destroy();
                        this.bullets.splice(i, 1);
                        hit = true;
                        if (e.hp <= 0) {
                            e.node.destroy();
                            this.enemies.splice(j, 1);
                            this.gold += this.KILL_REWARD;
                            this.updateGoldLabel();
                            console.log(`分裂击杀！+${this.KILL_REWARD} 金币`);
                        }
                        break;
                    }
                }
                if (hit) continue;

                // 分裂弹飞完 life 距离就销毁
                b.life -= moveDist;
                if (b.life <= 0) {
                    b.node.destroy();
                    this.bullets.splice(i, 1);
                }
                continue;
            }

            // === 主弹：命中固定目标 ===
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (!e.node.isValid || !b.target.isValid) continue;
                if (b.target !== e.node) continue;  // 只命中目标

                const d = Vec3.distance(b.node.position, e.node.position);
                if (d < 16) {
                    // 用 roguelike 伤害加成（加法叠加：base × (1 + 累计加成)）
                    e.hp -= b.def.damage * this.towerStats.damageMultiplier;
                    // 子弹命中额外效果（如施加毒 buff）
                    b.def.onBulletHit?.(e);
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

                    // Roguelike 分裂 buff：主弹命中后分裂出 2 颗小弹
                    if (this.towerStats.splitCount > 0) {
                        const splitCount = 2 * this.towerStats.splitCount;
                        const hitPos = b.node.position.clone();
                        for (let s = 0; s < splitCount; s++) {
                            // 随机方向，目标点 = 命中点 + 随机方向 10px
                            const angle = Math.random() * Math.PI * 2;
                            const targetPos = new Vec3(
                                hitPos.x + Math.cos(angle) * 10,
                                hitPos.y + Math.sin(angle) * 10,
                                0
                            );
                            // 分裂弹无固定目标（target 传自身，靠 isSplit 逻辑命中附近敌人）
                            this.fireBullet(hitPos, targetPos, e.node, b.def, true);
                        }
                    }

                    b.node.destroy();
                    this.bullets.splice(i, 1);
                    hit = true;

                    if (e.hp <= 0) {
                        e.node.destroy();
                        this.enemies.splice(j, 1);
                        this.gold += this.KILL_REWARD;
                        this.updateGoldLabel();
                        console.log(`击杀！+${this.KILL_REWARD} 金币，当前 ${this.gold}`);
                    }
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
    }

    /** 生成敌人（从注册表取属性和外观） */
    private spawnEnemy(hp: number, type: string = 'normal'): void {
        if (!this.gameLayer) return;

        const def = this.getEnemyDef(type);
        if (!def) {
            console.warn(`未注册的敌人类型: ${type}`);
            return;
        }

        // 实际血量 = 配置 hp × 注册表 hpMultiplier
        const actualHp = Math.floor(hp * def.hpMultiplier);

        const enemy = new Node(def.name);
        enemy.layer = Layers.Enum.UI_2D;
        enemy.setParent(this.gameLayer);
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
            type, healTimer: 0, extraTimer: 0,
            buffs: {},
        });
    }

    /** 发射子弹。isSplit=true 时为分裂弹（无目标追踪，靠 life 距离销毁） */
    private fireBullet(from: Vec3, to: Vec3, target: Node, def: TowerDef, isSplit = false): void {
        if (!this.gameLayer) return;

        const bullet = new Node(isSplit ? 'SplitBullet' : 'Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(this.gameLayer);
        bullet.setPosition(from);

        const transform = bullet.addComponent(UITransform);
        transform.setContentSize(isSplit ? 8 : 12, isSplit ? 8 : 12);

        const gfx = bullet.addComponent(Graphics);
        // 用塔定义的颜色画子弹（分裂弹半透明）
        const alpha = isSplit ? 180 : 255;
        gfx.fillColor = new Color(def.color.r, def.color.g, def.color.b, alpha);
        gfx.circle(0, 0, isSplit ? 4 : 6);
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
            isSplit,
            life: isSplit ? 10 : Infinity,  // 分裂弹最远飞 10px
        });
    }

    private placeTower(slotIndex: number, def: TowerDef): void {
        if (this.slotOccupied[slotIndex] || !this.gameLayer) return;
        if (this.gold < def.cost) return;

        this.gold -= def.cost;
        this.updateGoldLabel();

        const tower = this.createTower(this.SLOT_POSITIONS[slotIndex], def);
        tower.setParent(this.gameLayer);

        this.towers.push({ node: tower, def });
        this.towerTimers.push(def.interval);
        this.slotOccupied[slotIndex] = true;
        this.slotNodes[slotIndex].active = false;

        console.log(`${def.name}放置到位置 ${slotIndex + 1}，花费 ${def.cost}，当前 ${this.towers.length} 塔`);
    }

    private updateGoldLabel(): void {
        if (this.goldLabel) {
            this.goldLabel.string = `Gold: ${this.gold}`;
        }
    }

    // === 游戏结束弹窗 ===
    private gameOverPanel: Node | null = null;
    private isGameOver = false;

    private gameOver(): void {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.waveActive = false;
        this.waveDelay = 0;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideExplodeMenu();
        this.resetLongPress();
        this.hideBuffCards();
        this.updatePauseButton();
        this.updateNextWaveButton();

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

        // 清除所有塔和建造点
        for (const tower of this.towers) tower.node.destroy();
        this.towers.length = 0;
        this.towerTimers.length = 0;

        // 恢复建造点
        for (let i = 0; i < this.slotOccupied.length; i++) {
            this.slotOccupied[i] = false;
            this.slotNodes[i].active = true;
        }

        // 重置状态
        this.isGameOver = false;
        this.gold = this.INITIAL_GOLD;
        this.allyHp = this.ALLY_MAX_HP;
        this.currentWave = 0;
        this.spawnedInWave = 0;
        this.spawnTimer = 0;
        this.waveActive = false;
        this.waveDelay = 0;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.towerStats.reset();
        this.resetLongPress();
        this.hideExplodeMenu();
        this.hideBuffCards();
        this.updatePauseButton();
        this.updateNextWaveButton();

        // 更新 HUD
        this.updateGoldLabel();
        if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.ALLY_MAX_HP}`;
        if (this.waveLabel) this.waveLabel.string = `Wave: 0/${this.WAVES.length}`;
        if (this.statusLabel) this.statusLabel.string = '拖拽左侧塔按钮到绿色格子';

        // 关卡开始倒计时
        this.startLevelCountdown();
        console.log('游戏重新开始');
    }

    private createTowerButton(def: TowerDef): Node {
        const node = new Node(def.id + '_Button');
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(80, 80);
        node.setPosition(def.buttonPos);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-30, -30, 60, 60);
        gfx.fill();
        // 塔主体色
        gfx.fillColor = def.color;
        gfx.circle(0, 0, 16);
        gfx.fill();

        // 价格标签
        const labelNode = new Node('Cost');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        labelNode.setParent(node);
        labelNode.setPosition(0, -32, 0);
        const label = labelNode.addComponent(Label);
        label.string = `${def.cost}`;
        label.fontSize = 12;

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

    /** 创建中上"开始下一波"按钮 */
    private createNextWaveButton(): Node {
        const node = new Node('NextWaveButton');
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(160, 40);
        node.setPosition(this.NEXT_WAVE_BUTTON_POS);

        const gfx = node.addComponent(Graphics);
        // 圆角按钮背景（绿色，醒目）
        gfx.fillColor = new Color(60, 160, 80, 255);
        gfx.roundRect(-76, -18, 152, 36, 8);
        gfx.fill();
        gfx.strokeColor = new Color(255, 255, 255, 200);
        gfx.lineWidth = 2;
        gfx.roundRect(-76, -18, 152, 36, 8);
        gfx.stroke();

        // 按钮文字
        const textNode = new Node('Text');
        textNode.layer = Layers.Enum.UI_2D;
        textNode.addComponent(UITransform);
        textNode.setParent(node);
        textNode.setPosition(0, 0, 0);
        const label = textNode.addComponent(Label);
        label.string = '▶ 开始 Wave 1';
        label.fontSize = 18;
        label.color = new Color(255, 255, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        const textTransform = textNode.getComponent(UITransform)!;
        textTransform.setContentSize(152, 36);

        return node;
    }

    private createTower(pos: Vec3, def: TowerDef): Node {
        const node = new Node(def.name + 'Tower');
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(48, 48);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-20, -20, 40, 40);
        gfx.fill();
        gfx.fillColor = def.color;
        gfx.circle(0, 0, 14);
        gfx.fill();
        gfx.fillColor = new Color(255, 255, 255, 255);
        gfx.circle(0, 0, 4);
        gfx.fill();
        gfx.strokeColor = def.rangeColor;
        gfx.lineWidth = 2;
        gfx.circle(0, 0, def.range);
        gfx.stroke();

        return node;
    }

    private createTowerSlot(pos: Vec3, index: number): Node {
        const node = new Node(`Slot_${index}`);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(56, 56);

        const gfx = node.addComponent(Graphics);
        gfx.lineWidth = 3;
        gfx.strokeColor = new Color(100, 200, 100, 200);
        gfx.fillColor = new Color(100, 200, 100, 60);
        gfx.rect(-28, -28, 56, 56);
        gfx.fill();
        gfx.stroke();

        gfx.strokeColor = new Color(100, 200, 100, 255);
        gfx.lineWidth = 3;
        gfx.moveTo(-10, 0); gfx.lineTo(10, 0);
        gfx.moveTo(0, -10); gfx.lineTo(0, 10);
        gfx.stroke();

        return node;
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
        gfx.lineWidth = 40;
        gfx.strokeColor = new Color(200, 180, 140, 180);
        gfx.moveTo(this.PATH_START.x, this.PATH_START.y);
        gfx.lineTo(this.PATH_END.x, this.PATH_END.y);
        gfx.stroke();

        gfx.fillColor = new Color(0, 255, 0, 200);
        gfx.circle(this.PATH_START.x, this.PATH_START.y, 20);
        gfx.fill();

        gfx.fillColor = new Color(255, 0, 0, 200);
        gfx.circle(this.PATH_END.x, this.PATH_END.y, 20);
        gfx.fill();
    }
}
