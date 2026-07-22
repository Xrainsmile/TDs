import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';

const { ccclass } = _decorator;

/** 波次配置 */
interface WaveConfig {
    count: number;      // 敌人数量
    hp: number;         // 敌人血量
    interval: number;   // 生成间隔（秒）
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
    private readonly TOWER_DAMAGE = 10;
    private readonly TOWER_INTERVAL = 0.8;
    private readonly TOWER_COST = 100;

    // 减速塔属性
    private readonly SLOW_TOWER_RANGE = 200;
    private readonly SLOW_TOWER_INTERVAL = 1.0;
    private readonly SLOW_TOWER_COST = 150;
    private readonly SLOW_MULTIPLIER = 0.7;   // 速度降为 70%（即降低 30%）
    private readonly SLOW_DURATION = 2.0;      // 持续 2 秒

    // 金币
    private readonly INITIAL_GOLD = 300;
    private readonly KILL_REWARD = 20;

    // 子弹
    private readonly BULLET_SPEED = 500;

    // 波次配置
    private readonly WAVES: WaveConfig[] = [
        { count: 5,  hp: 20,  interval: 1.0 },
        { count: 8,  hp: 30,  interval: 0.8 },
        { count: 10, hp: 50,  interval: 0.6 },
        { count: 5,  hp: 100, interval: 1.5 },
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

    // 运行时状态
    private gameLayer: Node | null = null;
    private gameTransform: UITransform | null = null;
    private enemies: { node: Node; hp: number; maxHp: number; slowTimer: number; slowMultiplier: number }[] = [];
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
    private waveActive = false;
    private waveDelay = 0;  // 波次间延迟

    // 塔按钮位置
    private readonly TOWER_BUTTON_POS = new Vec3(-400, -200, 0);
    private readonly SLOW_BUTTON_POS = new Vec3(-400, -100, 0);

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

        // === 所有触摸事件绑定到 Canvas ===
        canvas.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const buttonLocal = this.eventToCanvasLocal(event);
            const gameLocal = this.eventToGameLocal(event);

            // 1. 判断是否点中了塔按钮（新建）
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

            const local = this.eventToGameLocal(event);
            if (this.canPlace) {
                // 找最近的可用建造点
                let nearestSlot = -1;
                let nearestDist = Infinity;
                for (let i = 0; i < this.SLOT_POSITIONS.length; i++) {
                    if (this.slotOccupied[i]) continue;
                    const dist = Vec3.distance(local, this.SLOT_POSITIONS[i]);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestSlot = i;
                    }
                }

                if (nearestSlot >= 0) {
                    if (this.dragMode === 'place') {
                        // 新建塔
                        this.placeTower(nearestSlot, this.dragTowerType);
                    } else if (this.dragMode === 'move' && this.moveFromSlot >= 0) {
                        // 移动塔：找到对应塔对象，更新位置
                        for (const tower of this.towers) {
                            if (Vec3.distance(tower.node.position, this.SLOT_POSITIONS[this.moveFromSlot]) < 5) {
                                tower.node.setPosition(this.SLOT_POSITIONS[nearestSlot]);
                                break;
                            }
                        }
                        // 释放原槽位，占用新槽位
                        this.slotOccupied[this.moveFromSlot] = false;
                        this.slotNodes[this.moveFromSlot].active = true;
                        this.slotOccupied[nearestSlot] = true;
                        this.slotNodes[nearestSlot].active = false;
                        console.log(`塔从位置 ${this.moveFromSlot + 1} 移动到 ${nearestSlot + 1}`);
                        this.moveFromSlot = -1;
                    }
                }
            }
            this.canPlace = false;
            this.moveFromSlot = -1;
        });

        canvas.on(Node.EventType.TOUCH_CANCEL, () => {
            this.isDragging = false;
            this.ghostNode!.active = false;
            this.canPlace = false;
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
            console.log(`  Wave ${i + 1}: ${w.count}只 HP=${w.hp} 间隔=${w.interval}s`);
        });
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
        this.spawnTimer = 0;
        this.waveActive = true;

        console.log(`Wave ${this.currentWave} 开始: ${wave.count}只 HP=${wave.hp}`);
        if (this.waveLabel) {
            this.waveLabel.string = `Wave: ${this.currentWave}/${this.WAVES.length}`;
        }
    }

    private victory(): void {
        this.waveActive = false;
        this.isGameOver = true;  // 复用 isGameOver 停止 update 逻辑

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
            if (this.slotOccupied[i]) continue;
            const dist = Vec3.distance(local, this.SLOT_POSITIONS[i]);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestSlot = i;
            }
        }

        const cost = this.dragTowerType === 'attack' ? this.TOWER_COST : this.SLOW_TOWER_COST;
        // 移动模式不扣钱，只需要目标槽位空闲
        const goldOk = this.dragMode === 'move' || this.gold >= cost;
        this.canPlace = nearestSlot >= 0 && nearestDist < 80 && goldOk;

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

        // === 波次生成 ===
        if (this.waveActive) {
            const wave = this.WAVES[this.currentWave - 1];
            if (this.spawnedInWave < wave.count) {
                this.spawnTimer += dt;
                if (this.spawnTimer >= wave.interval) {
                    this.spawnTimer = 0;
                    this.spawnedInWave++;
                    this.spawnEnemy(wave.hp);
                }
            }
            // 当前波次全部生成且全部死亡 → 下一波
            if (this.spawnedInWave >= wave.count && this.enemies.length === 0) {
                this.waveActive = false;
                this.waveDelay = 2;
                console.log(`Wave ${this.currentWave} 完成（spawned=${this.spawnedInWave}/${wave.count}, enemies=0），等待 2 秒后启动 Wave ${this.currentWave + 1}`);
            }
        } else if (this.waveDelay > 0) {
            this.waveDelay -= dt;
            if (this.waveDelay <= 0) {
                this.startNextWave();
            }
        }

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
                const speed = this.ENEMY_SPEED * e.slowMultiplier;
                e.node.setPosition(pos.x + Math.sign(dx) * speed * dt, pos.y, 0);
            }
        }

        // === HP 显示 ===
        if (this.statusLabel) {
            if (this.waveActive) {
                const wave = this.WAVES[this.currentWave - 1];
                const remaining = wave.count - this.spawnedInWave + this.enemies.length;
                this.statusLabel.string = `剩余敌人: ${remaining}  塔: ${this.towers.length}`;
            } else if (this.waveDelay > 0) {
                this.statusLabel.string = `下一波倒计时: ${Math.ceil(this.waveDelay)}s  塔: ${this.towers.length}`;
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
    private spawnEnemy(hp: number): void {
        if (!this.gameLayer) return;

        const enemy = new Node('Enemy');
        enemy.layer = Layers.Enum.UI_2D;
        enemy.setParent(this.gameLayer);
        enemy.setPosition(this.PATH_START);

        const transform = enemy.addComponent(UITransform);
        transform.setContentSize(28, 28);

        const gfx = enemy.addComponent(Graphics);
        gfx.fillColor = new Color(80, 200, 80, 255);
        gfx.circle(0, 0, 14);
        gfx.fill();

        this.enemies.push({ node: enemy, hp, maxHp: hp, slowTimer: 0, slowMultiplier: 1 });
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
