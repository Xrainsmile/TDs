import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';
import { HUD } from '../ui/HUD';
import { EffectManager } from './EffectManager';
import {
    PATH_WAYPOINTS as _PATH_WAYPOINTS, ENEMY_SPEED, BULLET_SPEED,
    INITIAL_GOLD, KILL_REWARD, WAVE_BONUSES,
    EXPLOSION_RADIUS, EXPLOSION_DAMAGE, LEVEL_START_COUNTDOWN,
    SLOT_POSITIONS as _SLOT_POSITIONS, HEAL_RADIUS, HEAL_INTERVAL, HEAL_AMOUNT,
    ATTACK_BUTTON_POS, SLOW_BUTTON_POS, POISON_BUTTON_POS,
    WAVES,
    type TowerDef, type EnemyDef, type SpawnEntry, type WaveConfig, type TowerAttackKind,
} from './GameBalance';

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
    splashLevel = 0;        // 溅射等级（0=未解锁，>0=主弹命中后爆炸 AOE）
    bleedLevel = 0;         // 出血等级（0=未解锁，>0=概率施加出血+暴击）
    slowLevel = 0;          // 减速等级（>0 时所有子弹附带减速）

    // 最终倍率 = 1 + 累计加成（加法叠加）
    get damageMultiplier() { return 1 + this.damageBonus; }
    get speedMultiplier() { return 1 + this.speedBonus; }
    get rangeMultiplier() { return 1 + this.rangeBonus; }
    get healMultiplier() { return Math.max(0, 1 - this.healSuppression); }

    // 溅射 AOE 参数（随等级提升）
    get splashRadius() { return 40 + this.splashLevel * 10; }       // 基础 40px，每级 +10
    get splashDamage() { return 0.5 + this.splashLevel * 0.15; }    // 主弹伤害的 50%+15%/级

    // 出血参数（随等级提升）
    get bleedChance() { return 0.05 + this.bleedLevel * 0.05; }     // 5%+5%/级
    get bleedDuration() { return 2.0; }                               // 固定 2 秒
    get critChance() { return 0.3 + this.bleedLevel * 0.1; }       // 暴击率 30%+10%/级
    get critMultiplier() { return 2.0 + this.bleedLevel * 0.5; }    // 暴击倍率 2x+0.5/级

    reset(): void {
        this.damageBonus = 0;
        this.speedBonus = 0;
        this.rangeBonus = 0;
        this.healSuppression = 0;
        this.splashLevel = 0;
        this.bleedLevel = 0;
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
        id: 'splash',
        name: '溅射爆炸',
        desc: '',  // 动态生成，见 getBuffDisplay
        apply: s => { s.splashLevel += 1; },
    },
    {
        id: 'bleed',
        name: '出血',
        desc: '',  // 动态生成，见 getBuffDisplay
        apply: s => { s.bleedLevel += 1; },
    },
];

/** 获取 buff 在卡片上显示的名称和描述（展示选择前→选择后的数值变化） */
function getBuffDisplay(buff: BuffOption, stats: TowerStats): { name: string; desc: string } {
    // 模拟选择后的 stats（浅拷贝）
    const after = new TowerStats();
    after.damageBonus = stats.damageBonus;
    after.speedBonus = stats.speedBonus;
    after.rangeBonus = stats.rangeBonus;
    after.healSuppression = stats.healSuppression;
    after.splashLevel = stats.splashLevel;
    after.bleedLevel = stats.bleedLevel;
    after.slowLevel = stats.slowLevel;
    buff.apply(after);

    if (buff.id === 'damage') {
        return {
            name: '攻击伤害 +10%',
            desc: `伤害倍率 ${stats.damageMultiplier.toFixed(1)}x → ${after.damageMultiplier.toFixed(1)}x`,
        };
    }
    if (buff.id === 'speed') {
        return {
            name: '攻速 +5%',
            desc: `攻速倍率 ${Math.round(stats.speedMultiplier * 100)}% → ${Math.round(after.speedMultiplier * 100)}%`,
        };
    }
    if (buff.id === 'range') {
        return {
            name: '范围 +10%',
            desc: `范围倍率 ${Math.round(stats.rangeMultiplier * 100)}% → ${Math.round(after.rangeMultiplier * 100)}%`,
        };
    }
    if (buff.id === 'healSuppress') {
        return {
            name: '治疗抑制',
            desc: `抑制 ${Math.round(stats.healSuppression * 100)}% → ${Math.round(after.healSuppression * 100)}%`,
        };
    }
    if (buff.id === 'splash') {
        if (stats.splashLevel === 0) {
            return {
                name: '溅射爆炸',
                desc: `解锁：命中后爆炸 ${after.splashRadius}px / ${Math.round(after.splashDamage * 100)}% 伤害`,
            };
        }
        return {
            name: `溅射强化 Lv${after.splashLevel}`,
            desc: `${stats.splashRadius}px / ${Math.round(stats.splashDamage * 100)}% → ${after.splashRadius}px / ${Math.round(after.splashDamage * 100)}%`,
        };
    }
    if (buff.id === 'bleed') {
        if (stats.bleedLevel === 0) {
            return {
                name: '出血',
                desc: `解锁：${Math.round(after.bleedChance * 100)}%施加出血 / ${Math.round(after.critChance * 100)}%暴击 / ${after.critMultiplier}x暴伤`,
            };
        }
        return {
            name: `出血强化 Lv${after.bleedLevel}`,
            desc: `${Math.round(stats.bleedChance * 100)}%/${Math.round(stats.critChance * 100)}%/${stats.critMultiplier}x → ${Math.round(after.bleedChance * 100)}%/${Math.round(after.critChance * 100)}%/${after.critMultiplier}x`,
        };
    }
    return { name: buff.name, desc: buff.desc };
}

/** 敌人运行时数据（定义在配置表之外，因为含运行时状态） */
interface EnemyRuntime {
    node: Node; hp: number; maxHp: number;
    slowTimer: number; slowMultiplier: number;
    type: string;           // 对应 EnemyDef.id
    healTimer: number;      // 治疗者光环计时
    // 扩展字段：新敌人的特殊计时器都挂这里，避免改结构
    extraTimer: number;
    // 路径目标索引（当前前往的 waypoint）
    pathIdx: number;
    // 通用 buff 字典：存 { timer: 剩余秒数, dps: 每秒掉血量 }
    // 新增 buff 只需往这里写一个 key，update 中自动处理掉血
    buffs: Record<string, { timer: number; dps: number }>;
}

/** 敌人类型（向后兼容，实际用 string） */
type EnemyType = string;

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

    // 路径（响应式：优先用动态计算，fallback 到 GameBalance 静态值）
    private get PATH_WAYPOINTS() { return this._dynamicPath.length > 0 ? this._dynamicPath : _PATH_WAYPOINTS; }
    private get PATH_START() { return this.PATH_WAYPOINTS[0]; }
    private get PATH_END() { return this.PATH_WAYPOINTS[this.PATH_WAYPOINTS.length - 1]; }

    // 基础数值（从 GameBalance 引用）
    private get ENEMY_SPEED() { return ENEMY_SPEED; }
    private get BULLET_SPEED() { return BULLET_SPEED; }
    private get INITIAL_GOLD() { return INITIAL_GOLD; }
    private get KILL_REWARD() { return KILL_REWARD; }
    private get WAVE_BONUSES() { return WAVE_BONUSES; }
    private get EXPLOSION_RADIUS() { return EXPLOSION_RADIUS; }
    private get EXPLOSION_DAMAGE() { return EXPLOSION_DAMAGE; }
    private get LEVEL_START_COUNTDOWN() { return LEVEL_START_COUNTDOWN; }
    private get HEAL_RADIUS() { return HEAL_RADIUS; }
    private get HEAL_INTERVAL() { return HEAL_INTERVAL; }
    private get HEAL_AMOUNT() { return HEAL_AMOUNT; }

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
            applyInstant: (enemy: EnemyRuntime) => {
                enemy.slowMultiplier = 0.7;
                enemy.slowTimer = 1.0;
                EffectManager.instance?.playSlow(enemy.node);
            },
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
            onBulletHit: (enemy: EnemyRuntime) => {
                const existing = enemy.buffs['poison'];
                if (existing) {
                    existing.timer = 3.0;
                    existing.dps = Math.max(existing.dps, 8);
                } else {
                    enemy.buffs['poison'] = { timer: 3.0, dps: 8 };
                }
                EffectManager.instance?.playPoison(enemy.node);
            },
        },
    ];

    // ===== 敌人注册表（含闭包引用 this.towerStats/HEAL_*，保留在 SceneInitializer）=====
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
    ];

    /** 按 id 查塔定义 */
    private getTowerDef(id: string): TowerDef | undefined {
        return this.TOWER_REGISTRY.find(t => t.id === id);
    }
    /** 按 id 查敌人定义 */
    private getEnemyDef(id: string): EnemyDef | undefined {
        return this.ENEMY_REGISTRY.find(e => e.id === id);
    }

    // 波次配置（从 GameBalance 引用）
    private get WAVES() { return WAVES; }

    // 建造点（响应式：优先用动态计算，fallback 到 GameBalance 静态值）
    private get SLOT_POSITIONS() { return this._dynamicSlots.length > 0 ? this._dynamicSlots : _SLOT_POSITIONS; }
    private slotNodes: Node[] = [];
    private slotOccupied: boolean[] = new Array(6).fill(false);

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
    private bullets: { node: Node; vx: number; vy: number; target: Node; def: TowerDef }[] = [];
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
    // 游戏暂停按钮：右侧（setupScene 中动态赋值）
    private PAUSE_BUTTON_POS = new Vec3(420, 220, 0);
    private readonly PAUSE_BUTTON_RADIUS = 36;  // 触摸判定半径
    // 开始下一波按钮：中上（独立一行，避开顶部 HUD）
    private NEXT_WAVE_BUTTON_POS = new Vec3(0, 220, 0);
    private readonly NEXT_WAVE_BUTTON_RADIUS = 80;  // 触摸判定半径（按钮加宽）

    // 响应式布局动态计算结果（setupScene 中赋值）
    private _visibleSize: { width: number; height: number } = { width: 960, height: 640 };
    private _battleLeft = -300;
    private _battleRight = 300;
    private _dynamicSlots: Vec3[] = [];
    private _dynamicPath: Vec3[] = [];
    private _dynamicBtnPos: Vec3[] = [];
    private _dynamicPausePos = new Vec3();
    private _dynamicNextWavePos = new Vec3();

    // 拖拽中的塔定义
    private dragTowerDef: TowerDef | null = null;
    // 拖拽模式：'place' 新建 / 'move' 移动已建好的塔
    private dragMode: 'place' | 'move' = 'place';
    // 移动塔时记录原槽位
    private moveFromSlot = -1;
    // 点击塔弹出的操作菜单（移动/出售/自爆）
    private towerMenu: Node | null = null;
    private towerMenuIndex = -1;  // 菜单对应的塔索引

    protected start(): void {
        view.setDesignResolutionSize(960, 640, 3);
        this.setupScene();
    }

    private setupScene(): void {
        const canvas = this.node;

        // === 响应式布局：获取真实可见宽度，计算三块区域 ===
        const visible = view.getVisibleSize();
        const halfW = visible.width / 2;
        const halfH = visible.height / 2;
        const margin = 24;
        const leftPanelWidth = 120;
        const rightPanelWidth = 150;
        const battleLeft = -halfW + leftPanelWidth + margin;
        const battleRight = halfW - rightPanelWidth - margin;
        const battleWidth = battleRight - battleLeft;

        // 动态计算塔位（下排 y=-80，上排 y=80）
        const slotX1 = battleLeft + battleWidth * 0.25;
        const slotX2 = battleLeft + battleWidth * 0.50;
        const slotX3 = battleLeft + battleWidth * 0.75;
        const dynamicSlots: Vec3[] = [
            new Vec3(slotX1, -80, 0), new Vec3(slotX2, -80, 0), new Vec3(slotX3, -80, 0),
            new Vec3(slotX1, 80, 0),  new Vec3(slotX2, 80, 0),  new Vec3(slotX3, 80, 0),
        ];
        // 动态计算路径（折线，水平段在塔位之间）
        const dynamicPath: Vec3[] = [
            new Vec3(battleLeft, -halfH * 0.4, 0),   // 起点（左下）
            new Vec3(battleLeft, 0, 0),               // 拐点1（左中）
            new Vec3(battleRight, 0, 0),              // 拐点2（右中）
            new Vec3(battleRight, halfH * 0.4, 0),    // 终点（右上）
        ];
        // 动态塔按钮位置（左侧面板竖排）
        const btnX = -halfW + margin + 48;
        const dynamicBtnPos = [
            new Vec3(btnX, -180, 0),
            new Vec3(btnX, -60, 0),
            new Vec3(btnX, 60, 0),
        ];
        // 动态暂停/开始按钮位置（右侧面板）
        const pauseBtnX = halfW - rightPanelWidth / 2;
        const dynamicPausePos = new Vec3(pauseBtnX, halfH - 60, 0);
        const dynamicNextWavePos = new Vec3(0, halfH - 100, 0);

        // 保存到实例字段供后续使用
        this._visibleSize = visible;
        this._battleLeft = battleLeft;
        this._battleRight = battleRight;
        this._dynamicSlots = dynamicSlots;
        this._dynamicPath = dynamicPath;
        this._dynamicBtnPos = dynamicBtnPos;
        this._dynamicPausePos = dynamicPausePos;
        this._dynamicNextWavePos = dynamicNextWavePos;

        // === GameLayer ===
        this.gameLayer = new Node('GameLayer');
        this.gameLayer.layer = Layers.Enum.UI_2D;
        this.gameLayer.setParent(canvas);
        this.gameTransform = this.gameLayer.addComponent(UITransform);
        this.gameTransform.setContentSize(visible.width, visible.height);
        // 挂载特效管理器
        this.gameLayer.addComponent(EffectManager);

        // === 路径 ===
        this.drawPath(this.gameLayer);

        // === 6个建造点 ===
        for (let i = 0; i < dynamicSlots.length; i++) {
            const slot = this.createTowerSlot(dynamicSlots[i], i);
            slot.setParent(this.gameLayer);
            this.slotNodes.push(slot);
        }

        // === 拖拽幽灵塔 ===
        this.ghostNode = new Node('DragGhost');
        this.ghostNode.layer = Layers.Enum.UI_2D;
        this.ghostNode.setParent(this.gameLayer);
        const ghostTransform = this.ghostNode.addComponent(UITransform);
        ghostTransform.setContentSize(64, 64);
        ghostTransform.setAnchorPoint(0.5, 0.5);
        this.ghostGfx = this.ghostNode.addComponent(Graphics);
        this.drawGhost(false);
        this.ghostNode.active = false;

        // === 塔按钮（从注册表自动生成，位置用动态计算）===
        for (let i = 0; i < this.TOWER_REGISTRY.length; i++) {
            this.TOWER_REGISTRY[i].buttonPos = dynamicBtnPos[i] ?? dynamicBtnPos[0];
        }
        for (const def of this.TOWER_REGISTRY) {
            const btn = this.createTowerButton(def);
            btn.setParent(canvas);
        }

        // === 游戏暂停按钮（右侧）===
        this.PAUSE_BUTTON_POS = dynamicPausePos;
        this.pauseButton = this.createPauseButton();
        this.pauseButton.setParent(canvas);
        this.pauseButtonLabel = this.pauseButton.getChildByName('Text')?.getComponent(Label) ?? null;
        this.updatePauseButton();

        // === 开始下一波按钮（中上，波次间自动暂停时才显示）===
        this.NEXT_WAVE_BUTTON_POS = dynamicNextWavePos;
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

            // 0. 判定：是否点中了塔操作菜单的按钮（点击塔后弹出）
            if (this.towerMenu && this.towerMenu.active) {
                const menuPos = this.towerMenu.getPosition();
                // 两个按钮从上到下：移动(y=22) / 自爆(y=-22)
                const moveBtn = new Vec3(menuPos.x, menuPos.y + 22, 0);
                const explodeBtn = new Vec3(menuPos.x, menuPos.y - 22, 0);
                // 移动按钮（仅波次之间可用）
                if (Math.abs(buttonLocal.x - moveBtn.x) <= 70 && Math.abs(buttonLocal.y - moveBtn.y) <= 18) {
                    if (this.waveActive) {
                        if (this.statusLabel) this.statusLabel.string = '战斗中不能移动塔！';
                    } else {
                        this.startMoveTower(this.towerMenuIndex);
                    }
                    this.hideTowerMenu();
                    return;
                }
                // 自爆按钮（仅战斗中可用，免费）
                if (Math.abs(buttonLocal.x - explodeBtn.x) <= 70 && Math.abs(buttonLocal.y - explodeBtn.y) <= 18) {
                    if (!this.waveActive) {
                        if (this.statusLabel) this.statusLabel.string = '波次间不能自爆！';
                    } else {
                        this.executeExplode(this.towerMenuIndex);
                    }
                    this.hideTowerMenu();
                    return;
                }
                // 点了菜单外部 → 关闭菜单
                this.hideTowerMenu();
                return;
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
                // 2. 判断是否点中了已建好的塔 → 弹出操作菜单（移动/出售/自爆）
                let hitTower = -1;
                for (let i = 0; i < this.towers.length; i++) {
                    if (Vec3.distance(gameLocal, this.towers[i].node.position) < 30) {
                        hitTower = i;
                        break;
                    }
                }
                if (hitTower < 0) return;
                // 点击塔直接弹出操作菜单
                this.showTowerMenu(hitTower);
                return;  // 不进入拖拽，等用户选菜单按钮
            }

            // place 模式：立即进入拖拽
            this.isDragging = true;
            this.ghostNode!.active = true;
            this.drawGhost(false);
            this.ghostNode!.setPosition(gameLocal);
            this.updateGhostState(gameLocal);
        });

        canvas.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!this.isDragging) return;
            const local = this.eventToGameLocal(event);
            this.ghostNode!.setPosition(local);
            this.updateGhostState(local);
        });

        canvas.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
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
                    // 通过原槽位找到正在移动的塔
                    const movingTowerIdx = this.towers.findIndex(t =>
                        Vec3.distance(t.node.position, this.SLOT_POSITIONS[this.moveFromSlot]) < 5
                    );

                    if (movingTowerIdx >= 0) {
                        const movingTower = this.towers[movingTowerIdx];
                        if (this.slotOccupied[slot]) {
                            // 目标已占用 → 互换
                            const swapTowerIdx = this.towers.findIndex(t =>
                                Vec3.distance(t.node.position, this.SLOT_POSITIONS[slot]) < 5
                            );
                            if (swapTowerIdx >= 0) {
                                this.towers[swapTowerIdx].node.setPosition(this.SLOT_POSITIONS[this.moveFromSlot]);
                                this.restoreTowerAppearance(this.towers[swapTowerIdx].node, this.towers[swapTowerIdx].def);
                                movingTower.node.setPosition(this.SLOT_POSITIONS[slot]);
                                this.restoreTowerAppearance(movingTower.node, movingTower.def);
                                console.log(`塔互换: 位置 ${this.moveFromSlot + 1} ↔ ${slot + 1}`);
                            }
                        } else {
                            // 目标空 → 直接移动
                            movingTower.node.setPosition(this.SLOT_POSITIONS[slot]);
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
                    Vec3.distance(t.node.position, this.SLOT_POSITIONS[this.moveFromSlot]) < 5
                );
                if (movingTowerIdx >= 0) {
                    this.restoreTowerAppearance(this.towers[movingTowerIdx].node, this.towers[movingTowerIdx].def);
                }
            }
            this.canPlace = false;
            this.targetSlot = -1;
            this.moveFromSlot = -1;
            this.dragMode = 'place';
        });

        canvas.on(Node.EventType.TOUCH_CANCEL, () => {
            // 移动取消时恢复原塔外观
            if (this.dragMode === 'move' && this.moveFromSlot >= 0 && this.dragTowerDef) {
                const movingTowerIdx = this.towers.findIndex(t =>
                    Vec3.distance(t.node.position, this.SLOT_POSITIONS[this.moveFromSlot]) < 5
                );
                if (movingTowerIdx >= 0) {
                    this.restoreTowerAppearance(this.towers[movingTowerIdx].node, this.towers[movingTowerIdx].def);
                }
            }
            this.isDragging = false;
            this.ghostNode!.active = false;
            this.canPlace = false;
            this.targetSlot = -1;
            this.moveFromSlot = -1;
            this.dragMode = 'place';
            this.hideTowerMenu();
        });

        // === HUD（统一顶部状态栏：Gold / Base / Status / Wave）===
        const hudNode = new Node('HUD');
        hudNode.layer = Layers.Enum.UI_2D;
        hudNode.setParent(canvas);
        this.hud = hudNode.addComponent(HUD);
        this.hud.init(this._visibleSize.width, this._visibleSize.height);
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
    /**
     * 根据当前局面构建动态加权卡池
     * - 没有毒塔时：不出现溅射/出血（毒塔专属卡）
     * - 下一波有治疗兵：提高治疗抑制出现率
     * - 已获得溅射：溅射强化仍可出现
     * - 减速塔较多（≥2）：提高攻速/范围出现率
     */
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
        const nextWaveHasHealer = nextWave?.entries.some(e => e.type === 'healer') ?? false;

        const pool: { buff: BuffOption; weight: number }[] = [];

        for (const buff of ROGUELIKE_BUFFS) {
            let weight = 1;  // 默认权重

            // 规则1：没有毒塔时，溅射/出血不出现（毒塔专属）
            if ((buff.id === 'splash' || buff.id === 'bleed') && !hasPoisonTower) {
                continue;  // 跳过，不加入卡池
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

            // 通用：已解锁的 buff 降权（避免重复刷同一个）
            if (buff.id === 'splash' && stats.splashLevel > 0) weight = Math.max(weight, 2);
            if (buff.id === 'bleed' && stats.bleedLevel > 0) weight = Math.max(weight, 2);

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
        // 选 buff 期间隐藏"开始下一波"
        if (this.nextWaveButton) this.nextWaveButton.active = false;
    }

    /** 玩家选中一个 buff */
    private selectBuff(index: number): void {
        const buff = this.currentBuffChoices[index];
        if (!buff) return;
        const display = getBuffDisplay(buff, this.towerStats);
        // 选卡反馈特效
        if (this.buffCards[index]) {
            EffectManager.instance?.playCardSelected(this.buffCards[index], display.name);
        }
        buff.apply(this.towerStats);
        this.buffSelected = true;
        // 延迟隐藏卡片，让特效播放完
        this.scheduleOnce(() => this.hideBuffCards(), 0.3);
        // 选完后显示"开始下一波"
        this.updateNextWaveButton();
        // 更新 status 显示当前加成
        if (this.statusLabel) {
            this.statusLabel.string = `已选: ${display.name}  塔: ${this.towers.length}`;
        }
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
        this.waveElapsed = 0;
        this.spawnCursor = 0;

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
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.hideTowerMenu();
        this.hideTowerMenu();
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
            // 最靠近基地的敌人（x 坐标最大）
            let best = inRange[0];
            for (const c of inRange) {
                if (c.enemy.node.position.x > best.enemy.node.position.x) best = c;
            }
            return best.idx;
        }

        if (def.id === 'slow') {
            // 尚未减速、移动最快的敌人
            // 优先 slowMultiplier >= 1.0（未减速），再按速度倍率排序
            let best = -1;
            let bestScore = -Infinity;
            for (const c of inRange) {
                const e = c.enemy;
                const speedMult = e.speedMultiplier;
                const slowMult = e.slowMultiplier;
                // 未减速优先（slowMultiplier=1），且速度倍率高优先
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

    /** 弹出塔操作菜单（移动/自爆） */
    private showTowerMenu(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        this.hideTowerMenu();  // 先清理已有的
        const tower = this.towers[towerIndex];
        const worldPos = new Vec3();
        tower.node.getWorldPosition(worldPos);
        const canvasTransform = this.node.getComponent(UITransform)!;
        const canvasPos = canvasTransform.convertToNodeSpaceAR(worldPos);

        const menu = new Node('TowerMenu');
        menu.layer = Layers.Enum.UI_2D;
        menu.setParent(this.node);
        menu.setPosition(canvasPos.x, canvasPos.y + 70, 0);
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

        const makeButton = (y: number, label: string, bgColor: Color, textColor: Color) => {
            gfx.fillColor = bgColor;
            gfx.roundRect(-70, y - 18, 140, 36, 8);
            gfx.fill();
            const labelNode = new Node(label);
            labelNode.layer = Layers.Enum.UI_2D;
            labelNode.setParent(menu);
            const t = labelNode.addComponent(UITransform);
            t.setContentSize(140, 36);
            labelNode.setPosition(0, y, 0);
            const l = labelNode.addComponent(Label);
            l.string = label;
            l.fontSize = 16;
            l.color = textColor;
            l.horizontalAlign = Label.HorizontalAlign.CENTER;
            l.verticalAlign = Label.VerticalAlign.CENTER;
        };

        // 两个按钮：移动(上) / 自爆(下)
        const moveLabel = this.waveActive ? '移动（战斗中禁用）' : '移动';
        makeButton(22, moveLabel, new Color(60, 120, 200, 255), new Color(255, 255, 255, 255));
        const explodeLabel = this.waveActive ? '自爆' : '自爆（波次间禁用）';
        makeButton(-22, explodeLabel, new Color(200, 60, 40, 255), new Color(255, 255, 255, 255));

        this.towerMenu = menu;
        this.towerMenuIndex = towerIndex;
    }

    /** 隐藏塔操作菜单 */
    private hideTowerMenu(): void {
        if (this.towerMenu) {
            this.towerMenu.destroy();
            this.towerMenu = null;
        }
        this.towerMenuIndex = -1;
    }

    /** 开始移动塔（设置拖拽状态，保留原塔降低透明度） */
    private startMoveTower(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        const tower = this.towers[towerIndex];
        const towerPos = tower.node.position.clone();
        // 记录原槽位
        for (let s = 0; s < this.SLOT_POSITIONS.length; s++) {
            if (Vec3.distance(towerPos, this.SLOT_POSITIONS[s]) < 5) {
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

    /** 执行自爆：删除塔 + AOE 爆炸（免费，仅战斗中可用）+ 按塔类型不同效果 */
    private executeExplode(towerIndex: number): void {
        if (towerIndex < 0 || towerIndex >= this.towers.length) return;
        if (!this.waveActive) return;  // 波次间禁用自爆
        const tower = this.towers[towerIndex];
        const explodePos = tower.node.position.clone();
        const def = tower.def;
        // 释放槽位
        for (let s = 0; s < this.SLOT_POSITIONS.length; s++) {
            if (Vec3.distance(explodePos, this.SLOT_POSITIONS[s]) < 5) {
                this.slotOccupied[s] = false;
                this.slotNodes[s].active = true;
                break;
            }
        }
        // 删除塔
        tower.node.removeFromParent();
        tower.node.destroy();
        this.towers.splice(towerIndex, 1);
        this.towerTimers.splice(towerIndex, 1);

        // 按塔类型计算自爆效果
        const radius = this.EXPLOSION_RADIUS;
        // 基础伤害 = 塔价格 × 1.5
        const baseDamage = def.cost * 1.5;
        // 附加：敌人当前血量的 20%
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            const d = Vec3.distance(explodePos, e.node.position);
            if (d <= radius) {
                // 伤害 = 塔价格×1.5 + 敌人最大血量的20%
                const dmg = baseDamage + e.maxHp * 0.2;
                e.hp -= dmg;
                // 按塔类型的特殊效果
                if (def.id === 'poison') {
                    // 毒塔自爆：范围施毒（3秒，dps=12）
                    const existing = e.buffs['poison'];
                    if (existing) {
                        existing.timer = 3.0;
                        existing.dps = Math.max(existing.dps, 12);
                    } else {
                        e.buffs['poison'] = { timer: 3.0, dps: 12 };
                    }
                } else if (def.id === 'slow') {
                    // 减速塔自爆：范围冻结（slowMultiplier=0.5，持续2秒）
                    e.slowMultiplier = Math.min(e.slowMultiplier, 0.5);
                    e.slowTimer = 2.0;
                } else {
                    // 攻击塔自爆：纯高伤害（额外50%伤害）
                    e.hp -= dmg * 0.5;
                    def.onBulletHit?.(e);
                }
                if (e.hp <= 0) {
                    e.node.removeFromParent();
                    e.node.destroy();
                    this.enemies.splice(j, 1);
                    this.gold += this.KILL_REWARD;
                    this.updateGoldLabel();
                    console.log(`爆炸击杀！+${this.KILL_REWARD} 金币`);
                }
            }
        }
        // 爆炸光波动画
        EffectManager.instance?.playExplosion(explodePos, this.EXPLOSION_RADIUS);
        const effectName = def.id === 'poison' ? '范围施毒' : def.id === 'slow' ? '范围冻结' : '纯高伤害';
        console.log(`塔自爆！${effectName}，AOE ${radius}px / 基础伤害 ${baseDamage}`);
    }

    /** 溅射 AOE：在命中点爆炸，伤害周围敌人（伤害 = 主弹伤害 × splashDamage 倍率） */
    private triggerSplash(pos: Vec3, def: TowerDef): void {
        const ts = this.towerStats;
        const radius = ts.splashRadius;
        const splashDmg = def.damage * ts.damageMultiplier * ts.splashDamage;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (!e.node.isValid) continue;
            const d = Vec3.distance(pos, e.node.position);
            if (d <= radius) {
                e.hp -= splashDmg;
                def.onBulletHit?.(e);  // 触发塔的命中效果（如毒 buff）
                if (e.hp <= 0) {
                    e.node.removeFromParent();
                    e.node.destroy();
                    this.enemies.splice(j, 1);
                    this.gold += this.KILL_REWARD;
                    this.updateGoldLabel();
                }
            }
        }
        // 爆炸光波动画
        EffectManager.instance?.playExplosion(pos, radius);
    }

    /** 创建爆炸光波动画（扩散+淡出，约 0.4 秒） */
    private createExplosionWave(pos: Vec3, radius: number = this.EXPLOSION_RADIUS): void {
        if (!this.gameLayer) return;
        const wave = new Node('ExplosionWave');
        wave.layer = Layers.Enum.UI_2D;
        wave.setParent(this.gameLayer);
        wave.setPosition(pos);
        const transform = wave.addComponent(UITransform);
        transform.setContentSize(radius * 2, radius * 2);
        transform.setAnchorPoint(0.5, 0.5);
        const gfx = wave.addComponent(Graphics);

        // 初始光波
        const drawWave = (r: number, alpha: number) => {
            gfx.clear();
            // 外圈光波（橙色，扩散）
            gfx.strokeColor = new Color(255, 180, 80, alpha);
            gfx.lineWidth = 6;
            gfx.circle(0, 0, r);
            gfx.stroke();
            // 内圈填充（红橙，淡出）
            gfx.fillColor = new Color(255, 100, 50, alpha * 0.4);
            gfx.circle(0, 0, r * 0.7);
            gfx.fill();
        };

        // 动画分 5 帧，半径从 10 扩散到目标半径，alpha 从 255 淡出到 0
        let frame = 0;
        const totalFrames = 5;
        const startRadius = 10;
        const endRadius = radius;
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

        // === 波次完成检测 ===
        if (this.waveActive) {
            // 全部生成且全部死亡 → 自动暂停，等用户选 buff + 点"开始下一波"
            if (this.spawnedInWave >= this.waveTotalCount && this.enemies.length === 0) {
                this.waveActive = false;
                // 还有下一波才显示 buff 选择 + 暂停状态，否则直接胜利
                if (this.currentWave < this.WAVES.length) {
                    this.isWavePaused = true;
                    // 波次完成奖励
                    const waveBonus = this.WAVE_BONUSES[this.currentWave - 1] || 0;
                    if (waveBonus > 0) {
                        this.gold += waveBonus;
                        this.updateGoldLabel();
                        console.log(`波次奖励 +${waveBonus} 金币，当前 ${this.gold}`);
                    }
                    this.updatePauseButton();
                    this.showBuffSelection();
                    console.log(`Wave ${this.currentWave} 完成（${this.waveTotalCount} 只全部消灭），已自动暂停`);
                } else {
                    this.victory();
                }
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
                // 沿 waypoints 逐段移动
                const eDef = this.getEnemyDef(e.type);
                const speedMult = eDef?.speedMultiplier ?? 1;
                const speed = this.ENEMY_SPEED * speedMult * e.slowMultiplier;
                // 用 pathIdx 跟踪当前目标 waypoint
                if (e.pathIdx >= this.PATH_WAYPOINTS.length) {
                    // 已到达终点 waypoint，目标就是终点
                    e.pathIdx = this.PATH_WAYPOINTS.length - 1;
                }
                const target = this.PATH_WAYPOINTS[e.pathIdx];
                // 到达当前 waypoint → 前往下一个
                if (Vec3.distance(pos, target) <= 5 && e.pathIdx < this.PATH_WAYPOINTS.length - 1) {
                    e.pathIdx++;
                }
                const finalTarget = this.PATH_WAYPOINTS[Math.min(e.pathIdx, this.PATH_WAYPOINTS.length - 1)];
                // 朝目标移动
                const dir = new Vec3(finalTarget.x - pos.x, finalTarget.y - pos.y, 0);
                const dist = dir.length();
                if (dist > 0) {
                    const moveDist = Math.min(speed * dt, dist);
                    e.node.setPosition(
                        pos.x + (dir.x / dist) * moveDist,
                        pos.y + (dir.y / dist) * moveDist,
                        0
                    );
                }
            }
        }

        // === HP 显示（选项框显示时保留提示，不覆盖）===
        if (this.statusLabel && !this.towerMenu) {
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

            // 按塔类型索敌（每种塔有不同优先级）
            const nearestEnemy = this.findTarget(def, tower.node.position, effectiveRange(def));
            if (nearestEnemy < 0) continue;

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
            b.node.setPosition(pos.x + b.vx * dt, pos.y + b.vy * dt, 0);

            // === 主弹：命中固定目标 ===
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (!e.node.isValid || !b.target.isValid) continue;
                if (b.target !== e.node) continue;  // 只命中目标

                const d = Vec3.distance(b.node.position, e.node.position);
                if (d < 16) {
                    // 用 roguelike 伤害加成（加法叠加：base × (1 + 累计加成)）
                    let dmg = b.def.damage * this.towerStats.damageMultiplier;
                    // Roguelike 出血 buff：攻击出血敌人有概率暴击
                    const ts = this.towerStats;
                    let isCrit = false;
                    if (ts.bleedLevel > 0 && e.buffs['bleed'] && Math.random() < ts.critChance) {
                        dmg *= ts.critMultiplier;
                        isCrit = true;
                    }
                    e.hp -= dmg;
                    // 命中特效
                    EffectManager.instance?.playHit(e.node);
                    EffectManager.instance?.playDamageNumber(e.node.position, dmg, isCrit);
                    // Roguelike 出血 buff：概率施加出血状态（2秒，dps=0 纯标记）
                    if (ts.bleedLevel > 0 && Math.random() < ts.bleedChance) {
                        e.buffs['bleed'] = { timer: ts.bleedDuration, dps: 0 };
                    }
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

                    // Roguelike 溅射 buff：主弹命中后在命中点爆炸 AOE
                    if (this.towerStats.splashLevel > 0) {
                        this.triggerSplash(b.node.position, b.def);
                    }

                    b.node.destroy();
                    this.bullets.splice(i, 1);
                    hit = true;

                    // splash 可能已杀死主目标（从 enemies 数组移除），需检查节点是否仍有效
                    if (e.hp <= 0 && e.node.isValid) {
                        EffectManager.instance?.playDeath(e.node.position, e.node.getComponent(Graphics)?.fillColor ?? new Color(255, 255, 255, 255));
                        e.node.removeFromParent();
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
            pathIdx: 1,  // 从起点 waypoint[0] 出发，目标是 waypoint[1]
            buffs: {},
        });
    }

    /** 发射子弹 */
    private fireBullet(from: Vec3, to: Vec3, target: Node, def: TowerDef): void {
        if (!this.gameLayer) return;

        const bullet = new Node('Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(this.gameLayer);
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
        this.hideTowerMenu();
        this.hideTowerMenu();
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
        this.waveElapsed = 0;
        this.spawnCursor = 0;
        this.isWavePaused = false;
        this.isUserPaused = false;
        this.buffSelected = false;
        this.towerStats.reset();
        this.hideTowerMenu();
        this.hideTowerMenu();
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
        transform.setContentSize(96, 96);
        node.setPosition(def.buttonPos);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-36, -36, 72, 72);
        gfx.fill();
        // 塔主体色
        gfx.fillColor = def.color;
        gfx.circle(0, 0, 20);
        gfx.fill();

        // 价格标签
        const labelNode = new Node('Cost');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        labelNode.setParent(node);
        labelNode.setPosition(0, -40, 0);
        const label = labelNode.addComponent(Label);
        label.string = `${def.cost}`;
        label.fontSize = 14;

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

        return node;
    }

    private createTowerSlot(pos: Vec3, index: number): Node {
        const node = new Node(`Slot_${index}`);
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(72, 72);

        const gfx = node.addComponent(Graphics);
        gfx.lineWidth = 3;
        gfx.strokeColor = new Color(100, 200, 100, 200);
        gfx.fillColor = new Color(100, 200, 100, 60);
        gfx.rect(-36, -36, 72, 72);
        gfx.fill();
        gfx.stroke();

        gfx.strokeColor = new Color(100, 200, 100, 255);
        gfx.lineWidth = 3;
        gfx.moveTo(-14, 0); gfx.lineTo(14, 0);
        gfx.moveTo(0, -14); gfx.lineTo(0, 14);
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
        // 绘制折线路径
        gfx.moveTo(this.PATH_WAYPOINTS[0].x, this.PATH_WAYPOINTS[0].y);
        for (let i = 1; i < this.PATH_WAYPOINTS.length; i++) {
            gfx.lineTo(this.PATH_WAYPOINTS[i].x, this.PATH_WAYPOINTS[i].y);
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
}
