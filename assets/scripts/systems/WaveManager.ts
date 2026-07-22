import { _decorator, Component, Vec3 } from 'cc';
import { GameState } from '../core/Constants';
import { GameEvents } from '../core/EventNames';

const { ccclass, property } = _decorator;

/**
 * WaveManager - 波次管理器
 *
 * 职责：
 *  - 读取关卡波次配置
 *  - 按时序生成敌人
 *  - 通知 GameStateManager 波次进度
 */
@ccclass('WaveManager')
export class WaveManager extends Component {
    @property({ tooltip: '路径管理器（通过外部设置）' })
    public pathManager: any = null;  // PathManager

    @property({ tooltip: '敌人控制器（通过外部设置）' })
    public enemyController: any = null;  // EnemyController

    private _waves: any[] = [];  // LevelWaveConfig[]
    private _currentWaveIndex: number = -1;
    private _isWaveActive: boolean = false;
    private _gsm: any = null;  // GameStateManager

    protected onLoad(): void {
        // 延迟获取 GameStateManager
        this.scheduleOnce(() => {
            // 通过节点查找
        }, 0);
    }

    public setGameStateManager(gsm: any): void {
        this._gsm = gsm;
        if (gsm) {
            gsm.on(GameEvents.START_NEXT_WAVE, this.startNextWave, this);
        }
    }

    /** 加载波次配置 */
    public loadWaves(waveConfigs: any[]): void {
        this._waves = waveConfigs.map((wave, idx) => ({
            waveIndex: idx,
            enemies: wave.enemies.map((e: any) => ({
                delay: e.delay ?? 0,
                enemyType: e.enemyType,
                count: e.count ?? 1,
                interval: e.interval ?? 1.0,
            })),
        }));
        if (this._gsm) {
            this._gsm.TotalWaves = this._waves.length;
        }
    }

    /** 开始下一波 */
    public startNextWave(): boolean {
        this._currentWaveIndex++;
        if (this._currentWaveIndex >= this._waves.length) {
            this._gsm?.setGameState(GameState.VICTORY);
            return false;
        }

        const wave = this._waves[this._currentWaveIndex];
        this._isWaveActive = true;
        this._gsm.CurrentWave = this._currentWaveIndex + 1;
        this._gsm.emit(GameEvents.WAVE_START, this._currentWaveIndex + 1);

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

    private spawnEnemy(type: number): void {
        if (this.enemyController && this.pathManager) {
            this.enemyController.spawnEnemy(type, this.pathManager);
            this._gsm?.emit(GameEvents.ENEMY_SPAWNED);
        }
    }

    /** 检查波次是否完成（由 EnemyController 调用） */
    public checkWaveComplete(): void {
        if (this._isWaveActive && this.enemyController && this.enemyController.AliveCount === 0) {
            this.onWaveEnd();
        }
    }

    private onWaveEnd(): void {
        this._isWaveActive = false;
        this._gsm?.emit(GameEvents.WAVE_END, this._currentWaveIndex + 1);

        if (this._currentWaveIndex + 1 >= this._waves.length) {
            this._gsm?.emit(GameEvents.ALL_WAVES_CLEARED);
            this._gsm?.setGameState(GameState.VICTORY);
        } else {
            this._gsm?.setGameState(GameState.WAVE_CLEARED);
        }
    }

    public get CurrentWaveIndex(): number { return this._currentWaveIndex; }
    public get IsWaveActive(): boolean { return this._isWaveActive; }
}
