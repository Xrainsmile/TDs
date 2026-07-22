import { _decorator, Component, Node } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { GameState } from '../core/Constants';

const { ccclass, property } = _decorator;

/**
 * UIManager - UI 总管理器
 *
 * 职责：
 *  - 管理各 UI 面板的显示/隐藏
 *  - 响应游戏状态变化切换界面
 */
@ccclass('UIManager')
export class UIManager extends Component {
    @property({ type: Node, tooltip: '主菜单面板' })
    public mainMenuPanel: Node | null = null;

    @property({ type: Node, tooltip: '游戏内 HUD' })
    public hudNode: Node | null = null;

    @property({ type: Node, tooltip: '游戏结束面板' })
    public gameOverPanel: Node | null = null;

    @property({ type: Node, tooltip: '胜利面板' })
    public victoryPanel: Node | null = null;

    @property({ type: Node, tooltip: '开始波次按钮' })
    public startWaveButton: Node | null = null;

    protected onLoad(): void {
        const gm = GameManager.Instance;
        if (!gm) return;

        gm.on(EventNames.GAME_STATE_CHANGED, this.onGameStateChanged, this);
    }

    protected onDestroy(): void {
        const gm = GameManager.Instance;
        if (!gm) return;
        gm.off(EventNames.GAME_STATE_CHANGED, this.onGameStateChanged, this);
    }

    protected start(): void {
        this.showOnly(this.mainMenuPanel);
    }

    private onGameStateChanged(state: GameState): void {
        switch (state) {
            case GameState.MENU:
                this.showOnly(this.mainMenuPanel);
                break;
            case GameState.PREPARING:
                this.showOnly(this.hudNode);
                if (this.startWaveButton) {
                    this.startWaveButton.active = true;
                }
                break;
            case GameState.WAVE_RUNNING:
                if (this.startWaveButton) {
                    this.startWaveButton.active = false;
                }
                break;
            case GameState.WAVE_CLEARED:
                if (this.startWaveButton) {
                    this.startWaveButton.active = true;
                }
                break;
            case GameState.GAME_OVER:
                this.showOnly(this.gameOverPanel);
                break;
            case GameState.VICTORY:
                this.showOnly(this.victoryPanel);
                break;
        }
    }

    /**
     * 开始游戏（主菜单按钮回调）
     */
    public onStartGame(): void {
        GameManager.Instance?.initGame();
        GameManager.Instance?.setGameState(GameState.PREPARING);
    }

    /**
     * 开始下一波（波次按钮回调）
     */
    public onStartNextWave(): void {
        // WaveManager 监听此事件来开始下一波
        GameManager.Instance?.emit('start-next-wave');
        GameManager.Instance?.setGameState(GameState.WAVE_RUNNING);
    }

    /**
     * 重新开始（游戏结束/胜利面板按钮回调）
     */
    public onRestart(): void {
        GameManager.Instance?.initGame();
        GameManager.Instance?.setGameState(GameState.PREPARING);
    }

    /**
     * 返回主菜单
     */
    public onBackToMenu(): void {
        GameManager.Instance?.setGameState(GameState.MENU);
    }

    private showOnly(node: Node | null): void {
        const panels = [this.mainMenuPanel, this.hudNode, this.gameOverPanel, this.victoryPanel];
        for (const panel of panels) {
            if (panel) {
                panel.active = (panel === node);
            }
        }
    }
}
