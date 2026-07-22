import { _decorator, Component } from 'cc';
import { GameManager } from './GameManager';
import { EventNames } from './EventNames';
import { GameState, EnemyType } from './Constants';
import { PathManager } from './PathManager';
import { EnemyManager } from '../enemies/EnemyManager';

const { ccclass, property } = _decorator;

/**
 * 单个波次的敌人配置
 */
interface WaveConfig {
    /** 距波次开始的延迟（秒） */
    delay: number;
    /** 敌人类型 */
    enemyType: EnemyType;
    /** 敌人数量 */
    count: number;
    /** 每个敌人之间的间隔（秒） */
    interval: number;
}

/**
 * 一整波数据
 */
interface WaveData {
    waveIndex: number;
    enemies: WaveConfig[];
}

/**
 * WaveManager - 敌人波次管理器
 *
 * 职责：
 *  - 读取关卡波次配置
 *  - 按时序生成敌人
 *  - 通知 GameManager 波次进度
 */
@ccclass('WaveManager')
export class WaveManager extends Component {
    @property({ type: PathManager, tooltip: '路径管理器引用' })
    public pathManager: PathManager | null = null;

    @property({ type: EnemyManager, tooltip: '敌人管理器引用' })
    public enemyManager: EnemyManager | null = null;

    /** 当前关卡波次数据（运行时从配置加载） */
    private _waves: WaveData[] = [];
    private _currentWaveIndex: number = -1;
    private _isWaveActive: boolean = false;

    protected onLoad(): void {
        const gm = GameManager.Instance;
        if (gm) {
            gm.on(EventNames.WAVE_END, this.onWaveEnd, this);
        }
    }

    protected onDestroy(): void {
        const gm = GameManager.Instance;
        if (gm) {
            gm.off(EventNames.WAVE_END, this.onWaveEnd, this);
        }
    }

    /**
     * 加载波次配置
     */
    public loadWaves(waveConfigs: any[]): void {
        this._waves = waveConfigs.map((wave, idx) => {
            return {
                waveIndex: idx,
                enemies: wave.enemies.map((e: any) => ({
                    delay: e.delay ?? 0,
                    enemyType: e.enemyType as EnemyType,
                    count: e.count ?? 1,
                    interval: e.interval ?? 1.0,
                })),
            };
        });

        const gm = GameManager.Instance;
        if (gm) {
            gm.TotalWaves = this._waves.length;
        }
    }

    /**
     * 开始下一波
     */
    public startNextWave(): boolean {
        this._currentWaveIndex++;
        if (this._currentWaveIndex >= this._waves.length) {
            GameManager.Instance?.setGameState(GameState.VICTORY);
            return false;
        }

        const wave = this._waves[this._currentWaveIndex];
        this._isWaveActive = true;
        GameManager.Instance!.CurrentWave = this._currentWaveIndex + 1;
        GameManager.Instance!.emit(EventNames.WAVE_START, this._currentWaveIndex + 1);

        // 按配置调度敌人
        let elapsed = 0;
        for (const cfg of wave.enemies) {
            elapsed += cfg.delay;
            for (let i = 0; i < cfg.count; i++) {
                this.scheduleOnce(() => {
                    this.spawnEnemy(cfg.enemyType);
                }, elapsed);
                elapsed += cfg.interval;
            }
        }

        return true;
    }

    private spawnEnemy(type: EnemyType): void {
        if (this.enemyManager && this.pathManager) {
            this.enemyManager.spawnEnemy(type, this.pathManager);
            GameManager.Instance?.emit(EventNames.ENEMY_SPAWNED);
        }
    }

    private onWaveEnd(): void {
        this._isWaveActive = false;
        GameManager.Instance?.emit(EventNames.WAVE_CLEARED, this._currentWaveIndex + 1);

        if (this._currentWaveIndex + 1 >= this._waves.length) {
            GameManager.Instance?.emit(EventNames.ALL_WAVES_CLEARED);
            GameManager.Instance?.setGameState(GameState.VICTORY);
        } else {
            GameManager.Instance?.setGameState(GameState.WAVE_CLEARED);
        }
    }

    /**
     * 检查当前波次是否所有敌人已处理完毕
     * 由 EnemyManager 在敌人清空时调用
     */
    public checkWaveComplete(): void {
        if (this._isWaveActive && this.enemyManager && this.enemyManager.AliveCount === 0) {
            this.onWaveEnd();
        }
    }

    public get CurrentWaveIndex(): number {
        return this._currentWaveIndex;
    }

    public get IsWaveActive(): boolean {
        return this._isWaveActive;
    }
}
