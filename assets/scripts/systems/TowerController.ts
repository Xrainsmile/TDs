import { _decorator, Component, Node, Prefab, Vec3, instantiate } from 'cc';
import { TowerType, GameConfig } from '../core/Constants';
import { GameEvents } from '../core/EventNames';
import { Tower } from '../entities/Tower';
import { EnemyController } from './EnemyController';
import { ProjectileController } from './ProjectileController';
import { createTowerNode } from '../utils/PrefabFactory';

const { ccclass, property } = _decorator;

/** 塔配置 */
interface TowerConfig {
    type: TowerType;
    name: string;
    cost: number;
    upgradeCostMultiplier: number;
    base: { attackRange: number; attackDamage: number; attackInterval: number; };
    growth: { attackRange: number; attackDamage: number; attackInterval: number; };
}

/**
 * TowerController - 塔控制器
 *
 * 职责：
 *  - 管理所有已放置的塔
 *  - 处理塔的放置/升级/出售
 *  - 连接塔与敌人控制器、子弹控制器
 */
@ccclass('TowerController')
export class TowerController extends Component {
    @property({ type: Node, tooltip: '塔容器节点' })
    public towerContainer: Node | null = null;

    @property({ type: [Prefab], tooltip: '塔预制体（按 TowerType 顺序）' })
    public towerPrefabs: Prefab[] = [];

    @property({ type: EnemyController, tooltip: '敌人控制器' })
    public enemyController: EnemyController | null = null;

    @property({ type: ProjectileController, tooltip: '子弹控制器' })
    public projectileController: ProjectileController | null = null;

    private _towers: Tower[] = [];
    private _configs: Map<TowerType, TowerConfig> = new Map();
    private _gsm: any = null;  // GameStateManager

    /** 默认配置（无 JSON 时的 fallback） */
    private readonly _defaultConfigs: Map<TowerType, TowerConfig> = new Map([
        [TowerType.ARROW, { type: TowerType.ARROW, name: '箭塔', cost: 300, upgradeCostMultiplier: 0.8,
            base: { attackRange: 140, attackDamage: 15, attackInterval: 0.8 },
            growth: { attackRange: 1.2, attackDamage: 1.5, attackInterval: 0.9 } }],
        [TowerType.CANNON, { type: TowerType.CANNON, name: '炮塔', cost: 300, upgradeCostMultiplier: 0.8,
            base: { attackRange: 120, attackDamage: 40, attackInterval: 1.5 },
            growth: { attackRange: 1.15, attackDamage: 1.6, attackInterval: 0.95 } }],
        [TowerType.MAGIC, { type: TowerType.MAGIC, name: '魔法塔', cost: 300, upgradeCostMultiplier: 0.8,
            base: { attackRange: 160, attackDamage: 25, attackInterval: 1.0 },
            growth: { attackRange: 1.2, attackDamage: 1.5, attackInterval: 0.9 } }],
    ]);

    public setGameStateManager(gsm: any): void { this._gsm = gsm; }

    protected onLoad(): void {
        for (const [type, config] of this._defaultConfigs) {
            this._configs.set(type, { ...config });
        }
    }

    /** 从 JSON 加载配置 */
    public loadConfigs(configs: any[]): void {
        for (const cfg of configs) {
            const type = cfg.type as TowerType;
            this._configs.set(type, {
                type, name: cfg.name, cost: cfg.cost,
                upgradeCostMultiplier: cfg.upgradeCostMultiplier ?? 0.8,
                base: { ...cfg.base },
                growth: { ...cfg.growth },
            });
        }
    }

    public getConfig(type: TowerType): TowerConfig | undefined { return this._configs.get(type); }
    public getAvailableTypes(): TowerType[] { return Array.from(this._configs.keys()); }

    /** 设置预制体 */
    public setPrefabs(prefabs: Prefab[]): void { this.towerPrefabs = prefabs; }

    /** 使用运行时模板（无美术资源时） */
    public useTemplates: boolean = false;

    public enableTemplates(): void { this.useTemplates = true; }

    /** 放置塔 */
    public placeTower(type: TowerType, position: Vec3): Tower | null {
        const config = this._configs.get(type);
        if (!config) {
            console.warn('placeTower: 未找到配置');
            return null;
        }

        const currency = this._gsm?.Currency;
        if (!currency) {
            console.warn('placeTower: Currency 为空');
            return null;
        }
        if (!currency.spendGold(config.cost)) {
            console.warn(`placeTower: 金币不足，需要 ${config.cost}，当前 ${currency.Gold}`);
            return null;
        }

        let node: Node;

        if (this.useTemplates) {
            node = createTowerNode(type);
            node.addComponent(Tower);
        } else {
            const prefabIndex = type - 1;
            if (prefabIndex < 0 || prefabIndex >= this.towerPrefabs.length || !this.towerPrefabs[prefabIndex]) {
                console.warn('placeTower: 缺少预制体');
                currency.refundGold(config.cost);
                return null;
            }
            node = instantiate(this.towerPrefabs[prefabIndex]);
        }

        if (this.towerContainer) node.parent = this.towerContainer;
        node.position = position;

        const tower = node.getComponent(Tower);
        if (!tower) {
            console.warn('placeTower: getComponent(Tower) 返回 null');
            node.destroy();
            currency.refundGold(config.cost);
            return null;
        }

        tower.towerType = type;
        tower.attackRange = config.base.attackRange;
        tower.attackDamage = config.base.attackDamage;
        tower.attackInterval = config.base.attackInterval;
        tower.TotalCost = config.cost;
        tower.projectileController = this.projectileController;
        tower.getEnemiesInRange = (pos: Vec3, range: number) => {
            return this.enemyController ? this.enemyController.getEnemiesInRange(pos, range) : [];
        };

        this._towers.push(tower);
        this._gsm?.emit(GameEvents.TOWER_PLACED, tower);
        return tower;
    }

    /** 升级塔 */
    public upgradeTower(tower: Tower): boolean {
        const config = this._configs.get(tower.towerType);
        if (!config) return false;

        const upgradeCost = Math.floor(config.cost * config.upgradeCostMultiplier * tower.level);
        const currency = this._gsm?.Currency;
        if (!currency || !currency.spendGold(upgradeCost)) return false;

        if (!tower.upgrade(config.growth)) {
            currency.refundGold(upgradeCost);
            return false;
        }

        tower.TotalCost += upgradeCost;
        this._gsm?.emit(GameEvents.TOWER_UPGRADED, tower);
        return true;
    }

    /** 出售塔 */
    public sellTower(tower: Tower): void {
        const currency = this._gsm?.Currency;
        if (!currency) return;

        currency.addGold(tower.SellValue);
        const idx = this._towers.indexOf(tower);
        if (idx >= 0) this._towers.splice(idx, 1);
        this._gsm?.emit(GameEvents.TOWER_SOLD, tower);
        tower.node.destroy();
    }

    public get Towers(): Tower[] { return this._towers; }

    public hasTowerAt(position: Vec3, threshold: number = 32): boolean {
        for (const tower of this._towers) {
            if (Vec3.distance(tower.node.position, position) < threshold) return true;
        }
        return false;
    }
}
