import { _decorator, Component, Node, Label, Sprite, ProgressBar, UIOpacity, tween, Vec3 } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { GameState } from '../core/Constants';

const { ccclass, property } = _decorator;

/**
 * HUD - 顶部信息栏
 *
 * 显示金币、生命、波次信息
 */
@ccclass('HUD')
export class HUD extends Component {
    @property({ type: Label, tooltip: '金币显示' })
    public goldLabel: Label | null = null;

    @property({ type: Label, tooltip: '生命显示' })
    public livesLabel: Label | null = null;

    @property({ type: Label, tooltip: '波次显示' })
    public waveLabel: Label | null = null;

    @property({ type: Node, tooltip: '金币不足提示' })
    public notEnoughGoldTip: Node | null = null;

    protected onLoad(): void {
        const gm = GameManager.Instance;
        if (!gm) return;

        gm.on(EventNames.GOLD_CHANGED, this.onGoldChanged, this);
        gm.on(EventNames.LIVES_CHANGED, this.onLivesChanged, this);
        gm.on(EventNames.WAVE_START, this.onWaveStart, this);
        gm.on(EventNames.NOT_ENOUGH_GOLD, this.onNotEnoughGold, this);
        gm.on(EventNames.GAME_STATE_CHANGED, this.onGameStateChanged, this);
    }

    protected onDestroy(): void {
        const gm = GameManager.Instance;
        if (!gm) return;
        gm.off(EventNames.GOLD_CHANGED, this.onGoldChanged, this);
        gm.off(EventNames.LIVES_CHANGED, this.onLivesChanged, this);
        gm.off(EventNames.WAVE_START, this.onWaveStart, this);
        gm.off(EventNames.NOT_ENOUGH_GOLD, this.onNotEnoughGold, this);
        gm.off(EventNames.GAME_STATE_CHANGED, this.onGameStateChanged, this);
    }

    protected start(): void {
        const gm = GameManager.Instance;
        if (!gm) return;
        this.updateGold(gm.Gold);
        this.updateLives(gm.Lives);
        this.updateWave(gm.CurrentWave, gm.TotalWaves);
    }

    private onGoldChanged(gold: number): void {
        this.updateGold(gold);
    }

    private onLivesChanged(lives: number): void {
        this.updateLives(lives);
    }

    private onWaveStart(wave: number): void {
        const gm = GameManager.Instance;
        this.updateWave(wave, gm?.TotalWaves ?? 0);
    }

    private onNotEnoughGold(): void {
        if (!this.notEnoughGoldTip) return;
        this.notEnoughGoldTip.active = true;
        const opacity = this.notEnoughGoldTip.getComponent(UIOpacity);
        if (opacity) {
            opacity.opacity = 255;
            tween(opacity)
                .delay(0.5)
                .to(0.3, { opacity: 0 })
                .call(() => {
                    this.notEnoughGoldTip!.active = false;
                })
                .start();
        } else {
            this.scheduleOnce(() => {
                this.notEnoughGoldTip!.active = false;
            }, 0.8);
        }
    }

    private onGameStateChanged(state: GameState): void {
        // 可扩展：根据状态切换 HUD 显示
    }

    private updateGold(gold: number): void {
        if (this.goldLabel) {
            this.goldLabel.string = `${gold}`;
        }
    }

    private updateLives(lives: number): void {
        if (this.livesLabel) {
            this.livesLabel.string = `${lives}`;
        }
    }

    private updateWave(current: number, total: number): void {
        if (this.waveLabel) {
            this.waveLabel.string = `${current} / ${total}`;
        }
    }
}
