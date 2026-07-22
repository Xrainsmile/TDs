import { _decorator, Component, Node, Prefab, Vec3, instantiate } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { TowerType, Constants } from '../core/Constants';
import { Tower } from './Tower';
import { EnemyManager } from '../enemies/EnemyManager';
import { BulletManager } from '../bullets/BulletManager';

const { ccclass, property } = _decorator;

/**
 * 塔配置数据
 */
interface TowerConfig {
    type: TowerType;
    name: string;
    cost: number;
    attackRange: number;
    attackDamage: number;
    attackInterval: number;
}

/**
 * TowerManager - 塔管理器
 *
 * 职责：
 *  - 管理所有已放置的塔
 *  - 处理塔的放置/升级/出售
 *  - 连接塔与敌人管理器
 */
@ccclass('TowerManager')
export class TowerManager extends Component {
    @property({ type: Node, tooltip: '塔容器节点' })
    public towerContainer: Node | null = null;

    @property({ type: [Prefab], tooltip: '塔预制体（按 TowerType 顺序）' })
    public towerPrefabs: Prefab[] = [];

    @property({ type: EnemyManager, tooltip: '敌人管理器' })
    public enemyManager: EnemyManager | null = null;

    @property({ type: BulletManager, tooltip: '子弹管理器' })
    public bulletManager: BulletManager | null = null;

    private _towers: Tower[] = [];

    /** 塔配置（运行时从 JSON 加载） */
    private _towerConfigs: Map<TowerType, TowerConfig> = new Map();

    /** 默认配置（无 JSON 时的 fallback） */
    private readonly _defaultConfigs: Map<TowerType, TowerConfig> = new Map([
        [TowerType.ARROW, { type: TowerType.ARROW, name: '箭塔', cost: 50, attackRange: 120, attackDamage: 15, attackInterval: 0.8 }],
        [TowerType.CANNON, { type: TowerType.CANNON, name: '炮塔', cost: 100, attackRange: 100, attackDamage: 40, attackInterval: 1.5 }],
        [TowerType.MAGIC, { type: TowerType.MAGIC, name: '魔法塔', cost: 80, attackRange: 140, attackDamage: 25, attackInterval: 1.0 }],
    ]);

    protected onLoad(): void {
        // 默认使用 fallback 配置
        for (const [type, config] of this._defaultConfigs) {
            this._towerConfigs.set(type, { ...config });
        }
    }

    /**
     * 从 JSON 加载塔配置
     */
    public loadConfigs(configs: any[]): void {
        for (const cfg of configs) {
            const type = cfg.type as TowerType;
            this._towerConfigs.set(type, {
                type,
                name: cfg.name,
                cost: cfg.cost,
                attackRange: cfg.attackRange,
                attackDamage: cfg.attackDamage,
                attackInterval: cfg.attackInterval,
            });
        }
    }

    /**
     * 获取塔配置
     */
    public getConfig(type: TowerType): TowerConfig | undefined {
        return this._towerConfigs.get(type);
    }

    /**
     * 获取所有可用的塔类型
     */
    public getAvailableTypes(): TowerType[] {
        const types: TowerType[] = [];
        for (const key of this._towerConfigs.keys()) {
            types.push(key);
        }
        return types;
    }

    /**
     * 放置塔
     * @param type 塔类型
     * @param position 放置位置
     * @returns 放置成功返回 Tower，失败返回 null
     */
    public placeTower(type: TowerType, position: Vec3): Tower | null {
        const config = this._towerConfigs.get(type);
        if (!config) {
            console.warn(`TowerManager: 未知塔类型 ${type}`);
            return null;
        }

        const gm = GameManager.Instance;
        if (!gm) return null;

        // 检查金币
        if (!gm.spendGold(config.cost)) {
            return null;
        }

        // 获取预制体
        const prefabIndex = type - 1;
        if (prefabIndex < 0 || prefabIndex >= this.towerPrefabs.length || !this.towerPrefabs[prefabIndex]) {
            console.warn(`TowerManager: 缺少类型 ${type} 的预制体`);
            gm.addGold(config.cost); // 退还金币
            return null;
        }

        // 实例化
        const node = instantiate(this.towerPrefabs[prefabIndex]);
        if (this.towerContainer) {
            node.parent = this.towerContainer;
        }
        node.position = position;

        const tower = node.getComponent(Tower);
        if (!tower) {
            console.warn('TowerManager: 预制体上缺少 Tower 组件');
            node.destroy();
            gm.addGold(config.cost);
            return null;
        }

        // 配置塔
        tower.towerType = type;
        tower.attackRange = config.attackRange;
        tower.attackDamage = config.attackDamage;
        tower.attackInterval = config.attackInterval;
        tower.TotalCost = config.cost;
        tower.bulletManager = this.bulletManager;
        tower.getEnemiesInRange = (pos: Vec3, range: number) => {
            return this.enemyManager ? this.enemyManager.getEnemiesInRange(pos, range) : [];
        };

        this._towers.push(tower);
        gm.emit(EventNames.TOWER_PLACED, tower);

        return tower;
    }

    /**
     * 升级塔
     */
    public upgradeTower(tower: Tower): boolean {
        const config = this._towerConfigs.get(tower.towerType);
        if (!config) return false;

        const upgradeCost = Math.floor(config.cost * 0.8 * tower.level);
        const gm = GameManager.Instance;
        if (!gm || !gm.spendGold(upgradeCost)) return false;

        if (!tower.upgrade()) {
            gm.addGold(upgradeCost);
            return false;
        }

        tower.TotalCost += upgradeCost;
        gm.emit(EventNames.TOWER_UPGRADED, tower);
        return true;
    }

    /**
     * 出售塔
     */
    public sellTower(tower: Tower): void {
        const gm = GameManager.Instance;
        if (!gm) return;

        gm.addGold(tower.SellValue);

        const idx = this._towers.indexOf(tower);
        if (idx >= 0) {
            this._towers.splice(idx, 1);
        }

        gm.emit(EventNames.TOWER_SOLD, tower);
        tower.node.destroy();
    }

    /**
     * 获取所有塔
     */
    public get Towers(): Tower[] {
        return this._towers;
    }

    /**
     * 检查某位置是否已有塔
     */
    public hasTowerAt(position: Vec3, threshold: number = 32): boolean {
        for (const tower of this._towers) {
            if (Vec3.distance(tower.node.position, position) < threshold) {
                return true;
            }
        }
        return false;
    }
}


