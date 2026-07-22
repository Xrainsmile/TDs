import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';

const { ccclass } = _decorator;

/**
 * 极简版 SceneInitializer
 *
 * 核心闭环：
 * 1. 敌人反复生成 → 沿路径走 → 到终点重新生成
 * 2. 从左侧拖拽塔按钮 → 拖到格子放置（拖到空白处取消）
 * 3. 塔自动攻击范围内敌人 → 发射子弹 → 命中扣 HP → 死亡 → 重新生成
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {

    // 路径
    private readonly PATH_START = new Vec3(-400, 0, 0);
    private readonly PATH_END = new Vec3(400, 0, 0);

    // 敌人属性
    private readonly ENEMY_HP = 30;
    private readonly ENEMY_SPEED = 80;

    // 塔属性
    private readonly TOWER_RANGE = 200;
    private readonly TOWER_DAMAGE = 10;
    private readonly TOWER_INTERVAL = 0.8;

    // 子弹
    private readonly BULLET_SPEED = 500;

    // 运行时状态
    private gameLayer: Node | null = null;
    private gameTransform: UITransform | null = null;
    private enemy: Node | null = null;
    private enemyHp = 0;
    private towers: Node[] = [];
    private towerTimers: number[] = [];
    private bullets: { node: Node; vx: number; vy: number; target: Node }[] = [];
    private statusLabel: Label | null = null;

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
    private isDragging = false;
    private magnetTarget = -1;

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

        // === 拖拽幽灵塔（在 GameLayer 下，与建造点同坐标系）===
        this.ghostNode = new Node('DragGhost');
        this.ghostNode.layer = Layers.Enum.UI_2D;
        this.ghostNode.setParent(this.gameLayer);
        const ghostTransform = this.ghostNode.addComponent(UITransform);
        ghostTransform.setContentSize(48, 48);
        ghostTransform.setAnchorPoint(0.5, 0.5);
        const ghostGfx = this.ghostNode.addComponent(Graphics);
        ghostGfx.fillColor = new Color(50, 150, 255, 120);
        ghostGfx.circle(0, 0, 20);
        ghostGfx.fill();
        this.ghostNode.active = false;

        // === 左侧塔栏（拖拽源）===
        const towerButton = this.createTowerButton();
        towerButton.setParent(canvas);

        // === 拖拽事件 ===
        // TOUCH_START 在按钮上
        towerButton.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            this.isDragging = true;
            this.ghostNode!.active = true;
            const local = this.eventToGameLocal(event);
            this.ghostNode!.setPosition(local);
        });

        // TOUCH_MOVE / TOUCH_END 在 Canvas 上（全屏追踪）
        canvas.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!this.isDragging) return;
            const local = this.eventToGameLocal(event);
            this.ghostNode!.setPosition(local);

            // 磁吸检测
            this.magnetTarget = -1;
            for (let i = 0; i < this.SLOT_POSITIONS.length; i++) {
                if (this.slotOccupied[i]) continue;
                const dist = Vec3.distance(local, this.SLOT_POSITIONS[i]);
                if (dist < 60) {
                    this.magnetTarget = i;
                    this.ghostNode!.setPosition(this.SLOT_POSITIONS[i]);
                    break;
                }
            }

            // 高亮
            for (let i = 0; i < this.slotNodes.length; i++) {
                if (this.slotOccupied[i]) continue;
                const gfx = this.slotNodes[i].getComponent(Graphics);
                if (gfx) {
                    if (i === this.magnetTarget) {
                        gfx.strokeColor = new Color(100, 255, 100, 255);
                        gfx.fillColor = new Color(100, 255, 100, 100);
                    } else {
                        gfx.strokeColor = new Color(100, 200, 100, 200);
                        gfx.fillColor = new Color(100, 200, 100, 60);
                    }
                }
            }
        });

        canvas.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.ghostNode!.active = false;

            console.log(`TOUCH_END: magnetTarget=${this.magnetTarget}`);
            if (this.magnetTarget >= 0) {
                this.placeTower(this.magnetTarget);
            } else {
                console.log('拖到空白处，取消放置');
            }
            this.magnetTarget = -1;
        });

        canvas.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            if (!this.isDragging) return;
            console.log('TOUCH_CANCEL: 拖拽被取消');
            this.isDragging = false;
            this.ghostNode!.active = false;
            this.magnetTarget = -1;
        });

        // === 状态显示 ===
        const labelNode = new Node('Status');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setParent(canvas);
        labelNode.addComponent(UITransform);
        labelNode.setPosition(0, 280, 0);
        this.statusLabel = labelNode.addComponent(Label);
        this.statusLabel.string = '从左侧拖拽塔到绿色格子';
        this.statusLabel.fontSize = 20;

        // === 生成第一个敌人 ===
        this.spawnEnemy();

        console.log('SceneInitializer: 极简版启动');
        console.log('拖拽塔按钮到格子放塔 → 塔自动攻击 → 敌人死亡 → 重新生成');
    }

    /** 屏幕坐标 → GameLayer 局部坐标 */
    private eventToGameLocal(event: EventTouch): Vec3 {
        const uiPos = event.getUILocation();
        return this.gameTransform!.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
    }

    protected update(dt: number): void {
        // === 敌人移动 ===
        if (this.enemy) {
            const pos = this.enemy.position;
            const dx = this.PATH_END.x - pos.x;

            if (Math.abs(dx) < 5) {
                this.enemy.destroy();
                this.enemy = null;
                this.scheduleOnce(() => this.spawnEnemy(), 1);
            } else {
                this.enemy.setPosition(pos.x + Math.sign(dx) * this.ENEMY_SPEED * dt, pos.y, 0);
            }
        }

        // === 更新 HP 显示 ===
        if (this.statusLabel) {
            if (this.enemy) {
                this.statusLabel.string = `敌人 HP: ${this.enemyHp}/${this.ENEMY_HP}  塔: ${this.towers.length}`;
            } else {
                this.statusLabel.string = `等待敌人生成...  塔: ${this.towers.length}`;
            }
        }

        // === 塔攻击 ===
        for (let i = 0; i < this.towers.length; i++) {
            if (!this.enemy) continue;
            const dist = Vec3.distance(this.towers[i].position, this.enemy.position);
            if (dist > this.TOWER_RANGE) continue;

            this.towerTimers[i] += dt;
            if (this.towerTimers[i] >= this.TOWER_INTERVAL) {
                this.towerTimers[i] = 0;
                this.tryAttack(i);
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

            // 命中检测
            if (b.target.isValid) {
                const d = Vec3.distance(b.node.position, b.target.position);
                if (d < 16) {
                    this.enemyHp -= this.TOWER_DAMAGE;
                    b.node.destroy();
                    this.bullets.splice(i, 1);

                    if (this.enemyHp <= 0 && this.enemy) {
                        this.enemy.destroy();
                        this.enemy = null;
                        this.scheduleOnce(() => this.spawnEnemy(), 1);
                    }
                    continue;
                }
            } else {
                b.node.destroy();
                this.bullets.splice(i, 1);
                continue;
            }

            // 飞出范围销毁
            if (Vec3.distance(b.node.position, Vec3.ZERO) > 800) {
                b.node.destroy();
                this.bullets.splice(i, 1);
            }
        }
    }

    /** 生成敌人 */
    private spawnEnemy(): void {
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

        this.enemy = enemy;
        this.enemyHp = this.ENEMY_HP;
    }

    /** 尝试攻击 */
    private tryAttack(towerIndex: number): void {
        if (!this.enemy || !this.towers[towerIndex]) return;
        const towerPos = this.towers[towerIndex].position;
        const enemyPos = this.enemy.position;
        if (Vec3.distance(towerPos, enemyPos) <= this.TOWER_RANGE) {
            this.fireBullet(towerPos, enemyPos, this.enemy);
        }
    }

    /** 发射子弹 */
    private fireBullet(from: Vec3, to: Vec3, target: Node): void {
        if (!this.gameLayer) return;

        const bullet = new Node('Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(this.gameLayer);
        bullet.setPosition(from);

        const transform = bullet.addComponent(UITransform);
        transform.setContentSize(12, 12);

        const gfx = bullet.addComponent(Graphics);
        gfx.fillColor = new Color(100, 180, 255, 255);
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

    /** 放置塔 */
    private placeTower(slotIndex: number): void {
        if (this.slotOccupied[slotIndex] || !this.gameLayer) return;

        const tower = this.createTower(this.SLOT_POSITIONS[slotIndex]);
        tower.setParent(this.gameLayer);

        this.towers.push(tower);
        this.towerTimers.push(this.TOWER_INTERVAL);
        this.slotOccupied[slotIndex] = true;
        this.slotNodes[slotIndex].active = false;

        console.log(`塔放置到位置 ${slotIndex + 1}，当前塔数: ${this.towers.length}`);
    }

    /** 创建左侧塔按钮 */
    private createTowerButton(): Node {
        const node = new Node('TowerButton');
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(80, 80);
        node.setPosition(-400, 0, 0);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-30, -30, 60, 60);
        gfx.fill();
        gfx.fillColor = new Color(50, 150, 255, 255);
        gfx.circle(0, 0, 16);
        gfx.fill();

        return node;
    }

    /** 创建塔 */
    private createTower(pos: Vec3): Node {
        const node = new Node('Tower');
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(48, 48);

        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-20, -20, 40, 40);
        gfx.fill();
        gfx.fillColor = new Color(50, 150, 255, 255);
        gfx.circle(0, 0, 14);
        gfx.fill();
        gfx.fillColor = new Color(255, 255, 255, 255);
        gfx.circle(0, 0, 4);
        gfx.fill();
        gfx.strokeColor = new Color(50, 150, 255, 60);
        gfx.lineWidth = 2;
        gfx.circle(0, 0, this.TOWER_RANGE);
        gfx.stroke();

        return node;
    }

    /** 创建建造点 */
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

    /** 绘制路径 */
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
