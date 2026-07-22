import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';

const { ccclass } = _decorator;

/**
 * 极简版 SceneInitializer
 *
 * 只做一件事：
 * 一个敌人反复生成 → 沿路径走 → 塔自动攻击 → 敌人死亡 → 再生成
 *
 * 移除所有干扰：
 * - 无金币/经济
 * - 无 BuffSystem
 * - 无对象池
 * - 无波次/倒计时/胜利失败
 * - 无升级/出售
 * - 无多种塔/多种敌人
 * - 无复杂事件
 *
 * 直接创建、直接销毁
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {

    private enemy: Node | null = null;
    private tower: Node | null = null;
    private towerTimer: number = 0;
    private statusLabel: Label | null = null;

    // 路径
    private readonly PATH_START = new Vec3(-400, 0, 0);
    private readonly PATH_END = new Vec3(400, 0, 0);

    // 敌人属性
    private readonly ENEMY_HP = 30;
    private readonly ENEMY_SPEED = 80;
    private enemyHp = 0;

    // 塔属性
    private readonly TOWER_POS = new Vec3(0, -64, 0);
    private readonly TOWER_RANGE = 200;
    private readonly TOWER_DAMAGE = 10;
    private readonly TOWER_INTERVAL = 0.8;

    protected start(): void {
        view.setDesignResolutionSize(960, 640, 3);
        this.setupScene();
    }

    private setupScene(): void {
        const canvas = this.node;

        // === GameLayer ===
        const gameLayer = new Node('GameLayer');
        gameLayer.layer = Layers.Enum.UI_2D;
        gameLayer.setParent(canvas);
        const gameTransform = gameLayer.addComponent(UITransform);
        gameTransform.setContentSize(960, 640);

        // === 路径可视化 ===
        this.drawPath(gameLayer);

        // === 塔（直接创建）===
        this.tower = this.createTower(this.TOWER_POS);
        this.tower.setParent(gameLayer);

        // === 状态显示 ===
        const labelNode = new Node('Status');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setParent(canvas);
        labelNode.addComponent(UITransform);
        labelNode.setPosition(0, 280, 0);
        this.statusLabel = labelNode.addComponent(Label);
        this.statusLabel.string = '敌人 HP: 0';
        this.statusLabel.fontSize = 20;

        // === 生成第一个敌人 ===
        this.spawnEnemy(gameLayer);

        console.log('SceneInitializer: 极简版启动');
        console.log('一个敌人反复生成 → 塔攻击 → 死亡 → 再生成');
    }

    protected update(dt: number): void {
        if (!this.enemy) return;

        // 敌人移动
        const pos = this.enemy.position;
        const dx = this.PATH_END.x - pos.x;
        const dist = Math.abs(dx);

        if (dist < 5) {
            // 到达终点，重新生成
            this.enemy.destroy();
            this.enemy = null;
            this.scheduleOnce(() => {
                this.spawnEnemy(this.node.getChildByName('GameLayer')!);
            }, 1);
            return;
        }

        // 向右移动
        const moveSpeed = this.ENEMY_SPEED * dt;
        this.enemy.setPosition(pos.x + Math.sign(dx) * moveSpeed, pos.y, 0);

        // 更新 HP 显示
        if (this.statusLabel) {
            this.statusLabel.string = `敌人 HP: ${this.enemyHp}`;
        }

        // 塔攻击
        this.towerTimer += dt;
        if (this.towerTimer >= this.TOWER_INTERVAL) {
            this.towerTimer = 0;
            const towerPos = this.tower.position;
            const enemyPos = this.enemy.position;
            const distToEnemy = Vec3.distance(towerPos, enemyPos);

            if (distToEnemy <= this.TOWER_RANGE) {
                // 发射子弹
                this.fireBullet(towerPos, enemyPos, this.enemy);
            }
        }
    }

    /** 生成敌人 */
    private spawnEnemy(parent: Node): void {
        const enemy = new Node('Enemy');
        enemy.layer = Layers.Enum.UI_2D;
        enemy.setParent(parent);
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

    /** 发射子弹 */
    private fireBullet(from: Vec3, to: Vec3, target: Node): void {
        const gameLayer = this.node.getChildByName('GameLayer')!;

        const bullet = new Node('Bullet');
        bullet.layer = Layers.Enum.UI_2D;
        bullet.setParent(gameLayer);
        bullet.setPosition(from);

        const transform = bullet.addComponent(UITransform);
        transform.setContentSize(12, 12);

        const gfx = bullet.addComponent(Graphics);
        gfx.fillColor = new Color(100, 180, 255, 255);
        gfx.circle(0, 0, 6);
        gfx.fill();

        // 计算方向
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 500;

        // 子弹飞行 + 命中检测
        let elapsed = 0;
        const update = () => {
            if (!bullet.isValid) return;

            elapsed += 1 / 60; // 近似
            const pos = bullet.position;
            const newX = pos.x + (dx / dist) * speed * (1 / 60);
            const newY = pos.y + (dy / dist) * speed * (1 / 60);
            bullet.setPosition(newX, newY, 0);

            // 检测命中
            if (target.isValid) {
                const d = Vec3.distance(bullet.position, target.position);
                if (d < 16) {
                    // 命中
                    this.enemyHp -= this.TOWER_DAMAGE;
                    bullet.destroy();
                    return;
                }
            }

            // 超时销毁
            if (elapsed > 2) {
                bullet.destroy();
                return;
            }

            requestAnimationFrame(update);
        };

        // 用 schedule 替代 requestAnimationFrame（Cocos 环境）
        const bulletUpdate = () => {
            if (!bullet.isValid) return;
            const pos = bullet.position;
            const newX = pos.x + (dx / dist) * speed * (1 / 60);
            const newY = pos.y + (dy / dist) * speed * (1 / 60);
            bullet.setPosition(newX, newY, 0);

            if (target.isValid) {
                const d = Vec3.distance(bullet.position, target.position);
                if (d < 16) {
                    this.enemyHp -= this.TOWER_DAMAGE;
                    console.log(`命中！HP: ${this.enemyHp}/${this.ENEMY_HP}`);
                    bullet.destroy();

                    // 敌人死亡
                    if (this.enemyHp <= 0) {
                        target.destroy();
                        this.enemy = null;
                        // 1秒后重新生成
                        this.scheduleOnce(() => {
                            this.spawnEnemy(this.node.getChildByName('GameLayer')!);
                        }, 1);
                    }
                    return;
                }
            }

            // 飞出范围销毁
            if (Vec3.distance(bullet.position, this.tower!.position) > this.TOWER_RANGE * 2) {
                bullet.destroy();
                return;
            }

            // 下一帧继续
            this.scheduleOnce(bulletUpdate, 0);
        };

        this.scheduleOnce(bulletUpdate, 0);
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

        // 攻击范围圈（半透明）
        gfx.strokeColor = new Color(50, 150, 255, 60);
        gfx.lineWidth = 2;
        gfx.circle(0, 0, this.TOWER_RANGE);
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
