import { _decorator, Component, Node, Label, Button, Layers, UITransform, view } from 'cc';
import { GameStateManager } from '../systems/GameStateManager';
import { GameState } from '../core/Constants';
import { GameEvents } from '../core/EventNames';
import { HUD } from './HUD';

const { ccclass, property } = _decorator;

/**
 * UIManager - UI 总管理器
 *
 * 管理各 UI 面板的显示/隐藏，响应游戏状态变化
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
        const screenSize = view.getVisibleSize();

        // 主菜单
        this._mainMenuPanel = this.createPanel('MainMenu', '塔防游戏\n\n点击开始', () => {
            this.gameStateManager?.setGameState(GameState.PREPARING);
        });

        // HUD
        this._hudNode = new Node('HUD');
        this._hudNode.layer = Layers.Enum.UI_2D;
        this._hudNode.setParent(this.node);
        const hudTransform = this._hudNode.addComponent(UITransform);
        hudTransform.setContentSize(screenSize.width, 40);
        hudTransform.setAnchorPoint(0.5, 1);
        this._hudNode.setPosition(0, screenSize.height / 2, 0);

        const goldLabel = this.createLabel('GoldLabel', 'Gold: 0', -screenSize.width / 2 + 80, 0);
        goldLabel.setParent(this._hudNode);
        const livesLabel = this.createLabel('LivesLabel', 'Lives: 0', -screenSize.width / 2 + 240, 0);
        livesLabel.setParent(this._hudNode);
        const waveLabel = this.createLabel('WaveLabel', 'Wave: 0 / 0', screenSize.width / 2 - 120, 0);
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
        this._startWaveButton = this.createButton('StartWaveBtn', '开始波次', 0, -screenSize.height / 2 + 40, () => {
            this.gameStateManager?.emit(GameEvents.START_NEXT_WAVE);
        });
        this._startWaveButton.setParent(this.node);
        this._startWaveButton.active = false;

        // 游戏结束面板
        this._gameOverPanel = this.createPanel('GameOver', '游戏结束\n\n点击重新开始', () => {
            this.gameStateManager?.setGameState(GameState.PREPARING);
        });
        this._gameOverPanel.active = false;

        // 胜利面板
        this._victoryPanel = this.createPanel('Victory', '胜利!\n\n点击重新开始', () => {
            this.gameStateManager?.setGameState(GameState.PREPARING);
        });
        this._victoryPanel.active = false;
    }

    private createPanel(name: string, text: string, onClick: () => void): Node {
        const panel = new Node(name);
        panel.layer = Layers.Enum.UI_2D;
        panel.setParent(this.node);
        const transform = panel.addComponent(UITransform);
        const screenSize = view.getVisibleSize();
        transform.setContentSize(screenSize.width, screenSize.height);

        const label = this.createLabel('Label', text, 0, 0);
        label.setParent(panel);
        label.getComponent(Label)!.fontSize = 32;

        const btn = panel.addComponent(Button);
        btn.node.on(Button.EventType.CLICK, onClick, this);
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

    private createButton(name: string, text: string, x: number, y: number, onClick: () => void): Node {
        const btn = new Node(name);
        btn.layer = Layers.Enum.UI_2D;
        btn.addComponent(UITransform);
        btn.setPosition(x, y, 0);
        const label = btn.addComponent(Label);
        label.string = text;
        label.fontSize = 18;
        const button = btn.addComponent(Button);
        button.node.on(Button.EventType.CLICK, onClick, this);
        return btn;
    }

    private onGameStateChanged(state: GameState): void {
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
