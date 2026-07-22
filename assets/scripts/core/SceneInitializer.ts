import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, v3 } from 'cc';
import { CoordinateService } from './CoordinateService';
import { GameStateManager } from '../systems/GameStateManager';
import { CurrencySystem } from '../systems/CurrencySystem';
import { DamageSystem } from '../systems/DamageSystem';
import { BuffSystem } from '../systems/buffs/BuffSystem';
import { WaveManager } from '../systems/WaveManager';
import { PathManager } from '../systems/PathManager';
import { EnemyController } from '../systems/EnemyController';
import { TowerController } from '../systems/TowerController';
import { ProjectileController } from '../systems/ProjectileController';
import { TowerType, GameState } from './Constants';
import { GameEvents } from './EventNames';

const { ccclass, property } = _decorator;

const TOWER_COST = 300;

/**
 * MVP 版 SceneInitializer
 *
 * 用户流程：
 * 1. 看到 HUD + 路径 + 左侧塔栏 + 开始波次按钮
 * 2. 点击开始波次 → 倒计时 3 秒
 * 3. 倒计时结束 → 3个建造点出现 + 敌人开始生成
 * 4. 从左侧拖拽塔按钮 → 放到建造点（花 300 金币）
 * 5. 塔自动攻击敌人 → 敌人血量归 0 → 消失
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {

    protected start(): void {
        this.setupScene();
    }

    private async setupScene(): Promise<void> {
        console.log('SceneInitializer: MVP 版启动');

        const canvas = this.node;
        const W = CoordinateService.DESIGN_WIDTH;
        const H = CoordinateService.DESIGN_HEIGHT;
        view.setDesignResolutionSize(W, H, 3);

        // 获取 Canvas 的 UITransform，用于坐标转换
        const canvasTransform = canvas.getComponent(UITransform)!;

        // === 1. GameManager ===
        const gmNode = new Node('GameManager');
        gmNode.layer = Layers.Enum.UI_2D;
        canvas.addChild(gmNode);

        const currency = gmNode.addComponent(CurrencySystem);
        const buffSystem = gmNode.addComponent(BuffSystem);
        const damageSystem = gmNode.addComponent(DamageSystem);
        damageSystem.buffSystem = buffSystem;
        const gameState = gmNode.addComponent(GameStateManager);

        // === 2. CoordinateService ===
        const coordService = canvas.addComponent(CoordinateService);
        coordService.originX = -W / 2;
        coordService.originY = -H / 2;

        // === 3. GameLayer ===
        const gameLayer = new Node('GameLayer');
        gameLayer.layer = Layers.Enum.UI_2D;
        gameLayer.setParent(canvas);
        const gameLayerTransform = gameLayer.addComponent(UITransform);
        gameLayerTransform.setContentSize(W, H);

        // --- 3a. 路径（直线，y=0）---
        const pathPoints = [{ x: -400, y: 0 }, { x: 400, y: 0 }];
        const pathNode = new Node('PathManager');
        pathNode.layer = Layers.Enum.UI_2D;
        pathNode.setParent(gameLayer);
        const pathManager = pathNode.addComponent(PathManager);
        pathManager.setWaypoints(pathPoints);
        this.drawPath(pathNode, pathPoints);

        // --- 3b. 3个建造点 ---
        const slotPositions: Vec3[] = [
            new Vec3(-150, -64, 0),
            new Vec3(0, -64, 0),
            new Vec3(150, -64, 0),
        ];
        const slotNodes: Node[] = [];
        for (let i = 0; i < slotPositions.length; i++) {
            const slot = this.createTowerSlot(slotPositions[i], i + 1);
            slot.setParent(gameLayer);
            slot.active = false;  // 倒计时后显示
            slotNodes.push(slot);
        }

        // --- 3c. EnemyLayer ---
        const enemyLayer = new Node('EnemyLayer');
        enemyLayer.layer = Layers.Enum.UI_2D;
        enemyLayer.setParent(gameLayer);
        enemyLayer.addComponent(UITransform);
        const enemyController = enemyLayer.addComponent(EnemyController);
        enemyController.enemyContainer = enemyLayer;
        enemyController.setGameStateManager(gameState);
        enemyController.setBuffSystem(buffSystem);
        enemyController.initWithTemplates();

        // --- 3d. TowerLayer ---
        const towerLayer = new Node('TowerLayer');
        towerLayer.layer = Layers.Enum.UI_2D;
        towerLayer.setParent(gameLayer);
        towerLayer.addComponent(UITransform);
        const towerController = towerLayer.addComponent(TowerController);
        towerController.towerContainer = towerLayer;
        towerController.enemyController = enemyController;
        towerController.setGameStateManager(gameState);
        towerController.enableTemplates();

        // --- 3e. ProjectileController ---
        const projectileLayer = new Node('ProjectileLayer');
        projectileLayer.layer = Layers.Enum.UI_2D;
        projectileLayer.setParent(gameLayer);
        projectileLayer.addComponent(UITransform);
        const projectileController = projectileLayer.addComponent(ProjectileController);
        projectileController.projectileContainer = projectileLayer;
        projectileController.damageSystem = damageSystem;
        projectileController.enemyController = enemyController;
        projectileController.initWithTemplates();
        towerController.projectileController = projectileController;

        // --- 3f. WaveManager ---
        const waveNode = new Node('WaveManager');
        waveNode.layer = Layers.Enum.UI_2D;
        waveNode.setParent(gameLayer);
        const waveManager = waveNode.addComponent(WaveManager);
        waveManager.pathManager = pathManager;
        waveManager.enemyController = enemyController;
        waveManager.setGameStateManager(gameState);
        enemyController.setWaveManager(waveManager);
        waveManager.loadWaves([
            { waveIndex: 0, enemies: [{ enemyType: 1, count: 10, interval: 1.0, delay: 0 }] },
            { waveIndex: 1, enemies: [{ enemyType: 1, count: 10, interval: 0.8, delay: 1 }] },
            { waveIndex: 2, enemies: [{ enemyType: 2, count: 5, interval: 0.5, delay: 0 }, { enemyType: 3, count: 2, interval: 2.0, delay: 3 }] },
        ]);

        // === 4. UILayer ===
        const uiLayer = new Node('UILayer');
        uiLayer.layer = Layers.Enum.UI_2D;
        uiLayer.setParent(canvas);
        const uiTransform = uiLayer.addComponent(UITransform);
        uiTransform.setContentSize(W, H);

        // --- HUD ---
        const hudNode = new Node('HUD');
        hudNode.layer = Layers.Enum.UI_2D;
        hudNode.setParent(uiLayer);
        const hudTransform = hudNode.addComponent(UITransform);
        hudTransform.setContentSize(W, 40);
        hudTransform.setAnchorPoint(0.5, 1);
        hudNode.setPosition(0, H / 2, 0);

        const goldLabel = this.createLabel('Gold', 'Gold: 0', -W / 2 + 80, 0);
        goldLabel.setParent(hudNode);
        const livesLabel = this.createLabel('Lives', 'Lives: 0', -W / 2 + 240, 0);
        livesLabel.setParent(hudNode);
        const waveLabel = this.createLabel('Wave', 'Wave: 0/3', W / 2 - 120, 0);
        waveLabel.setParent(hudNode);

        gameState.on(GameEvents.GOLD_CHANGED, (gold: number) => {
            goldLabel.getComponent(Label)!.string = `Gold: ${gold}`;
        });
        gameState.on(GameEvents.LIVES_CHANGED, (lives: number) => {
            livesLabel.getComponent(Label)!.string = `Lives: ${lives}`;
        });
        gameState.on(GameEvents.WAVE_START, (wave: number) => {
            waveLabel.getComponent(Label)!.string = `Wave: ${wave}/3`;
        });

        // --- 倒计时显示 ---
        const countdownLabel = this.createLabel('Countdown', '', 0, 0);
        countdownLabel.setParent(uiLayer);
        const cdLabel = countdownLabel.getComponent(Label)!;
        cdLabel.fontSize = 48;

        // --- 左侧塔栏（拖拽源）---
        const towerBar = new Node('TowerBar');
        towerBar.layer = Layers.Enum.UI_2D;
        towerBar.setParent(uiLayer);
        towerBar.addComponent(UITransform);
        towerBar.setPosition(-W / 2 + 60, 0, 0);

        const towerButton = this.createDraggableTowerButton('箭塔', TOWER_COST, 0, 100);
        towerButton.setParent(towerBar);

        // --- 拖拽幽灵（跟随手指的半透明塔）---
        const ghostNode = new Node('DragGhost');
        ghostNode.layer = Layers.Enum.UI_2D;
        ghostNode.setParent(uiLayer);
        const ghostTransform = ghostNode.addComponent(UITransform);
        ghostTransform.setContentSize(48, 48);
        ghostTransform.setAnchorPoint(0.5, 0.5);
        const ghostGfx = ghostNode.addComponent(Graphics);
        ghostGfx.fillColor = new Color(50, 150, 255, 120);
        // 画在节点中心（-24~24 范围内居中）
        ghostGfx.circle(0, 0, 20);
        ghostGfx.fill();
        ghostNode.active = false;

        // --- 拖拽逻辑 ---
        // TOUCH_START 绑定在按钮上，TOUCH_MOVE/TOUCH_END 绑定在 Canvas 上
        let isDragging = false;
        let placedCount = 0;  // 已放置塔数量（第一个免费）

        towerButton.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const isFirstTower = placedCount === 0;
            if (!isFirstTower && gameState.Gold < TOWER_COST) {
                console.log(`金币不足，需要 ${TOWER_COST}，当前 ${gameState.Gold}`);
                return;
            }
            isDragging = true;
            ghostNode.active = true;
            console.log(`开始拖拽塔${isFirstTower ? '（首塔免费）' : ''}`);
        });

        // 统一坐标转换：getUILocation() + convertToNodeSpaceAR()
        // getUILocation() 返回 UI 世界坐标（左下角原点）
        // convertToNodeSpaceAR() 转为目标节点的局部坐标（考虑锚点/缩放/位置）
        const eventToLocal = (event: EventTouch, parentTransform: UITransform): Vec3 => {
            const uiPos = event.getUILocation();
            return parentTransform.convertToNodeSpaceAR(v3(uiPos.x, uiPos.y, 0));
        };

        // TOUCH_START 时也立即放置幽灵塔，避免先出现在默认坐标
        towerButton.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const isFirstTower = placedCount === 0;
            if (!isFirstTower && gameState.Gold < TOWER_COST) {
                console.log(`金币不足，需要 ${TOWER_COST}，当前 ${gameState.Gold}`);
                return;
            }
            isDragging = true;
            ghostNode.active = true;
            // 按下时立即放到鼠标位置
            const local = eventToLocal(event, uiTransform);
            ghostNode.setPosition(local);
            console.log(`开始拖拽塔${isFirstTower ? '（首塔免费）' : ''}`);
        });

        // TOUCH_MOVE 绑定到 Canvas（手指离开按钮后仍能追踪）
        canvas.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!isDragging) return;
            const local = eventToLocal(event, uiTransform);
            ghostNode.setPosition(local.x, local.y, 0);

            // 磁吸高亮：拖拽时高亮最近的建造点
            for (let i = 0; i < slotNodes.length; i++) {
                const slot = slotNodes[i];
                if (!slot.active) continue;
                const dist = Math.sqrt(
                    (local.x - slotPositions[i].x) ** 2 +
                    (local.y - slotPositions[i].y) ** 2
                );
                const gfx = slot.getComponent(Graphics);
                if (gfx) {
                    if (dist < 120) {
                        // 高亮：绿色边框变亮
                        gfx.strokeColor = new Color(100, 255, 100, 255);
                        gfx.fillColor = new Color(100, 255, 100, 80);
                    } else {
                        gfx.strokeColor = new Color(100, 200, 100, 200);
                        gfx.fillColor = new Color(100, 200, 100, 60);
                    }
                }
            }
        });

        // TOUCH_END 绑定到 Canvas
        canvas.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!isDragging) return;
            isDragging = false;
            ghostNode.active = false;

            // 建造点在 GameLayer 下，用 GameLayer 的 UITransform 转换
            const local = eventToLocal(event, gameLayerTransform);
            const dropX = local.x;
            const dropY = local.y;

            // 磁吸：找最近的建造点
            let nearestSlot = -1;
            let nearestDist = Infinity;
            for (let i = 0; i < slotPositions.length; i++) {
                const slot = slotNodes[i];
                if (!slot.active) continue;

                const dist = Math.sqrt(
                    (dropX - slotPositions[i].x) ** 2 +
                    (dropY - slotPositions[i].y) ** 2
                );
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestSlot = i;
                }
            }

            // 磁吸半径 120 像素（放宽）
            if (nearestSlot >= 0 && nearestDist < 120) {
                const isFirstTower = placedCount === 0;
                if (isFirstTower) {
                    gameState.Currency.addGold(TOWER_COST);
                }
                const tower = towerController.placeTower(TowerType.ARROW, slotPositions[nearestSlot]);
                if (tower) {
                    placedCount++;
                    console.log(`箭塔放置到位置 ${nearestSlot + 1}${isFirstTower ? '（首塔免费）' : `，花费 ${TOWER_COST} 金币`}`);
                    slotNodes[nearestSlot].active = false;
                } else {
                    console.log('放置失败');
                }
                return;
            }

            console.log('未拖到建造点，取消放置');
        });

        // --- 开始波次按钮 ---
        const startBtn = this.createButton('StartWave', '开始波次', 0, -H / 2 + 40, () => {
            console.log('点击开始波次，开始倒计时');
            startBtn.active = false;
            gameState.setGameState(GameState.WAVE_RUNNING);

            let count = 3;
            cdLabel.string = `${count}`;
            cdLabel.node.active = true;

            this.schedule(() => {
                count--;
                if (count > 0) {
                    cdLabel.string = `${count}`;
                } else {
                    cdLabel.string = '';
                    cdLabel.node.active = false;
                    // 显示3个建造点
                    for (const slot of slotNodes) {
                        slot.active = true;
                    }
                    gameState.emit(GameEvents.START_NEXT_WAVE);
                    console.log('倒计时结束，敌人生成，可以拖拽放塔了');
                }
            }, 1, 3, 1);
        });
        startBtn.setParent(uiLayer);

        // === 5. 初始化游戏 ===
        gameState.initGame(1000, 20);  // 初始 1000 金币，够放3个塔

        console.log('SceneInitializer: MVP 场景就绪');
        console.log('操作：点击开始波次 → 倒计时 → 从左侧拖拽塔到建造点');
    }

    /** 创建可拖拽的塔按钮 */
    private createDraggableTowerButton(name: string, cost: number, x: number, y: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        transform.setContentSize(80, 80);
        node.setPosition(x, y, 0);

        const gfx = node.addComponent(Graphics);
        // 塔图标
        gfx.fillColor = new Color(60, 60, 70, 255);
        gfx.rect(-30, -30, 60, 60);
        gfx.fill();
        gfx.fillColor = new Color(50, 150, 255, 255);
        gfx.circle(0, 0, 16);
        gfx.fill();
        // 价格
        gfx.fillColor = new Color(255, 255, 0, 255);
        gfx.roundRect(-30, -40, 60, 16, 4);
        gfx.fill();

        const labelNode = new Node('Cost');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.addComponent(UITransform);
        labelNode.setParent(node);
        labelNode.setPosition(0, -32, 0);
        const label = labelNode.addComponent(Label);
        label.string = `${cost}`;
        label.fontSize = 12;
        label.lineHeight = 16;

        return node;
    }

    /** 绘制路径 */
    private drawPath(parent: Node, points: { x: number; y: number }[]): void {
        const gfx = parent.getComponent(Graphics) || parent.addComponent(Graphics);
        const transform = parent.getComponent(UITransform) || parent.addComponent(UITransform);
        transform.setContentSize(2000, 2000);
        transform.setAnchorPoint(0.5, 0.5);

        gfx.clear();
        gfx.lineWidth = 40;
        gfx.strokeColor = new Color(200, 180, 140, 180);
        if (points.length > 0) {
            gfx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                gfx.lineTo(points[i].x, points[i].y);
            }
            gfx.stroke();
        }

        // 起点绿圈
        gfx.fillColor = new Color(0, 255, 0, 200);
        gfx.circle(points[0].x, points[0].y, 20);
        gfx.fill();

        // 终点城堡
        const last = points[points.length - 1];
        gfx.fillColor = new Color(120, 80, 60, 255);
        gfx.rect(last.x - 20, last.y - 20, 40, 40);
        gfx.fill();
        gfx.rect(last.x - 20, last.y + 10, 10, 10);
        gfx.rect(last.x - 5, last.y + 10, 10, 10);
        gfx.rect(last.x + 10, last.y + 10, 10, 10);
        gfx.fill();
        gfx.fillColor = new Color(40, 40, 40, 255);
        gfx.rect(last.x - 6, last.y - 20, 12, 16);
        gfx.fill();
    }

    /** 创建建造点 */
    private createTowerSlot(pos: Vec3, index: number): Node {
        const node = new Node(`TowerSlot_${index}`);
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

    /** 创建 Label */
    private createLabel(name: string, text: string, x: number, y: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 20;
        node.setPosition(x, y, 0);
        return node;
    }

    /** 创建按钮 */
    private createButton(name: string, text: string, x: number, y: number, onClick: () => void): Node {
        const btn = new Node(name);
        btn.layer = Layers.Enum.UI_2D;
        const transform = btn.addComponent(UITransform);
        transform.setContentSize(120, 40);
        btn.setPosition(x, y, 0);
        const label = btn.addComponent(Label);
        label.string = text;
        label.fontSize = 18;
        btn.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            onClick();
        });
        return btn;
    }
}
