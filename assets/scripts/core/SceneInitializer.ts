import { _decorator, Component, Node, view, UITransform, Layers, Vec3, Graphics, Color, Label, EventTouch, Button } from 'cc';
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
 * 场景结构：
 * Canvas
 * ├── GameLayer
 * │   ├── Path (路径可视化)
 * │   ├── TowerSlot (建造点)
 * │   ├── EnemyLayer
 * │   └── TowerLayer
 * └── UILayer
 *     ├── HUD (金币/生命/波次)
 *     └── StartWaveButton
 *
 * 交互闭环：
 * 1. 点击建造点 → 放置箭塔
 * 2. 点击开始波次 → 敌人沿路径走
 * 3. 塔自动攻击 → 子弹飞向敌人 → 伤害结算
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {
    @property
    public levelName: string = 'level_01';

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

        // --- 3a. 路径 ---
        const pathNode = new Node('PathManager');
        pathNode.layer = Layers.Enum.UI_2D;
        pathNode.setParent(gameLayer);
        const pathManager = pathNode.addComponent(PathManager);
        // MVP 简单直线路径
        pathManager.setWaypoints([
            { x: -400, y: 0 },
            { x: 400, y: 0 },
        ]);
        this.drawPath(pathNode, [{ x: -400, y: 0 }, { x: 400, y: 0 }]);

        // --- 3b. 建造点（固定一个）---
        const slotPos = new Vec3(0, -100, 0);
        const slotNode = this.createTowerSlot(slotPos);
        slotNode.setParent(gameLayer);

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
        // MVP 波次配置
        waveManager.loadWaves([
            { waveIndex: 0, enemies: [{ enemyType: 1, count: 5, interval: 1.0, delay: 0 }] },
            { waveIndex: 1, enemies: [{ enemyType: 1, count: 8, interval: 0.8, delay: 1 }] },
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

        // 监听金币/生命/波次变化
        gameState.on(GameEvents.GOLD_CHANGED, (gold: number) => {
            goldLabel.getComponent(Label)!.string = `Gold: ${gold}`;
        });
        gameState.on(GameEvents.LIVES_CHANGED, (lives: number) => {
            livesLabel.getComponent(Label)!.string = `Lives: ${lives}`;
        });
        gameState.on(GameEvents.WAVE_START, (wave: number) => {
            waveLabel.getComponent(Label)!.string = `Wave: ${wave}/3`;
        });

        // --- 开始波次按钮 ---
        const startBtn = this.createButton('StartWave', '开始波次', 0, -H / 2 + 40, () => {
            console.log('点击开始波次');
            gameState.setGameState(GameState.WAVE_RUNNING);
            gameState.emit(GameEvents.START_NEXT_WAVE);
            startBtn.active = false;
        });
        startBtn.setParent(uiLayer);

        // --- 建造点点击 ---
        slotNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            console.log('点击建造点');
            const tower = towerController.placeTower(TowerType.ARROW, slotPos);
            if (tower) {
                console.log('箭塔放置成功，花费 50 金币');
                slotNode.active = false;  // 建造后隐藏建造点
            } else {
                console.log('金币不足或放置失败');
            }
        });

        // === 5. 初始化游戏 ===
        gameState.initGame(200, 20);

        console.log('SceneInitializer: MVP 场景就绪');
        console.log('操作：点击建造点放塔 → 点击开始波次');
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

        // 终点红圈（核心）
        const last = points[points.length - 1];
        gfx.fillColor = new Color(255, 0, 0, 200);
        gfx.circle(last.x, last.y, 20);
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
