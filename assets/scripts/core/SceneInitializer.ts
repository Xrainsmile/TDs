import { _decorator, Component, Node, director, Vec3, view, UITransform, Layers, JsonAsset, resources } from 'cc';
import { GameStateManager } from '../systems/GameStateManager';
import { CurrencySystem } from '../systems/CurrencySystem';
import { DamageSystem } from '../systems/DamageSystem';
import { WaveManager } from '../systems/WaveManager';
import { PathManager } from '../systems/PathManager';
import { GridManager } from '../systems/GridManager';
import { InputManager } from '../systems/InputManager';
import { EnemyController } from '../systems/EnemyController';
import { TowerController } from '../systems/TowerController';
import { ProjectileController } from '../systems/ProjectileController';
import { LevelManager } from '../level/LevelManager';
import { UIManager } from '../ui/UIManager';
import { HUD } from '../ui/HUD';
import { TowerMenu } from '../ui/TowerMenu';

const { ccclass, property } = _decorator;

/**
 * SceneInitializer - 场景自动初始化器
 *
 * 挂载到 Canvas 节点上，运行时自动创建所有系统节点和组件，
 * 并绑定引用关系。无需在编辑器中手动搭建节点树。
 *
 * 使用方式：
 *  1. 创建空 2D 场景
 *  2. 在 Canvas 上挂载此组件
 *  3. 运行场景
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {
    @property({ type: JsonAsset, tooltip: '关卡配置 JSON（可选，留空则加载 level_01）' })
    public levelConfigAsset: JsonAsset | null = null;

    @property
    public levelName: string = 'level_01';

    protected start(): void {
        this.setupScene();
    }

    private async setupScene(): Promise<void> {
        const canvas = this.node;
        const screenSize = view.getVisibleSize();

        // === 1. GameManager 根节点（持久化）===
        const gmNode = new Node('GameManager');
        gmNode.layer = Layers.Enum.UI_2D;
        director.getScene()?.addChild(gmNode);

        const gameStateManager = gmNode.addComponent(GameStateManager);
        const currencySystem = gmNode.addComponent(CurrencySystem);
        const damageSystem = gmNode.addComponent(DamageSystem);

        // === 2. GameLayer（游戏逻辑层）===
        const gameLayer = new Node('GameLayer');
        gameLayer.layer = Layers.Enum.UI_2D;
        gameLayer.setParent(canvas);
        gameLayer.addComponent(UITransform);

        // --- 2a. VisualLayer（路径/格子可视化）---
        const visualLayer = new Node('VisualLayer');
        visualLayer.layer = Layers.Enum.UI_2D;
        visualLayer.setParent(gameLayer);
        visualLayer.addComponent(UITransform);

        // --- 2b. PathManager ---
        const pathNode = new Node('PathManager');
        pathNode.layer = Layers.Enum.UI_2D;
        pathNode.setParent(gameLayer);
        const pathManager = pathNode.addComponent(PathManager);

        // --- 2c. EnemyLayer + EnemyController ---
        const enemyLayer = new Node('EnemyLayer');
        enemyLayer.layer = Layers.Enum.UI_2D;
        enemyLayer.setParent(gameLayer);
        enemyLayer.addComponent(UITransform);
        const enemyController = enemyLayer.addComponent(EnemyController);
        enemyController.enemyContainer = enemyLayer;
        enemyController.setGameStateManager(gameStateManager);
        // 使用运行时模板（无美术资源）
        enemyController.initWithTemplates();

        // --- 2d. TowerLayer + TowerController ---
        const towerLayer = new Node('TowerLayer');
        towerLayer.layer = Layers.Enum.UI_2D;
        towerLayer.setParent(gameLayer);
        towerLayer.addComponent(UITransform);
        const towerController = towerLayer.addComponent(TowerController);
        towerController.towerContainer = towerLayer;
        towerController.enemyController = enemyController;
        towerController.setGameStateManager(gameStateManager);
        towerController.enableTemplates();

        // --- 2e. ProjectileLayer + ProjectileController ---
        const projectileLayer = new Node('ProjectileLayer');
        projectileLayer.layer = Layers.Enum.UI_2D;
        projectileLayer.setParent(gameLayer);
        projectileLayer.addComponent(UITransform);
        const projectileController = projectileLayer.addComponent(ProjectileController);
        projectileController.projectileContainer = projectileLayer;
        projectileController.damageSystem = damageSystem;
        projectileController.enemyController = enemyController;
        projectileController.initWithTemplates();

        // 连接 TowerController → ProjectileController
        towerController.projectileController = projectileController;

        // --- 2f. GridManager ---
        const gridNode = new Node('GridManager');
        gridNode.layer = Layers.Enum.UI_2D;
        gridNode.setParent(gameLayer);
        const gridManager = gridNode.addComponent(GridManager);

        // --- 2g. InputManager ---
        // 注意：InputManager 挂在 Canvas 上（而非 GameLayer），确保在 UILayer 之上能收到触摸事件
        const inputManager = this.node.addComponent(InputManager);
        inputManager.gridManager = gridManager;
        inputManager.towerController = towerController;
        inputManager.init(gameStateManager);

        // --- 2h. WaveManager ---
        const waveNode = new Node('WaveManager');
        waveNode.layer = Layers.Enum.UI_2D;
        waveNode.setParent(gameLayer);
        const waveManager = waveNode.addComponent(WaveManager);
        waveManager.pathManager = pathManager;
        waveManager.enemyController = enemyController;
        waveManager.setGameStateManager(gameStateManager);
        enemyController.setWaveManager(waveManager);

        // --- 2i. LevelManager ---
        const levelNode = new Node('LevelManager');
        levelNode.layer = Layers.Enum.UI_2D;
        levelNode.setParent(gameLayer);
        const levelManager = levelNode.addComponent(LevelManager);
        levelManager.pathManager = pathManager;
        levelManager.waveManager = waveManager;
        levelManager.gridManager = gridManager;
        levelManager.enemyController = enemyController;
        levelManager.towerController = towerController;
        levelManager.gameStateManager = gameStateManager;
        levelManager.visualContainer = visualLayer;
        levelManager.levelConfigAsset = this.levelConfigAsset;

        // === 3. UILayer ===
        const uiLayer = new Node('UILayer');
        uiLayer.layer = Layers.Enum.UI_2D;
        uiLayer.setParent(canvas);
        const uiLayerTransform = uiLayer.addComponent(UITransform);
        uiLayerTransform.setContentSize(screenSize.width, screenSize.height);
        // UILayer 在 GameLayer 之后创建，天然在上层，触摸优先

        // --- 3a. UIManager ---
        const uiManagerNode = new Node('UIManager');
        uiManagerNode.layer = Layers.Enum.UI_2D;
        uiManagerNode.setParent(uiLayer);
        uiManagerNode.addComponent(UITransform);
        const uiManager = uiManagerNode.addComponent(UIManager);
        uiManager.init(gameStateManager);

        // --- 3b. TowerMenu ---
        const towerMenuNode = new Node('TowerMenu');
        towerMenuNode.layer = Layers.Enum.UI_2D;
        towerMenuNode.setParent(uiLayer);
        towerMenuNode.addComponent(UITransform);
        const towerMenu = towerMenuNode.addComponent(TowerMenu);
        towerMenu.towerController = towerController;
        towerMenu.init();

        // 连接 InputManager → TowerMenu
        inputManager.towerMenu = towerMenu;

        // === 4. 加载关卡配置 ===
        if (this.levelConfigAsset) {
            levelManager.levelConfigAsset = this.levelConfigAsset;
            levelManager.loadLevel();
        } else {
            // 从 resources 加载
            const levelPath = `data/levels/${this.levelName}`;
            console.log(`SceneInitializer: 从 resources 加载 ${levelPath}`);
            resources.load(levelPath, JsonAsset, (err, asset) => {
                if (err) {
                    console.error(`SceneInitializer: 加载关卡失败 - ${err}`);
                    return;
                }
                levelManager.levelConfigAsset = asset;
                levelManager.loadLevel();
            });
        }

        console.log('SceneInitializer: 场景初始化完成');
    }
}
