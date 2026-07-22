import { _decorator, Component, Node, director, view, UITransform, Label, UIOpacity, Layers, Button } from 'cc';
import { GameManager } from '../core/GameManager';
import { LevelManager } from '../core/LevelManager';
import { WaveManager } from '../core/WaveManager';
import { PathManager } from '../core/PathManager';
import { GridManager } from '../core/GridManager';
import { InputManager } from '../core/InputManager';
import { EnemyManager } from '../enemies/EnemyManager';
import { TowerManager } from '../towers/TowerManager';
import { BulletManager } from '../bullets/BulletManager';
import { UIManager } from '../ui/UIManager';
import { HUD } from '../ui/HUD';
import { TowerMenu } from '../ui/TowerMenu';

const { ccclass, property } = _decorator;

/**
 * SceneInitializer - 场景自动初始化器
 *
 * 挂载到 Canvas 节点上，运行时自动创建所有管理器节点和组件，
 * 并绑定引用关系。这样无需在编辑器中手动搭建节点树。
 *
 * 使用方式：
 *  1. 创建空场景
 *  2. 添加 Canvas 节点
 *  3. 在 Canvas 上挂载此组件
 *  4. 运行场景
 */
@ccclass('SceneInitializer')
export class SceneInitializer extends Component {

    protected onLoad(): void {
        this.setupScene();
    }

    private setupScene(): void {
        const canvas = this.node;

        // === 1. 创建 GameManager 节点（持久化根节点） ===
        const gmNode = new Node('GameManager');
        gmNode.layer = Layers.Enum.UI_2D;
        const gameManager = gmNode.addComponent(GameManager);
        director.getScene()?.addChild(gmNode);

        // === 2. 创建 GameLayer（游戏逻辑层） ===
        const gameLayer = new Node('GameLayer');
        gameLayer.layer = Layers.Enum.UI_2D;
        gameLayer.setParent(canvas);
        const gameLayerTransform = gameLayer.addComponent(UITransform);

        // --- 2a. PathManager ---
        const pathNode = new Node('PathManager');
        pathNode.layer = Layers.Enum.UI_2D;
        pathNode.setParent(gameLayer);
        const pathManager = pathNode.addComponent(PathManager);

        // --- 2b. EnemyLayer + EnemyManager ---
        const enemyLayer = new Node('EnemyLayer');
        enemyLayer.layer = Layers.Enum.UI_2D;
        enemyLayer.setParent(gameLayer);
        const enemyLayerTransform = enemyLayer.addComponent(UITransform);
        const enemyManager = enemyLayer.addComponent(EnemyManager);
        enemyManager.enemyContainer = enemyLayer;

        // --- 2c. TowerLayer + TowerManager ---
        const towerLayer = new Node('TowerLayer');
        towerLayer.layer = Layers.Enum.UI_2D;
        towerLayer.setParent(gameLayer);
        const towerLayerTransform = towerLayer.addComponent(UITransform);
        const towerManager = towerLayer.addComponent(TowerManager);
        towerManager.towerContainer = towerLayer;

        // --- 2d. BulletLayer + BulletManager ---
        const bulletLayer = new Node('BulletLayer');
        bulletLayer.layer = Layers.Enum.UI_2D;
        bulletLayer.setParent(gameLayer);
        const bulletLayerTransform = bulletLayer.addComponent(UITransform);
        const bulletManager = bulletLayer.addComponent(BulletManager);
        bulletManager.bulletContainer = bulletLayer;

        // --- 2e. GridManager ---
        const gridNode = new Node('GridManager');
        gridNode.layer = Layers.Enum.UI_2D;
        gridNode.setParent(gameLayer);
        const gridManager = gridNode.addComponent(GridManager);

        // --- 2f. InputManager ---
        const inputNode = new Node('InputManager');
        inputNode.layer = Layers.Enum.UI_2D;
        inputNode.setParent(gameLayer);
        const inputTransform = inputNode.addComponent(UITransform);
        // InputManager 需要一个大的触摸区域
        const screenSize = view.getVisibleSize();
        inputTransform.setContentSize(screenSize.width, screenSize.height);
        const inputManager = inputNode.addComponent(InputManager);

        // --- 2g. LevelManager ---
        const levelNode = new Node('LevelManager');
        levelNode.layer = Layers.Enum.UI_2D;
        levelNode.setParent(gameLayer);
        const levelManager = levelNode.addComponent(LevelManager);

        // --- 2h. WaveManager ---
        const waveNode = new Node('WaveManager');
        waveNode.layer = Layers.Enum.UI_2D;
        waveNode.setParent(gameLayer);
        const waveManager = waveNode.addComponent(WaveManager);

        // === 3. 创建 UILayer（UI 层） ===
        const uiLayer = new Node('UILayer');
        uiLayer.layer = Layers.Enum.UI_2D;
        uiLayer.setParent(canvas);
        const uiLayerTransform = uiLayer.addComponent(UITransform);
        const uiOpacity = uiLayer.addComponent(UIOpacity);

        // --- 3a. UIManager ---
        const uiManagerNode = new Node('UIManager');
        uiManagerNode.layer = Layers.Enum.UI_2D;
        uiManagerNode.setParent(uiLayer);
        const uiManager = uiManagerNode.addComponent(UIManager);

        // --- 3b. HUD ---
        const hudNode = new Node('HUD');
        hudNode.layer = Layers.Enum.UI_2D;
        hudNode.setParent(uiLayer);
        const hudTransform = hudNode.addComponent(UITransform);
        hudTransform.setContentSize(screenSize.width, 60);
        hudTransform.setAnchorPoint(0.5, 1);
        hudNode.setPosition(0, screenSize.height / 2, 0);
        const hud = hudNode.addComponent(HUD);

        // 创建金币标签
        const goldLabelNode = this.createLabelNode('GoldLabel', '200', -screenSize.width / 2 + 60, 0);
        goldLabelNode.setParent(hudNode);
        hud.goldLabel = goldLabelNode.getComponent(Label);

        // 创建生命标签
        const livesLabelNode = this.createLabelNode('LivesLabel', '20', -screenSize.width / 2 + 200, 0);
        livesLabelNode.setParent(hudNode);
        hud.livesLabel = livesLabelNode.getComponent(Label);

        // 创建波次标签
        const waveLabelNode = this.createLabelNode('WaveLabel', '0 / 0', screenSize.width / 2 - 100, 0);
        waveLabelNode.setParent(hudNode);
        hud.waveLabel = waveLabelNode.getComponent(Label);

        // 金币不足提示
        const notEnoughGoldNode = this.createLabelNode('NotEnoughGoldTip', '金币不足!', 0, -40);
        notEnoughGoldNode.setParent(hudNode);
        const notEnoughGoldOpacity = notEnoughGoldNode.addComponent(UIOpacity);
        notEnoughGoldOpacity.opacity = 0;
        notEnoughGoldNode.active = false;
        hud.notEnoughGoldTip = notEnoughGoldNode;

        // --- 3c. TowerMenu ---
        const towerMenuNode = new Node('TowerMenu');
        towerMenuNode.layer = Layers.Enum.UI_2D;
        towerMenuNode.setParent(uiLayer);
        const towerMenuTransform = towerMenuNode.addComponent(UITransform);
        const towerMenu = towerMenuNode.addComponent(TowerMenu);

        // --- 3d. 开始波次按钮 ---
        const startWaveBtnNode = new Node('StartWaveButton');
        startWaveBtnNode.layer = Layers.Enum.UI_2D;
        startWaveBtnNode.setParent(uiLayer);
        const btnTransform = startWaveBtnNode.addComponent(UITransform);
        btnTransform.setContentSize(120, 40);
        startWaveBtnNode.setPosition(0, -screenSize.height / 2 + 40, 0);
        const startWaveBtnLabel = this.createLabelNode('Label', '开始波次', 0, 0);
        startWaveBtnLabel.setParent(startWaveBtnNode);
        const startWaveBtn = startWaveBtnNode.addComponent(Button);
        startWaveBtnNode.active = false;
        uiManager.startWaveButton = startWaveBtnNode;

        // === 4. 创建面板节点 ===

        // 主菜单面板
        const mainMenuPanel = new Node('MainMenuPanel');
        mainMenuPanel.layer = Layers.Enum.UI_2D;
        mainMenuPanel.setParent(uiLayer);
        const mainMenuTransform = mainMenuPanel.addComponent(UITransform);
        mainMenuTransform.setContentSize(screenSize.width, screenSize.height);
        const mainMenuLabel = this.createLabelNode('Label', '塔防游戏\n\n点击开始', 0, 0);
        mainMenuLabel.setParent(mainMenuPanel);
        uiManager.mainMenuPanel = mainMenuPanel;

        // 游戏结束面板
        const gameOverPanel = new Node('GameOverPanel');
        gameOverPanel.layer = Layers.Enum.UI_2D;
        gameOverPanel.setParent(uiLayer);
        const gameOverTransform = gameOverPanel.addComponent(UITransform);
        gameOverTransform.setContentSize(screenSize.width, screenSize.height);
        const gameOverLabel = this.createLabelNode('Label', '游戏结束\n\n点击重新开始', 0, 0);
        gameOverLabel.setParent(gameOverPanel);
        gameOverPanel.active = false;
        uiManager.gameOverPanel = gameOverPanel;

        // 胜利面板
        const victoryPanel = new Node('VictoryPanel');
        victoryPanel.layer = Layers.Enum.UI_2D;
        victoryPanel.setParent(uiLayer);
        const victoryTransform = victoryPanel.addComponent(UITransform);
        victoryTransform.setContentSize(screenSize.width, screenSize.height);
        const victoryLabel = this.createLabelNode('Label', '胜利!\n\n点击重新开始', 0, 0);
        victoryLabel.setParent(victoryPanel);
        victoryPanel.active = false;
        uiManager.victoryPanel = victoryPanel;

        // === 5. 绑定交叉引用 ===

        // WaveManager 引用
        waveManager.pathManager = pathManager;
        waveManager.enemyManager = enemyManager;

        // TowerManager 引用
        towerManager.enemyManager = enemyManager;
        towerManager.bulletManager = bulletManager;

        // InputManager 引用
        inputManager.gridManager = gridManager;
        inputManager.towerManager = towerManager;
        inputManager.towerMenu = towerMenu;

        // TowerMenu 引用
        towerMenu.towerManager = towerManager;

        // LevelManager 引用
        levelManager.pathManager = pathManager;
        levelManager.waveManager = waveManager;
        levelManager.gridManager = gridManager;
        levelManager.enemyManager = enemyManager;
        levelManager.towerManager = towerManager;

        // HUD 引用已在上面设置

        // UIManager 的 hudNode
        uiManager.hudNode = hudNode;

        // 设置 InputManager 的触摸节点为整个 gameLayer
        // InputManager 已挂载在 inputNode 上

        console.log('SceneInitializer: 场景初始化完成');
    }

    /**
     * 创建带 Label 组件的节点
     */
    private createLabelNode(name: string, text: string, x: number, y: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        const transform = node.addComponent(UITransform);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 24;
        label.lineHeight = 30;
        node.setPosition(x, y, 0);
        return node;
    }
}
