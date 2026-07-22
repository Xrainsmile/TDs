import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';

const { ccclass } = _decorator;

/**
 * 极简版 SceneInitializer
 *
 * 核心闭环：
 * 1. 敌人反复生成 → 沿路径走 → 到终点重新生成
 * 2. 点击格子 → 放置塔
 * 3. 塔自动攻击范围内敌人 → 发射子弹 → 命中扣 HP → 死亡 → 重新生成
 *
 * 直接创建、直接销毁，不引入对象池
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
        const gameTransform = this.gameLayer.addComponent(UITransform);
        gameTransform.setContentSize(960, 640);

        // === 路径 ===
        this.drawPath(this.gameLayer);

        // === 3个建造点（可点击）===
        for (let i = 0; i < this.SLOT_POSITIONS.length; i++) {
            const slot = this.createTowerSlot(this.SLOT_POSITIONS[i], i);
            slot.setParent(this.gameLayer);
            this.slotNodes.push(slot);

            // 点击格子放塔
            slot.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                this.placeTower(i);
            });
        }

        // === 状态显示 ===
        const labelNode = new Node('Status');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setParent(canvas);
        labelNode.addComponent(UITransform);
        labelNode.setPosition(0, 280, 0);
        this.statusLabel = labelNode.addComponent(Label);
        this.statusLabel.string = '点击绿色格子放塔';
        this.statusLabel.fontSize = 20;

        // === 生成第一个敌人 ===
        this.spawnEnemy();

        console.log('SceneInitializer: 极简版启动');
        console.log('点击绿色格子放塔 → 塔自动攻击 → 敌人死亡 → 重新生成');
    }

    protected update(dt: number): void {
        // === 敌人移动 ===
        if (this.enemy) {
            const pos = this.enemy.position;
            const dx = this.PATH_END.x - pos.x;

            if (Math.abs(dx) < 5) {
                // 到达终点，重新生成
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
            // 只在敌人进入范围时才计时
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
                    // 命中
                    this.enemyHp -= this.TOWER_DAMAGE;
                    console.log(`命中！HP: ${this.enemyHp}/${this.ENEMY_HP}`);
                    b.node.destroy();
                    this.bullets.splice(i, 1);

                    // 敌人死亡
                    if (this.enemyHp <= 0 && this.enemy) {
                        this.enemy.destroy();
                        this.enemy = null;
                        this.scheduleOnce(() => this.spawnEnemy(), 1);
                    }
                    continue;
                }
            } else {
                // 目标已消失，子弹销毁
                b.node.destroy();
                this.bullets.splice(i, 1);
                continue;
            }

            // 飞出范围销毁
            const distFromOrigin = Vec3.distance(b.node.position, Vec3.ZERO);
            if (distFromOrigin > 800) {
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
        const dist = Vec3.distance(towerPos, enemyPos);

        if (dist <= this.TOWER_RANGE) {
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

        // 计算速度向量
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

    /** 点击格子放塔 */
    private placeTower(slotIndex: number): void {
        if (this.slotOccupied[slotIndex]) return;
        if (!this.gameLayer) return;

        const tower = this.createTower(this.SLOT_POSITIONS[slotIndex]);
        tower.setParent(this.gameLayer);

        this.towers.push(tower);
        this.towerTimers.push(this.TOWER_INTERVAL);  // 满值，敌人进入范围立即发射
        this.slotOccupied[slotIndex] = true;

        // 隐藏建造点
        this.slotNodes[slotIndex].active = false;

        console.log(`塔放置到位置 ${slotIndex + 1}，当前塔数: ${this.towers.length}`);
    }

    /** 创建塔 */
    private createTower(pos: Vec3): Node {
        const node = new Node('Tower');
        node.layer = Layers.Enum.UI_2D;
        node.setPosition(pos);

        const transform = node.addComponent(UITransform);
        transform.setContentSize(48, 48);

        const gfx = node.addComponent(Graphics);
        // 底座
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-20, -20, 40, 40);
        gfx.fill();
        // 顶部
        gfx.fillColor = new Color(50, 150, 255, 255);
        gfx.circle(0, 0, 14);
        gfx.fill();
        // 中心
        gfx.fillColor = new Color(255, 255, 255, 255);
        gfx.circle(0, 0, 4);
        gfx.fill();
        // 攻击范围圈
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

        // "+" 号
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

        // 起点绿圈
        gfx.fillColor = new Color(0, 255, 0, 200);
        gfx.circle(this.PATH_START.x, this.PATH_START.y, 20);
        gfx.fill();

        // 终点红圈
        gfx.fillColor = new Color(255, 0, 0, 200);
        gfx.circle(this.PATH_END.x, this.PATH_END.y, 20);
        gfx.fill();
    }
}
