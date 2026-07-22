import { _decorator, Component, Node, Label, Button, Layers, UITransform, view, EventTouch } from 'cc';
import { GameStateManager } from '../systems/GameStateManager';
import { GameState } from '../core/Constants';
import { GameEvents } from '../core/EventNames';
import { HUD } from './HUD';

const { ccclass, property } = _decorator;

/**
 * UIManager - UI 总管理器
 *
 * 管理各 UI 面板的显示/隐藏，响应游戏状态变化
 * 使用原生 TOUCH_END 事件代替 Button 组件，确保动态创建的节点也能响应点击
 */
@ccclass('UIManager')
export class UIManager extends Component {
    @property({ type: GameStateManager })
    public gameStateManager: GameStateManager | null = null;

    private _mainMenuPanel: Node | null = null;
    private _hudNode: Node | null = null;
    private _gameOverPanel: Node | null = null;
    private _victoryPanel: Node | null = null;
    private _startWaveButton: Node | null = null;
    private _statusLabel: Label | null = null;

    public init(gsm: GameStateManager): void {
        this.gameStateManager = gsm;
        gsm.on(GameEvents.GAME_STATE_CHANGED, this.onGameStateChanged, this);
        this.createPanels();
    }

    private createPanels(): void {
        // 使用设计分辨率（960x640）
        const DESIGN_WIDTH = 960;
        const DESIGN_HEIGHT = 640;

        // 主菜单
        this._mainMenuPanel = this.createPanel('MainMenu', '塔防游戏\n\n点击开始', () => {
            console.log('UIManager: 点击开始游戏');
            const gsm = this.gameStateManager;
            if (gsm) {
                // 直接隐藏主菜单，显示 HUD
                if (this._mainMenuPanel) this._mainMenuPanel.active = false;
                if (this._hudNode) this._hudNode.active = true;
                if (this._startWaveButton) this._startWaveButton.active = true;
                if (this._statusLabel) this._statusLabel.string = '准备阶段 - 点击下方按钮开始波次';

                // 切换状态
                gsm.setGameState(GameState.PREPARING);
                console.log(`UIManager: 切换到 PREPARING, 金币 ${gsm.Currency.Gold}, 生命 ${gsm.Lives}`);
            } else {
                console.error('UIManager: gameStateManager 为空!');
            }
        });

        // HUD
        this._hudNode = new Node('HUD');
        this._hudNode.layer = Layers.Enum.UI_2D;
        this._hudNode.setParent(this.node);
        const hudTransform = this._hudNode.addComponent(UITransform);
        hudTransform.setContentSize(DESIGN_WIDTH, 40);
        hudTransform.setAnchorPoint(0.5, 1);
        this._hudNode.setPosition(0, DESIGN_HEIGHT / 2, 0);

        const goldLabel = this.createLabel('GoldLabel', 'Gold: 0', -DESIGN_WIDTH / 2 + 80, 0);
        goldLabel.setParent(this._hudNode);
        const livesLabel = this.createLabel('LivesLabel', 'Lives: 0', -DESIGN_WIDTH / 2 + 240, 0);
        livesLabel.setParent(this._hudNode);
        const waveLabel = this.createLabel('WaveLabel', 'Wave: 0 / 0', DESIGN_WIDTH / 2 - 120, 0);
        waveLabel.setParent(this._hudNode);

        this._statusLabel = this.createLabel('StatusLabel', '', 0, -20);
        this._statusLabel.setParent(this._hudNode);
        this._hudNode.active = false;

        // HUD 组件
        const hud = this._hudNode.addComponent(HUD);
        hud.goldLabel = goldLabel.getComponent(Label);
        hud.livesLabel = livesLabel.getComponent(Label);
        hud.waveLabel = waveLabel.getComponent(Label);
        hud.init(this.gameStateManager!);

        // 开始波次按钮
        this._startWaveButton = this.createButton('StartWaveBtn', '开始波次', 0, -DESIGN_HEIGHT / 2 + 40, () => {
            console.log('UIManager: 点击开始波次');
            this.gameStateManager?.setGameState(GameState.WAVE_RUNNING);
            this.gameStateManager?.emit(GameEvents.START_NEXT_WAVE);
        });
        this._startWaveButton.setParent(this.node);
        this._startWaveButton.active = false;

        // 游戏结束面板
        this._gameOverPanel = this.createPanel('GameOver', '游戏结束\n\n点击重新开始', () => {
            console.log('UIManager: 点击重新开始');
            this.gameStateManager?.setGameState(GameState.PREPARING);
        });
        this._gameOverPanel.active = false;

        // 胜利面板
        this._victoryPanel = this.createPanel('Victory', '胜利!\n\n点击重新开始', () => {
            console.log('UIManager: 点击重新开始(胜利)');
            this.gameStateManager?.setGameState(GameState.PREPARING);
        });
        this._victoryPanel.active = false;
    }

    /**
     * 创建面板（用 TOUCH_END 代替 Button，确保动态节点可点击）
     */
    private createPanel(name: string, text: string, onClick: () => void): Node {
        const panel = new Node(name);
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(this.node);
        const transform = panel.addComponent(UITransform);
        const screenSize = { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
        transform.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);

        const label = this.createLabel('Label', text, 0, 0);
        label.setParent(panel);
        label.getComponent(Label)!.fontSize = 32;

        // 用 TOUCH_END 代替 Button，不阻止冒泡
        panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            onClick();
        }, this);

        return panel;
    }

    private createLabel(name: string, text: string, x: number, y: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.addComponent(UITransform);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 20;
        label.lineHeight = 24;
        node.setPosition(x, y, 0);
        return node;
    }

    /**
     * 创建按钮（用 TOUCH_END 代替 Button）
     */
    private createButton(name: string, text: string, x: number, y: number, onClick: () => void): Node {
        const btn = new Node(name);
        btn.layer = Layers.Enum.UI_2D;
        const transform = btn.addComponent(UITransform);
        transform.setContentSize(120, 40);
        btn.setPosition(x, y, 0);
        const label = btn.addComponent(Label);
        label.string = text;
        label.fontSize = 18;

        // 用 TOUCH_END 代替 Button，不阻止冒泡
        btn.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            onClick();
        }, this);

        return btn;
    }

    private onGameStateChanged(state: GameState): void {
        console.log(`UIManager: 状态切换到 ${state}`);
        switch (state) {
            case GameState.MENU:
                this.showOnly(this._mainMenuPanel);
                break;
            case GameState.PREPARING:
                this.showOnly(this._hudNode);
                if (this._startWaveButton) this._startWaveButton.active = true;
                if (this._statusLabel) this._statusLabel.string = '准备阶段 - 点击下方按钮开始波次';
                break;
            case GameState.WAVE_RUNNING:
                if (this._startWaveButton) this._startWaveButton.active = false;
                if (this._statusLabel) this._statusLabel.string = '波次进行中...';
                break;
            case GameState.WAVE_CLEARED:
                if (this._startWaveButton) this._startWaveButton.active = true;
                if (this._statusLabel) this._statusLabel.string = '波次完成 - 点击按钮开始下一波';
                break;
            case GameState.GAME_OVER:
                this.showOnly(this._gameOverPanel);
                break;
            case GameState.VICTORY:
                this.showOnly(this._victoryPanel);
                break;
        }
    }

    private showOnly(node: Node | null): void {
        const panels = [this._mainMenuPanel, this._hudNode, this._gameOverPanel, this._victoryPanel];
        for (const p of panels) {
            if (p) p.active = (p === node);
        }
    }
}
