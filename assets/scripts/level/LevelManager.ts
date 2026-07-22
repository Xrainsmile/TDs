import { _decorator, Component, Vec3, JsonAsset } from 'cc';
import { GameStateManager } from '../systems/GameStateManager';
import { WaveManager } from '../systems/WaveManager';
import { PathManager } from '../systems/PathManager';
import { GridManager } from '../systems/GridManager';
import { EnemyController } from '../systems/EnemyController';
import { TowerController } from '../systems/TowerController';
import { LevelConfig } from '../data/GameData';
import { createPathNode, createBuildSlotNode } from '../utils/PrefabFactory';

const { ccclass, property } = _decorator;

/**
 * LevelManager - 关卡管理器
 *
 * 职责：
 *  - 加载关卡 JSON 配置
 *  - 初始化路径、网格、波次
 *  - 创建路径和建造格子的可视化
 *  - 协调各子系统启动
 */
@ccclass('LevelManager')
export class LevelManager extends Component {
    @property({ type: JsonAsset, tooltip: '关卡配置 JSON' })
    public levelConfigAsset: JsonAsset | null = null;

    @property({ type: PathManager })
    public pathManager: PathManager | null = null;

    @property({ type: WaveManager })
    public waveManager: WaveManager | null = null;

    @property({ type: GridManager })
    public gridManager: GridManager | null = null;

    @property({ type: EnemyController })
    public enemyController: EnemyController | null = null;

    @property({ type: TowerController })
    public towerController: TowerController | null = null;

    @property({ type: GameStateManager })
    public gameStateManager: GameStateManager | null = null;

    /** 用于放置路径可视化的父节点 */
    @property({ type: Node, tooltip: '路径可视化容器' })
    public visualContainer: Node | null = null;

    private _levelConfig: LevelConfig | null = null;

    // start 中不再自动加载，由 SceneInitializer 在设置完 levelConfigAsset 后手动调用
    protected start(): void {
        if (this.levelConfigAsset) {
            this.loadLevel();
        }
    }

    /** 加载关卡 */
    public loadLevel(): void {
        if (!this.levelConfigAsset) {
            console.warn('LevelManager: 未设置关卡配置');
            return;
        }

        this._levelConfig = this.levelConfigAsset.json as LevelConfig;
        if (!this._levelConfig) {
            console.error('LevelManager: 关卡配置解析失败');
            return;
        }

        console.log(`LevelManager: 加载关卡「${this._levelConfig.levelName}」`);

        // 1. 初始化经济
        if (this.gameStateManager) {
            this.gameStateManager.initGame(
                this._levelConfig.initialGold,
                this._levelConfig.initialLives,
            );
        }

        // 2. 设置路径
        if (this.pathManager && this._levelConfig.pathPoints) {
            this.pathManager.setWaypoints(this._levelConfig.pathPoints);
        }

        // 3. 设置建造格子
        if (this.gridManager && this._levelConfig.buildSlots) {
            this.gridManager.addBuildSlots(this._levelConfig.buildSlots);
        }

        // 4. 加载波次
        if (this.waveManager && this._levelConfig.waves) {
            this.waveManager.loadWaves(this._levelConfig.waves);
        }

        // 5. 创建可视化
        this.createVisuals();
    }

    /** 创建路径和建造格子的可视化 */
    private createVisuals(): void {
        if (!this._levelConfig || !this.visualContainer) return;

        // 路径可视化
        if (this._levelConfig.pathPoints) {
            const pathNode = createPathNode(this._levelConfig.pathPoints);
            pathNode.setParent(this.visualContainer);
        }

        // 建造格子可视化
        if (this._levelConfig.buildSlots && this.gridManager) {
            for (const slot of this._levelConfig.buildSlots) {
                const worldPos = this.gridManager.gridToWorld(slot.x, slot.y);
                const slotNode = createBuildSlotNode(worldPos.x, worldPos.y);
                slotNode.setParent(this.visualContainer);
            }
        }
    }

    public get LevelConfig(): LevelConfig | null { return this._levelConfig; }
}
