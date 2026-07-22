import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch } from 'cc';
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

/**
 * MVP 版 SceneInitializer
 *
 * 用户流程：
 * 1. 看到 HUD + 路径 + 开始波次按钮
 * 2. 点击开始波次 → 倒计时 3 秒
 * 3. 倒计时结束 → 建造点出现 → 敌人开始生成
 * 4. 点击建造点 → 放箭塔
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
        gameLayer.addComponent(UITransform);

        // --- 3a. 路径（直线，y=0）---
        const pathPoints = [{ x: -400, y: 0 }, { x: 400, y: 0 }];
        const pathNode = new Node('PathManager');
        pathNode.layer = Layers.Enum.UI_2D;
        pathNode.setParent(gameLayer);
        const pathManager = pathNode.addComponent(PathManager);
        pathManager.setWaypoints(pathPoints);
        this.drawPath(pathNode, pathPoints);

        // --- 3b. 建造点（路径旁边，塔能攻击到路径上的敌人）---
        const slotPos = new Vec3(0, -64, 0);  // 路径下方 64 像素
        const slotNode = this.createTowerSlot(slotPos);
        slotNode.setParent(gameLayer);
        slotNode.active = false;  // 初始隐藏，倒计时后显示

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

        // --- 开始波次按钮 ---
        const startBtn = this.createButton('StartWave', '开始波次', 0, -H / 2 + 40, () => {
            console.log('点击开始波次，开始倒计时');
            startBtn.active = false;
            gameState.setGameState(GameState.WAVE_RUNNING);

            // 倒计时 3 秒
            let count = 3;
            cdLabel.string = `${count}`;
            cdLabel.node.active = true;

            this.schedule(() => {
                count--;
                if (count > 0) {
                    cdLabel.string = `${count}`;
                } else {
                    // 倒计时结束
                    cdLabel.string = '';
                    cdLabel.node.active = false;
                    slotNode.active = true;  // 显示建造点
                    gameState.emit(GameEvents.START_NEXT_WAVE);  // 开始生成敌人
                    console.log('倒计时结束，敌人生成，可以放塔了');
                }
            }, 1, 3, 1);  // 间隔 1 秒，重复 3 次，延迟 1 秒
        });
        startBtn.setParent(uiLayer);

        // --- 建造点点击 ---
        slotNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            console.log('点击建造点');
            const tower = towerController.placeTower(TowerType.ARROW, slotPos);
            if (tower) {
                console.log('箭塔放置成功，花费 50 金币');
                slotNode.active = false;
            } else {
                console.log('金币不足或放置失败');
            }
        });

        // === 5. 初始化游戏 ===
        gameState.initGame(200, 20);

        console.log('SceneInitializer: MVP 场景就绪');
        console.log('操作：点击开始波次 → 倒计时 3 秒 → 建造点出现 + 敌人生成 → 点击建造点放塔');
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

        // 终点城堡 🏰
        const last = points[points.length - 1];
        gfx.fillColor = new Color(120, 80, 60, 255);
        gfx.rect(last.x - 20, last.y - 20, 40, 40);
        gfx.fill();
        // 城垛
        gfx.rect(last.x - 20, last.y + 10, 10, 10);
        gfx.rect(last.x - 5, last.y + 10, 10, 10);
        gfx.rect(last.x + 10, last.y + 10, 10, 10);
        gfx.fill();
        // 城门
        gfx.fillColor = new Color(40, 40, 40, 255);
        gfx.rect(last.x - 6, last.y - 20, 12, 16);
        gfx.fill();
    }

    /** 创建建造点 */
    private createTowerSlot(pos: Vec3): Node {
        const node = new Node('TowerSlot');
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
