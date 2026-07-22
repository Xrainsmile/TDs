import { _decorator, Component, Vec3, JsonAsset } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { PathManager } from '../core/PathManager';
import { WaveManager } from '../core/WaveManager';
import { GridManager } from '../core/GridManager';
import { EnemyManager } from '../enemies/EnemyManager';
import { TowerManager } from '../towers/TowerManager';
import { LevelConfigData } from '../data/GameData';

const { ccclass, property } = _decorator;

/**
 * LevelManager - 关卡管理器
 *
 * 职责：
 *  - 加载关卡 JSON 配置
 *  - 初始化路径、波次、网格
 *  - 协调各子系统启动
 */
@ccclass('LevelManager')
export class LevelManager extends Component {
    @property({ type: JsonAsset, tooltip: '关卡配置 JSON' })
    public levelConfigAsset: JsonAsset | null = null;

    @property({ type: PathManager, tooltip: '路径管理器' })
    public pathManager: PathManager | null = null;

    @property({ type: WaveManager, tooltip: '波次管理器' })
    public waveManager: WaveManager | null = null;

    @property({ type: GridManager, tooltip: '网格管理器' })
    public gridManager: GridManager | null = null;

    @property({ type: EnemyManager, tooltip: '敌人管理器' })
    public enemyManager: EnemyManager | null = null;

    @property({ type: TowerManager, tooltip: '塔管理器' })
    public towerManager: TowerManager | null = null;

    private _levelConfig: LevelConfigData | null = null;

    protected onLoad(): void {
        const gm = GameManager.Instance;
        if (gm) {
            gm.on('start-next-wave', this.onStartNextWave, this);
        }
    }

    protected onDestroy(): void {
        const gm = GameManager.Instance;
        if (gm) {
            gm.off('start-next-wave', this.onStartNextWave, this);
        }
    }

    protected start(): void {
        this.loadLevel();
    }

    /**
     * 加载关卡
     */
    public loadLevel(): void {
        if (!this.levelConfigAsset) {
            console.warn('LevelManager: 未设置关卡配置');
            return;
        }

        const json = this.levelConfigAsset.json;
        this._levelConfig = json as LevelConfigData;

        if (!this._levelConfig) {
            console.error('LevelManager: 关卡配置解析失败');
            return;
        }

        // 1. 初始化 GameManager 经济
        const gm = GameManager.Instance;
        if (gm) {
            gm.initGame();
            // 覆盖初始金币和生命
            if (this._levelConfig.initialGold) {
                (gm as any)._gold = this._levelConfig.initialGold;
            }
            if (this._levelConfig.initialLives) {
                (gm as any)._lives = this._levelConfig.initialLives;
            }
        }

        // 2. 设置路径
        if (this.pathManager) {
            const waypoints = this._levelConfig.pathPoints.map(p => new Vec3(p.x, p.y, 0));
            (this.pathManager as any).waypoints = waypoints;
            // 触发重新计算
            (this.pathManager as any).calculateLength();
        }

        // 3. 设置建造格子
        if (this.gridManager && this._levelConfig.buildSlots) {
            this.gridManager.addBuildSlots(this._levelConfig.buildSlots);
        }

        // 4. 加载波次
        if (this.waveManager) {
            this.waveManager.loadWaves(this._levelConfig.waves);
        }

        console.log(`LevelManager: 关卡「${this._levelConfig.levelName}」加载完成`);
    }

    private onStartNextWave(): void {
        if (this.waveManager) {
            this.waveManager.startNextWave();
        }
    }

    public get LevelConfig(): LevelConfigData | null {
        return this._levelConfig;
    }
}
