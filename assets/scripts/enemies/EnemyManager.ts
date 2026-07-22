import { _decorator, Component, Node, Prefab, Vec3 } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { EnemyType, Constants } from '../core/Constants';
import { PathManager } from '../core/PathManager';
import { Enemy } from './Enemy';
import { ObjectPool } from '../utils/ObjectPool';

const { ccclass, property } = _decorator;

/**
 * EnemyManager - 敌人管理器
 *
 * 职责：
 *  - 管理所有活动敌人的创建、更新、销毁
 *  - 使用对象池复用敌人节点
 *  - 统计存活数量，通知 WaveManager 检查波次完成
 */
@ccclass('EnemyManager')
export class EnemyManager extends Component {
    @property({ type: Node, tooltip: '敌人容器节点' })
    public enemyContainer: Node | null = null;

    @property({ type: [Prefab], tooltip: '敌人预制体（按 EnemyType 顺序）' })
    public enemyPrefabs: Prefab[] = [];

    private _enemies: Enemy[] = [];
    private _pools: Map<EnemyType, ObjectPool> = new Map();

    // --- 不同敌人类型的默认属性 ---
    private readonly _defaultProps: Map<EnemyType, { hp: number; speed: number; gold: number; livesCost: number }> = new Map([
        [EnemyType.NORMAL, { hp: 100, speed: 80, gold: 10, livesCost: 1 }],
        [EnemyType.FAST, { hp: 60, speed: 160, gold: 15, livesCost: 1 }],
        [EnemyType.TANK, { hp: 400, speed: 40, gold: 30, livesCost: 2 }],
        [EnemyType.BOSS, { hp: 1000, speed: 50, gold: 100, livesCost: 5 }],
    ]);

    protected onLoad(): void {
        this.initPools();
    }

    private initPools(): void {
        const types = [EnemyType.NORMAL, EnemyType.FAST, EnemyType.TANK, EnemyType.BOSS];
        for (let i = 0; i < types.length; i++) {
            if (i < this.enemyPrefabs.length && this.enemyPrefabs[i]) {
                const pool = new ObjectPool();
                pool.init(this.enemyPrefabs[i], 5, this.enemyContainer ?? undefined);
                this._pools.set(types[i], pool);
            }
        }
    }

    /**
     * 生成敌人
     */
    public spawnEnemy(type: EnemyType, pathManager: PathManager): void {
        const pool = this._pools.get(type);
        if (!pool) {
            console.warn(`EnemyManager: 未找到类型 ${type} 的对象池`);
            return;
        }

        const node = pool.get(this.enemyContainer ?? undefined);
        const enemy = node.getComponent(Enemy);
        if (!enemy) {
            console.warn('EnemyManager: 预制体上缺少 Enemy 组件');
            pool.put(node);
            return;
        }

        // 设置属性
        const props = this._defaultProps.get(type);
        if (props) {
            enemy.maxHp = props.hp;
            enemy.moveSpeed = props.speed;
            enemy.killGold = props.gold;
            enemy.livesCost = props.livesCost;
        }
        enemy.enemyType = type;
        enemy.reset();

        // 设置路径
        const waypoints: Vec3[] = [];
        for (let i = 0; i < pathManager.WaypointCount; i++) {
            waypoints.push(pathManager.getWaypoint(i));
        }
        enemy.setPath(
            waypoints,
            () => this.onEnemyReachedEnd(enemy, pool),
            () => this.onEnemyKilled(enemy, pool),
        );

        this._enemies.push(enemy);
        GameManager.Instance?.emit(EventNames.ENEMY_SPAWNED);
    }

    private onEnemyKilled(enemy: Enemy, pool: ObjectPool): void {
        GameManager.Instance?.addGold(enemy.killGold);
        GameManager.Instance?.emit(EventNames.ENEMY_KILLED);
        this.removeEnemy(enemy, pool);
    }

    private onEnemyReachedEnd(enemy: Enemy, pool: ObjectPool): void {
        GameManager.Instance?.loseLife(enemy.livesCost);
        GameManager.Instance?.emit(EventNames.ENEMY_REACHED_END);
        this.removeEnemy(enemy, pool);
    }

    private removeEnemy(enemy: Enemy, pool: ObjectPool): void {
        const idx = this._enemies.indexOf(enemy);
        if (idx >= 0) {
            this._enemies.splice(idx, 1);
        }
        pool.put(enemy.node);

        // 检查波次是否完成
        if (this._enemies.length === 0) {
            this.node.emit('wave-enemies-cleared');
        }
    }

    /**
     * 获取所有存活敌人
     */
    public get Enemies(): Enemy[] {
        return this._enemies;
    }

    public get AliveCount(): number {
        return this._enemies.length;
    }

    /**
     * 获取距离指定位置最近的敌人（在攻击范围内）
     */
    public getNearestEnemyInRange(position: Vec3, range: number): Enemy | null {
        let nearest: Enemy | null = null;
        let minDist = range;
        for (const enemy of this._enemies) {
            if (enemy.IsDead) continue;
            const dist = Vec3.distance(position, enemy.node.position);
            if (dist <= minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    /**
     * 获取范围内所有敌人
     */
    public getEnemiesInRange(position: Vec3, range: number): Enemy[] {
        const result: Enemy[] = [];
        for (const enemy of this._enemies) {
            if (enemy.IsDead) continue;
            const dist = Vec3.distance(position, enemy.node.position);
            if (dist <= range) {
                result.push(enemy);
            }
        }
        return result;
    }

    /**
     * 清除所有敌人
     */
    public clearAll(): void {
        for (const enemy of this._enemies) {
            if (enemy.node.isValid) {
                enemy.node.destroy();
            }
        }
        this._enemies.length = 0;
    }
}
