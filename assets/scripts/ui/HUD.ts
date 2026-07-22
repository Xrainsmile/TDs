import { _decorator, Component, Node, Label, view } from 'cc';
import { GameStateManager } from '../systems/GameStateManager';
import { GameEvents } from '../core/EventNames';

const { ccclass, property } = _decorator;

/**
 * HUD - 顶部信息栏
 *
 * 显示金币、生命、波次
 */
@ccclass('HUD')
export class HUD extends Component {
    @property({ type: Label })
    public goldLabel: Label | null = null;

    @property({ type: Label })
    public livesLabel: Label | null = null;

    @property({ type: Label })
    public waveLabel: Label | null = null;

    private _gsm: GameStateManager | null = null;

    public init(gsm: GameStateManager): void {
        this._gsm = gsm;
        gsm.on(GameEvents.GOLD_CHANGED, this.onGoldChanged, this);
        gsm.on(GameEvents.LIVES_CHANGED, this.onLivesChanged, this);
        gsm.on(GameEvents.WAVE_START, this.onWaveStart, this);
    }

    private onGoldChanged(gold: number): void {
        if (this.goldLabel) this.goldLabel.string = `Gold: ${gold}`;
    }

    private onLivesChanged(lives: number): void {
        if (this.livesLabel) this.livesLabel.string = `Lives: ${lives}`;
    }

    private onWaveStart(wave: number): void {
        if (this.waveLabel && this._gsm) {
            this.waveLabel.string = `Wave: ${wave} / ${this._gsm.TotalWaves}`;
        }
    }

    protected start(): void {
        if (this._gsm) {
            this.onGoldChanged(this._gsm.Currency?.Gold ?? 0);
            this.onLivesChanged(this._gsm.Lives);
            this.onWaveStart(this._gsm.CurrentWave);
        }
    }
}
