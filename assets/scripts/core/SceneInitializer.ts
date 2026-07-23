import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';

const { ccclass } = _decorator;

/** 敌人类型 */
type EnemyType = 'normal' | 'healer';

/** 单只敌人生成配置（时间线格式） */
interface SpawnEntry {
    time: number;       // 从波次开始第几秒生成这只（秒，可写小数）
    type: EnemyType;    // 'normal' 普通兵 / 'healer' 治疗兵
    hp: number;         // 这只敌人的血量
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

    // 敌人属性
    private readonly ENEMY_SPEED = 80;

    // 塔属性（攻击塔）
    private readonly TOWER_RANGE = 200;
    private readonly TOWER_DAMAGE = 20;  // 提升 100%（10→20）
    private readonly TOWER_INTERVAL = 0.56;  // 0.8 × 0.7（提升30%攻速）
    private readonly TOWER_COST = 100;

    // 减速塔属性
    private readonly SLOW_TOWER_RANGE = 200;
    private readonly SLOW_TOWER_INTERVAL = 0.7;  // 1.0 × 0.7（提升30%攻速）
    private readonly SLOW_TOWER_COST = 150;
    private readonly SLOW_MULTIPLIER = 0.7;   // 速度降为 70%（即降低 30%）
    private readonly SLOW_DURATION = 2.0;      // 持续 2 秒

    // 金币
    private readonly INITIAL_GOLD = 300;
    private readonly KILL_REWARD = 20;

    // 子弹
    private readonly BULLET_SPEED = 500;

    // 治疗者属性
    private readonly HEALER_SPEED_MULT = 0.9;   // 速度慢 10%
    private readonly HEALER_HP_MULT = 0.8;      // 血量少 20%
    private readonly HEAL_RADIUS = 120;         // 治疗光环范围
    private readonly HEAL_INTERVAL = 3.0;       // 每 3 秒治疗一次
    private readonly HEAL_AMOUNT = 5;           // 回复 5 点 HP

    // ===== 波次配置（时间线格式：一行一只敌人）=====
    // time:  从波次开始第几秒生成（秒，可写小数）
    // type:  'normal' 普通兵 / 'healer' 治疗兵（治疗兵速度慢10%、血量建议是普通的 0.8 倍）
    // hp:    这只敌人多少血
    private readonly WAVES: WaveConfig[] = [
        // Wave 1：30 只普通兵，HP=20，每隔 1.0s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 20 },  { time: 1.0,  type: 'normal', hp: 20 },
            { time: 2.0,  type: 'normal', hp: 20 },  { time: 3.0,  type: 'normal', hp: 20 },
            { time: 4.0,  type: 'normal', hp: 20 },  { time: 5.0,  type: 'normal', hp: 20 },
            { time: 6.0,  type: 'normal', hp: 20 },  { time: 7.0,  type: 'normal', hp: 20 },
            { time: 8.0,  type: 'normal', hp: 20 },  { time: 9.0,  type: 'normal', hp: 20 },
            { time: 10.0, type: 'normal', hp: 20 },  { time: 11.0, type: 'normal', hp: 20 },
            { time: 12.0, type: 'normal', hp: 20 },  { time: 13.0, type: 'normal', hp: 20 },
            { time: 14.0, type: 'normal', hp: 20 },  { time: 15.0, type: 'normal', hp: 20 },
            { time: 16.0, type: 'normal', hp: 20 },  { time: 17.0, type: 'normal', hp: 20 },
            { time: 18.0, type: 'normal', hp: 20 },  { time: 19.0, type: 'normal', hp: 20 },
            { time: 20.0, type: 'normal', hp: 20 },  { time: 21.0, type: 'normal', hp: 20 },
            { time: 22.0, type: 'normal', hp: 20 },  { time: 23.0, type: 'normal', hp: 20 },
            { time: 24.0, type: 'normal', hp: 20 },  { time: 25.0, type: 'normal', hp: 20 },
            { time: 26.0, type: 'normal', hp: 20 },  { time: 27.0, type: 'normal', hp: 20 },
            { time: 28.0, type: 'normal', hp: 20 },  { time: 29.0, type: 'normal', hp: 20 },
        ]},
        // Wave 2：30 只普通兵，HP=30，每隔 0.8s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 30 },  { time: 0.8,  type: 'normal', hp: 30 },
            { time: 1.6,  type: 'normal', hp: 30 },  { time: 2.4,  type: 'normal', hp: 30 },
            { time: 3.2,  type: 'normal', hp: 30 },  { time: 4.0,  type: 'normal', hp: 30 },
            { time: 4.8,  type: 'normal', hp: 30 },  { time: 5.6,  type: 'normal', hp: 30 },
            { time: 6.4,  type: 'normal', hp: 30 },  { time: 7.2,  type: 'normal', hp: 30 },
            { time: 8.0,  type: 'normal', hp: 30 },  { time: 8.8,  type: 'normal', hp: 30 },
            { time: 9.6,  type: 'normal', hp: 30 },  { time: 10.4, type: 'normal', hp: 30 },
            { time: 11.2, type: 'normal', hp: 30 },  { time: 12.0, type: 'normal', hp: 30 },
            { time: 12.8, type: 'normal', hp: 30 },  { time: 13.6, type: 'normal', hp: 30 },
            { time: 14.4, type: 'normal', hp: 30 },  { time: 15.2, type: 'normal', hp: 30 },
            { time: 16.0, type: 'normal', hp: 30 },  { time: 16.8, type: 'normal', hp: 30 },
            { time: 17.6, type: 'normal', hp: 30 },  { time: 18.4, type: 'normal', hp: 30 },
            { time: 19.2, type: 'normal', hp: 30 },  { time: 20.0, type: 'normal', hp: 30 },
            { time: 20.8, type: 'normal', hp: 30 },  { time: 21.6, type: 'normal', hp: 30 },
            { time: 22.4, type: 'normal', hp: 30 },  { time: 23.2, type: 'normal', hp: 30 },
        ]},
        // Wave 3：30 只，3 普通 + 1 治疗循环穿插（23 普通 HP=50 + 7 治疗 HP=40），每隔 0.6s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 50 },  { time: 0.6,  type: 'normal', hp: 50 },
            { time: 1.2,  type: 'normal', hp: 50 },  { time: 1.8,  type: 'healer', hp: 40 },
            { time: 2.4,  type: 'normal', hp: 50 },  { time: 3.0,  type: 'normal', hp: 50 },
            { time: 3.6,  type: 'normal', hp: 50 },  { time: 4.2,  type: 'healer', hp: 40 },
            { time: 4.8,  type: 'normal', hp: 50 },  { time: 5.4,  type: 'normal', hp: 50 },
            { time: 6.0,  type: 'normal', hp: 50 },  { time: 6.6,  type: 'healer', hp: 40 },
            { time: 7.2,  type: 'normal', hp: 50 },  { time: 7.8,  type: 'normal', hp: 50 },
            { time: 8.4,  type: 'normal', hp: 50 },  { time: 9.0,  type: 'healer', hp: 40 },
            { time: 9.6,  type: 'normal', hp: 50 },  { time: 10.2, type: 'normal', hp: 50 },
            { time: 10.8, type: 'normal', hp: 50 },  { time: 11.4, type: 'healer', hp: 40 },
            { time: 12.0, type: 'normal', hp: 50 },  { time: 12.6, type: 'normal', hp: 50 },
            { time: 13.2, type: 'normal', hp: 50 },  { time: 13.8, type: 'healer', hp: 40 },
            { time: 14.4, type: 'normal', hp: 50 },  { time: 15.0, type: 'normal', hp: 50 },
            { time: 15.6, type: 'normal', hp: 50 },  { time: 16.2, type: 'healer', hp: 40 },
            { time: 16.8, type: 'normal', hp: 50 },  { time: 17.4, type: 'normal', hp: 50 },
        ]},
        // Wave 4：30 只普通兵，HP=100，每隔 1.5s 一只
        { entries: [
            { time: 0.0,  type: 'normal', hp: 100 },  { time: 1.5,  type: 'normal', hp: 100 },
            { time: 3.0,  type: 'normal', hp: 100 },  { time: 4.5,  type: 'normal', hp: 100 },
            { time: 6.0,  type: 'normal', hp: 100 },  { time: 7.5,  type: 'normal', hp: 100 },
            { time: 9.0,  type: 'normal', hp: 100 },  { time: 10.5, type: 'normal', hp: 100 },
            { time: 12.0, type: 'normal', hp: 100 },  { time: 13.5, type: 'normal', hp: 100 },
            { time: 15.0, type: 'normal', hp: 100 },  { time: 16.5, type: 'normal', hp: 100 },
            { time: 18.0, type: 'normal', hp: 100 },  { time: 19.5, type: 'normal', hp: 100 },
            { time: 21.0, type: 'normal', hp: 100 },  { time: 22.5, type: 'normal', hp: 100 },
            { time: 24.0, type: 'normal', hp: 100 },  { time: 25.5, type: 'normal', hp: 100 },
            { time: 27.0, type: 'normal', hp: 100 },  { time: 28.5, type: 'normal', hp: 100 },
            { time: 30.0, type: 'normal', hp: 100 },  { time: 31.5, type: 'normal', hp: 100 },
            { time: 33.0, type: 'normal', hp: 100 },  { time: 34.5, type: 'normal', hp: 100 },
            { time: 36.0, type: 'normal', hp: 100 },  { time: 37.5, type: 'normal', hp: 100 },
            { time: 39.0, type: 'normal', hp: 100 },  { time: 40.5, type: 'normal', hp: 100 },
            { time: 42.0, type: 'normal', hp: 100 },  { time: 43.5, type: 'normal', hp: 100 },
        ]},
    ];

    // 建造点
    private readonly SLOT_POSITIONS = [
        new Vec3(-150, -64, 0),
        new Vec3(0, -64, 0),
        new Vec3(150, -64, 0),
    ];
    private slotNodes: Node[] = [];
    private slotOccupied: boolean[] = [false, false, false];

    // 拖拽
    private ghostNode: Node | null = null;
    private ghostGfx: Graphics | null = null;
    private isDragging = false;
    private canPlace = false;
    private targetSlot = -1;  // 当前拖拽目标槽位（TOUCH_MOVE 时确定，TOUCH_END 直接用）

    // 运行时状态
    private gameLayer: Node | null = null;
    private gameTransform: UITransform | null = null;
    private enemies: {
        node: Node; hp: number; maxHp: number;
        slowTimer: number; slowMultiplier: number;
        type: EnemyType; healTimer: number;
    }[] = [];
    private towers: { node: Node; type: 'attack' | 'slow' }[] = [];
    private towerTimers: number[] = [];
    private bullets: { node: Node; vx: number; vy: number; target: Node }[] = [];
    private statusLabel: Label | null = null;
    private goldLabel: Label | null = null;
    private waveLabel: Label | null = null;
    private livesLabel: Label | null = null;
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

    // 塔按钮位置
    private readonly TOWER_BUTTON_POS = new Vec3(-400, -200, 0);
    private readonly SLOW_BUTTON_POS = new Vec3(-400, -100, 0);
    // 游戏暂停按钮：右上角（避开 Wave 标签 y=280）
    private readonly PAUSE_BUTTON_POS = new Vec3(420, 220, 0);
    private readonly PAUSE_BUTTON_RADIUS = 36;  // 触摸判定半径
    // 开始下一波按钮：中上（独立一行，避开顶部 HUD）
    private readonly NEXT_WAVE_BUTTON_POS = new Vec3(0, 220, 0);
    private readonly NEXT_WAVE_BUTTON_RADIUS = 80;  // 触摸判定半径（按钮加宽）

    // 拖拽中的塔类型
    private dragTowerType: 'attack' | 'slow' = 'attack';
    // 拖拽模式：'place' 新建 / 'move' 移动已建好的塔
    private dragMode: 'place' | 'move' = 'place';
    // 移动塔时记录原槽位
    private moveFromSlot = -1;

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

        // === 塔按钮 ===
        const towerButton = this.createTowerButton('attack');
        towerButton.setParent(canvas);
        const slowButton = this.createTowerButton('slow');
        slowButton.setParent(canvas);

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

        // === 所有触摸事件绑定到 Canvas ===
        canvas.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const buttonLocal = this.eventToCanvasLocal(event);
            const gameLocal = this.eventToGameLocal(event);

            // 0. 优先判定：是否点中了中上"开始下一波"按钮（仅波次间自动暂停时可见）
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

            // 3. 判断是否点中了塔按钮（新建）
            if (Vec3.distance(buttonLocal, this.TOWER_BUTTON_POS) <= 40) {
                this.dragTowerType = 'attack';
                this.dragMode = 'place';
            } else if (Vec3.distance(buttonLocal, this.SLOW_BUTTON_POS) <= 40) {
                this.dragTowerType = 'slow';
                this.dragMode = 'place';
            } else {
                // 2. 判断是否点中了已建好的塔（移动）
                let hitTower = -1;
                for (let i = 0; i < this.towers.length; i++) {
                    if (Vec3.distance(gameLocal, this.towers[i].node.position) < 30) {
                        hitTower = i;
                        break;
                    }
                }
                if (hitTower < 0) return;

                // 波次进行中不能移动塔（波次间暂停 isWavePaused 时可以移）
                if (this.waveActive) {
                    console.log('波次进行中，不能移动塔');
                    return;
                }

                // 记录原槽位
                const towerPos = this.towers[hitTower].node.position;
                for (let s = 0; s < this.SLOT_POSITIONS.length; s++) {
                    if (Vec3.distance(towerPos, this.SLOT_POSITIONS[s]) < 5) {
                        this.moveFromSlot = s;
                        break;
                    }
                }
                this.dragTowerType = this.towers[hitTower].type;
                this.dragMode = 'move';
            }

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
            if (this.canPlace && this.targetSlot >= 0) {
                const slot = this.targetSlot;

                if (this.dragMode === 'place') {
                    this.placeTower(slot, this.dragTowerType);
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
        });

        // === 状态显示 ===
        const statusNode = new Node('Status');
        statusNode.layer = Layers.Enum.UI_2D;
        statusNode.setParent(canvas);
        statusNode.addComponent(UITransform);
        statusNode.setPosition(0, 280, 0);
        this.statusLabel = statusNode.addComponent(Label);
        this.statusLabel.string = '拖拽左侧塔按钮到绿色格子';
        this.statusLabel.fontSize = 20;

        // === 金币显示 ===
        const goldNode = new Node('Gold');
        goldNode.layer = Layers.Enum.UI_2D;
        goldNode.setParent(canvas);
        goldNode.addComponent(UITransform);
        goldNode.setPosition(-420, 280, 0);
        this.goldLabel = goldNode.addComponent(Label);
        this.goldLabel.fontSize = 24;
        this.gold = this.INITIAL_GOLD;
        this.updateGoldLabel();

        // === 波次显示 ===
        const waveNode = new Node('Wave');
        waveNode.layer = Layers.Enum.UI_2D;
        waveNode.setParent(canvas);
        waveNode.addComponent(UITransform);
        waveNode.setPosition(420, 280, 0);
        this.waveLabel = waveNode.addComponent(Label);
        this.waveLabel.fontSize = 24;
        this.waveLabel.string = `Wave: 0/${this.WAVES.length}`;

        // === 友军 HP 显示 ===
        const livesNode = new Node('Lives');
        livesNode.layer = Layers.Enum.UI_2D;
        livesNode.setParent(canvas);
        livesNode.addComponent(UITransform);
        livesNode.setPosition(-200, 280, 0);
        this.livesLabel = livesNode.addComponent(Label);
        this.livesLabel.fontSize = 24;
        this.livesLabel.string = `Base: ${this.allyHp}/${this.ALLY_MAX_HP}`;

        // === 终点友军建筑（城堡）===
        this.drawAlly(this.gameLayer);

        // === 启动第一波 ===
        this.startNextWave();

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

    /** 开始下一波按钮：波次间自动暂停时点击启动下一波 */
    private startNextWaveFromButton(): void {
        if (!this.isWavePaused) return;
        this.isWavePaused = false;
        this.updateNextWaveButton();
        this.startNextWave();
        console.log('用户点击开始下一波 → 启动 Wave', this.currentWave + 1);
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
        // 只在波次间自动暂停且非游戏结束时显示
        this.nextWaveButton.active = this.isWavePaused && !this.isGameOver;
        if (this.nextWaveButton.active) {
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

        const cost = this.dragTowerType === 'attack' ? this.TOWER_COST : this.SLOW_TOWER_COST;
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
        // 攻击塔蓝色，减速塔紫色
        const isSlow = this.dragTowerType === 'slow';
        const baseColor = isSlow ? new Color(180, 80, 220, 120) : new Color(50, 150, 255, 120);
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

    protected update(dt: number): void {
        if (this.isGameOver) return;

        // 用户暂停：完全冻结游戏逻辑（敌人/塔/子弹都不动），拖拽也在 TOUCH_START 中被阻止
        if (this.isUserPaused) return;

        // === 波次完成检测 ===
        if (this.waveActive) {
            // 全部生成且全部死亡 → 自动暂停，等用户点"开始下一波"
            if (this.spawnedInWave >= this.waveTotalCount && this.enemies.length === 0) {
                this.waveActive = false;
                this.isWavePaused = true;
                this.updatePauseButton();
                this.updateNextWaveButton();
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
                const speedMult = e.type === 'healer' ? this.HEALER_SPEED_MULT : 1;
                const speed = this.ENEMY_SPEED * speedMult * e.slowMultiplier;
                e.node.setPosition(pos.x + Math.sign(dx) * speed * dt, pos.y, 0);
            }
        }

        // === HP 显示 ===
        if (this.statusLabel) {
            if (this.isWavePaused) {
                // 波次间暂停：提示用户可以建塔，点中上按钮开始下一波
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
            const range = tower.type === 'attack' ? this.TOWER_RANGE : this.SLOW_TOWER_RANGE;
            const interval = tower.type === 'attack' ? this.TOWER_INTERVAL : this.SLOW_TOWER_INTERVAL;

            // 找最近的敌人
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

            if (nearestEnemy < 0 || nearestDist > range) continue;

            this.towerTimers[i] += dt;
            if (this.towerTimers[i] >= interval) {
                this.towerTimers[i] = 0;
                if (tower.type === 'attack') {
                    // 攻击塔：发射子弹
                    this.fireBullet(tower.node.position, this.enemies[nearestEnemy].node.position, this.enemies[nearestEnemy].node);
                } else {
                    // 减速塔：直接施加减速效果
                    this.enemies[nearestEnemy].slowMultiplier = this.SLOW_MULTIPLIER;
                    this.enemies[nearestEnemy].slowTimer = this.SLOW_DURATION;
                    // 发射紫色减速弹（视觉）
                    this.fireBullet(tower.node.position, this.enemies[nearestEnemy].node.position, this.enemies[nearestEnemy].node, true);
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

        // === 治疗者光环 ===
        for (const healer of this.enemies) {
            if (healer.type !== 'healer') continue;
            healer.healTimer += dt;
            if (healer.healTimer >= this.HEAL_INTERVAL) {
                healer.healTimer = 0;
                // 治疗光环范围内的其他敌人
                for (const target of this.enemies) {
                    if (target === healer) continue;
                    const dist = Vec3.distance(healer.node.position, target.node.position);
                    if (dist <= this.HEAL_RADIUS && target.hp < target.maxHp) {
                        const before = target.hp;
                        target.hp = Math.min(target.maxHp, target.hp + this.HEAL_AMOUNT);
                        if (target.hp > before) {
                            console.log(`治疗者治疗 +${target.hp - before} HP（${before}→${target.hp}）`);
                        }
                    }
                }
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

            // 命中检测：检查所有敌人
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                if (!e.node.isValid || !b.target.isValid) continue;
                if (b.target !== e.node) continue;  // 只命中目标

                const d = Vec3.distance(b.node.position, e.node.position);
                if (d < 16) {
                    e.hp -= this.TOWER_DAMAGE;
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

    /** 生成敌人 */
    private spawnEnemy(hp: number, type: EnemyType = 'normal'): void {
        if (!this.gameLayer) return;

        // 治疗者：血量少 20%
        const actualHp = type === 'healer' ? Math.floor(hp * this.HEALER_HP_MULT) : hp;

        const enemy = new Node(type === 'healer' ? 'Healer' : 'Enemy');
        enemy.layer = Layers.Enum.UI_2D;
        enemy.setParent(this.gameLayer);
        enemy.setPosition(this.PATH_START);

        const transform = enemy.addComponent(UITransform);
        transform.setContentSize(28, 28);

        const gfx = enemy.addComponent(Graphics);

        if (type === 'healer') {
            // 治疗者：粉色，带治疗光环
            gfx.fillColor = new Color(255, 150, 200, 255);
            gfx.circle(0, 0, 14);
            gfx.fill();
            // 治疗光环范围
            gfx.strokeColor = new Color(100, 255, 150, 100);
            gfx.lineWidth = 2;
            gfx.circle(0, 0, this.HEAL_RADIUS);
            gfx.stroke();
            // 光环填充
            gfx.fillColor = new Color(100, 255, 150, 20);
            gfx.circle(0, 0, this.HEAL_RADIUS);
            gfx.fill();
        } else {
            // 普通敌人：绿色
            gfx.fillColor = new Color(80, 200, 80, 255);
            gfx.circle(0, 0, 14);
            gfx.fill();
        }

        this.enemies.push({
            node: enemy, hp: actualHp, maxHp: actualHp,
            slowTimer: 0, slowMultiplier: 1,
            type, healTimer: 0,
        });
    }

    private fireBullet(from: Vec3, to: Vec3, target: Node, isSlow: boolean = false): void {
        if (!this.gameLayer) return;

        const bullet = new Node('Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(this.gameLayer);
        bullet.setPosition(from);

        const transform = bullet.addComponent(UITransform);
        transform.setContentSize(12, 12);

        const gfx = bullet.addComponent(Graphics);
        gfx.fillColor = isSlow ? new Color(180, 80, 220, 255) : new Color(100, 180, 255, 255);
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
        });
    }

    private placeTower(slotIndex: number, type: 'attack' | 'slow'): void {
        if (this.slotOccupied[slotIndex] || !this.gameLayer) return;
        const cost = type === 'attack' ? this.TOWER_COST : this.SLOW_TOWER_COST;
        if (this.gold < cost) return;

        this.gold -= cost;
        this.updateGoldLabel();

        const tower = this.createTower(this.SLOT_POSITIONS[slotIndex], type);
        tower.setParent(this.gameLayer);

        this.towers.push({ node: tower, type });
        this.towerTimers.push(type === 'attack' ? this.TOWER_INTERVAL : this.SLOW_TOWER_INTERVAL);
        this.slotOccupied[slotIndex] = true;
        this.slotNodes[slotIndex].active = false;

        console.log(`${type === 'attack' ? '攻击塔' : '减速塔'}放置到位置 ${slotIndex + 1}，花费 ${cost}，当前 ${this.towers.length} 塔`);
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
        this.updatePauseButton();
        this.updateNextWaveButton();

        // 更新 HUD
        this.updateGoldLabel();
        if (this.livesLabel) this.livesLabel.string = `Base: ${this.allyHp}/${this.ALLY_MAX_HP}`;
        if (this.waveLabel) this.waveLabel.string = `Wave: 0/${this.WAVES.length}`;
        if (this.statusLabel) this.statusLabel.string = '拖拽左侧塔按钮到绿色格子';

        // 启动第一波
        this.startNextWave();
        console.log('游戏重新开始');
    }

    private createTowerButton(type: 'attack' | 'slow'): Node {
        const isSlow = type === 'slow';
        const pos = isSlow ? this.SLOW_BUTTON_POS : this.TOWER_BUTTON_POS;
        const name = isSlow ? 'SlowButton' : 'TowerButton';

        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(80, 80);
        node.setPosition(pos);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-30, -30, 60, 60);
        gfx.fill();
        // 攻击塔蓝色，减速塔紫色
        gfx.fillColor = isSlow ? new Color(180, 80, 220, 255) : new Color(50, 150, 255, 255);
        gfx.circle(0, 0, 16);
        gfx.fill();

        // 价格标签
        const labelNode = new Node('Cost');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        labelNode.setParent(node);
        labelNode.setPosition(0, -32, 0);
        const label = labelNode.addComponent(Label);
        label.string = `${isSlow ? this.SLOW_TOWER_COST : this.TOWER_COST}`;
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

    private createTower(pos: Vec3, type: 'attack' | 'slow'): Node {
        const isSlow = type === 'slow';
        const node = new Node(isSlow ? 'SlowTower' : 'Tower');
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(48, 48);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-20, -20, 40, 40);
        gfx.fill();
        gfx.fillColor = isSlow ? new Color(180, 80, 220, 255) : new Color(50, 150, 255, 255);
        gfx.circle(0, 0, 14);
        gfx.fill();
        gfx.fillColor = new Color(255, 255, 255, 255);
        gfx.circle(0, 0, 4);
        gfx.fill();
        const range = isSlow ? this.SLOW_TOWER_RANGE : this.TOWER_RANGE;
        gfx.strokeColor = isSlow ? new Color(180, 80, 220, 60) : new Color(50, 150, 255, 60);
        gfx.lineWidth = 2;
        gfx.circle(0, 0, range);
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
