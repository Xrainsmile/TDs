import { _decorator, Component, director, Node } from 'cc';
import { GameState } from './Constants';
import { EventNames } from './EventNames';

const { ccclass, property } = _decorator;

/**
 * GameManager - 游戏总管理器（单例）
 *
 * 职责：
 *  - 持有并切换全局游戏状态
 *  - 协调各子系统（经济、波次、塔、敌人、子弹、UI）
 *  - 提供全局事件分发入口
 *
 * 使用方式：
 *  挂载到场景根节点上，其他脚本通过 GameManager.Instance 访问
 */
@ccclass('GameManager')
export class GameManager extends Component {
    private static _instance: GameManager | null = null;

    public static get Instance(): GameManager {
        return this._instance!;
    }

    @property
    public debugMode: boolean = false;

    private _state: GameState = GameState.MENU;
    private _gold: number = 0;
    private _lives: number = 0;
    private _currentWave: number = 0;
    private _totalWaves: number = 0;

    // --- 生命周期 ---

    protected onLoad(): void {
        if (GameManager._instance && GameManager._instance !== this) {
            this.destroy();
            return;
        }
        GameManager._instance = this;
        director.addPersistRootNode(this.node);
    }

    protected onDestroy(): void {
        if (GameManager._instance === this) {
            GameManager._instance = null;
        }
    }

    protected start(): void {
        this.initGame();
    }

    // --- 初始化 ---

    public initGame(): void {
        this._state = GameState.PREPARING;
        this._gold = 200;
        this._lives = 20;
        this._currentWave = 0;
        this._totalWaves = 0;
        this.emit(EventNames.GOLD_CHANGED, this._gold);
        this.emit(EventNames.LIVES_CHANGED, this._lives);
    }

    // --- 状态管理 ---

    public get State(): GameState {
        return this._state;
    }

    public setGameState(state: GameState): void {
        if (this._state === state) return;
        this._state = state;
        this.emit(EventNames.GAME_STATE_CHANGED, state);

        switch (state) {
            case GameState.GAME_OVER:
                this.emit(EventNames.GAME_OVER);
                break;
            case GameState.VICTORY:
                this.emit(EventNames.VICTORY);
                break;
        }
    }

    // --- 经济 ---

    public get Gold(): number {
        return this._gold;
    }

    public addGold(amount: number): void {
        this._gold += amount;
        this.emit(EventNames.GOLD_CHANGED, this._gold);
    }

    public spendGold(amount: number): boolean {
        if (this._gold < amount) {
            this.emit(EventNames.NOT_ENOUGH_GOLD);
            return false;
        }
        this._gold -= amount;
        this.emit(EventNames.GOLD_CHANGED, this._gold);
        return true;
    }

    // --- 生命 ---

    public get Lives(): number {
        return this._lives;
    }

    public loseLife(amount: number = 1): void {
        this._lives = Math.max(0, this._lives - amount);
        this.emit(EventNames.LIVES_CHANGED, this._lives);
        if (this._lives <= 0) {
            this.setGameState(GameState.GAME_OVER);
        }
    }

    // --- 波次 ---

    public get CurrentWave(): number {
        return this._currentWave;
    }

    public set CurrentWave(value: number) {
        this._currentWave = value;
    }

    public get TotalWaves(): number {
        return this._totalWaves;
    }

    public set TotalWaves(value: number) {
        this._totalWaves = value;
    }

    // --- 事件辅助 ---

    public emit(eventName: string, ...args: any[]): void {
        this.node.emit(eventName, ...args);
    }

    public on(eventName: string, callback: (...args: any[]) => void, target?: any): void {
        this.node.on(eventName, callback, target);
    }

    public off(eventName: string, callback: (...args: any[]) => void, target?: any): void {
        this.node.off(eventName, callback, target);
    }
}
