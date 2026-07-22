import { _decorator, Component, director, Node } from 'cc';
import { GameState, GameConfig } from '../core/Constants';
import { GameEvents } from '../core/EventNames';
import { CurrencySystem } from './CurrencySystem';

const { ccclass, property } = _decorator;

/**
 * GameStateManager - 游戏状态总管理器（单例）
 *
 * 职责：
 *  - 持有并切换全局游戏状态
 *  - 协调各子系统
 *  - 提供全局事件分发入口
 */
@ccclass('GameStateManager')
export class GameStateManager extends Component {
    private static _instance: GameStateManager | null = null;

    public static get Instance(): GameStateManager {
        return this._instance!;
    }

    @property
    public debugMode: boolean = false;

    private _state: GameState = GameState.MENU;
    private _lives: number = 0;
    private _currentWave: number = 0;
    private _totalWaves: number = 0;

    /** 货币系统（挂载在同一节点上） */
    private _currency: CurrencySystem | null = null;

    protected onLoad(): void {
        if (GameStateManager._instance && GameStateManager._instance !== this) {
            this.destroy();
            return;
        }
        GameStateManager._instance = this;
        this._currency = this.getComponent(CurrencySystem);
        console.log('GameStateManager: onLoad, currency =', this._currency);
    }

    /** 确保 Currency 系统可用 */
    public get Currency(): CurrencySystem {
        if (!this._currency) {
            this._currency = this.getComponent(CurrencySystem);
            if (!this._currency) {
                this._currency = this.node.addComponent(CurrencySystem);
                console.warn('GameStateManager: Currency 系统缺失，已自动添加');
            }
        }
        return this._currency;
    }

    protected onDestroy(): void {
        if (GameStateManager._instance === this) {
            GameStateManager._instance = null;
        }
    }

    /** 初始化游戏 */
    public initGame(gold?: number, lives?: number): void {
        this._state = GameState.PREPARING;
        this._lives = lives ?? GameConfig.INITIAL_LIVES;
        if (this._currency) {
            this._currency.setGold(gold ?? GameConfig.INITIAL_GOLD);
        }
        this.emit(GameEvents.LIVES_CHANGED, this._lives);
    }

    // --- 状态 ---

    public get State(): GameState { return this._state; }

    public setGameState(state: GameState): void {
        if (this._state === state) return;
        this._state = state;
        this.emit(GameEvents.GAME_STATE_CHANGED, state);
        if (state === GameState.GAME_OVER) this.emit(GameEvents.GAME_OVER);
        if (state === GameState.VICTORY) this.emit(GameEvents.VICTORY);
    }

    // --- 生命 ---

    public get Lives(): number { return this._lives; }

    public loseLife(amount: number = 1): void {
        this._lives = Math.max(0, this._lives - amount);
        this.emit(GameEvents.LIVES_CHANGED, this._lives);
        if (this._lives <= 0) this.setGameState(GameState.GAME_OVER);
    }

    // --- 波次 ---

    public get CurrentWave(): number { return this._currentWave; }
    public set CurrentWave(v: number) { this._currentWave = v; }
    public get TotalWaves(): number { return this._totalWaves; }
    public set TotalWaves(v: number) { this._totalWaves = v; }

    // --- 事件 ---

    public emit(eventName: string, ...args: any[]): void { this.node.emit(eventName, ...args); }
    public on(eventName: string, cb: (...a: any[]) => void, target?: any): void { this.node.on(eventName, cb, target); }
    public off(eventName: string, cb: (...a: any[]) => void, target?: any): void { this.node.off(eventName, cb, target); }

    // Currency getter 已在上方定义
}
