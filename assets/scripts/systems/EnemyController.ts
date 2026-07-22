import { _decorator, Component, Node, Vec3, Prefab } from 'cc';
import { EnemyType, GameConfig } from '../core/Constants';
import { GameEvents } from '../core/EventNames';
import { Enemy } from '../entities/Enemy';
import { ObjectPool } from '../utils/ObjectPool';
import { createEnemyNode } from '../utils/PrefabFactory';
import { BuffSystem } from './buffs/BuffSystem';

const { ccclass, property } = _decorator;

/**
 * EnemyController - 敌人控制器
 *
 * 职责：
 *  - 管理所有活动敌人的创建、更新、回收
 *  - 使用对象池复用敌人节点
 *  - 统计存活数量，通知 WaveManager 检查波次完成
 *  - 提供敌人查询（范围内最近、范围内所有）
 */
@ccclass('EnemyController')
export class EnemyController extends Component {
    @property({ type: Node, tooltip: '敌人容器节点' })
    public enemyContainer: Node | null = null;

    @property({ type: [Prefab], tooltip: '敌人预制体（按 EnemyType 顺序）' })
    public enemyPrefabs: Prefab[] = [];

    private _enemies: Enemy[] = [];
    private _pools: Map<EnemyType, ObjectPool> = new Map();
    private _gsm: any = null;  // GameStateManager
    private _waveManager: any = null;  // WaveManager
    private _buffSystem: BuffSystem | null = null;  // BuffSystem

    /** 敌人默认属性 */
    private readonly _defaultProps: Map<EnemyType, { hp: number; speed: number; gold: number; livesCost: number }> = new Map([
        [EnemyType.NORMAL, { hp: 100, speed: 80, gold: 10, livesCost: 1 }],
        [EnemyType.FAST, { hp: 60, speed: 160, gold: 15, livesCost: 1 }],
        [EnemyType.TANK, { hp: 400, speed: 40, gold: 30, livesCost: 2 }],
        [EnemyType.BOSS, { hp: 1000, speed: 50, gold: 100, livesCost: 5 }],
    ]);

    public setGameStateManager(gsm: any): void { this._gsm = gsm; }
    public setWaveManager(wm: any): void { this._waveManager = wm; }
    public setBuffSystem(bs: BuffSystem): void { this._buffSystem = bs; }

    protected update(dt: number): void {
        // 每帧更新 BuffSystem，处理 DOT 伤害
        if (this._buffSystem) {
            const dotResults = this._buffSystem.update(dt);
            // 应用 DOT 伤害到对应敌人
            for (const result of dotResults) {
                const enemy = this._enemies.find(e => e.Uuid === result.uuid);
                if (enemy && !enemy.IsDead) {
                    enemy.takeDoTDamage(result.damage);
                }
            }
        }
    }

    /** 初始化对象池（使用 Prefab） */
    public initPools(): void {
        const types = [EnemyType.NORMAL, EnemyType.FAST, EnemyType.TANK, EnemyType.BOSS];
        for (let i = 0; i < types.length; i++) {
            if (i < this.enemyPrefabs.length && this.enemyPrefabs[i]) {
                const pool = new ObjectPool();
                pool.init(this.enemyPrefabs[i], 5, this.enemyContainer ?? undefined);
                this._pools.set(types[i], pool);
            }
        }
    }

    /** 使用运行时生成的 Node 模板初始化池（无美术资源时） */
    public initWithTemplates(): void {
        const types = [EnemyType.NORMAL, EnemyType.FAST, EnemyType.TANK, EnemyType.BOSS];
        for (const type of types) {
            const template = createEnemyNode(type);
            // 给模板添加 Enemy 组件
            template.addComponent(Enemy);
            const pool = new ObjectPool();
            pool.initWithTemplate(template, 5, this.enemyContainer ?? undefined);
            this._pools.set(type, pool);
        }
    }

    /** 设置预制体并初始化池 */
    public setPrefabs(prefabs: Prefab[]): void {
        this.enemyPrefabs = prefabs;
        this.initPools();
    }

    /** 生成敌人 */
    public spawnEnemy(type: EnemyType, pathManager: any): void {
        const pool = this._pools.get(type);
        if (!pool) {
            console.warn(`EnemyController: 未找到类型 ${type} 的对象池`);
            return;
        }

        const node = pool.get(this.enemyContainer ?? undefined);
        const enemy = node.getComponent(Enemy);
        if (!enemy) {
            console.warn('EnemyController: 预制体上缺少 Enemy 组件');
            pool.put(node);
            return;
        }

        const props = this._defaultProps.get(type);
        if (props) {
            enemy.maxHp = props.hp;
            enemy.moveSpeed = props.speed;
            enemy.killGold = props.gold;
            enemy.livesCost = props.livesCost;
        }
        enemy.enemyType = type;
        enemy.buffSystem = this._buffSystem;  // 注入 BuffSystem
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
    }

    private onEnemyKilled(enemy: Enemy, pool: ObjectPool): void {
        this._gsm?.Currency?.addGold(enemy.killGold);
        this._gsm?.emit(GameEvents.ENEMY_KILLED);
        this.removeEnemy(enemy, pool);
    }

    private onEnemyReachedEnd(enemy: Enemy, pool: ObjectPool): void {
        this._gsm?.loseLife(enemy.livesCost);
        this._gsm?.emit(GameEvents.ENEMY_REACHED_END);
        this.removeEnemy(enemy, pool);
    }

    private removeEnemy(enemy: Enemy, pool: ObjectPool): void {
        const idx = this._enemies.indexOf(enemy);
        if (idx >= 0) this._enemies.splice(idx, 1);
        pool.put(enemy.node);

        if (this._enemies.length === 0) {
            this.node.emit(GameEvents.ENEMIES_CLEARED);
            this._waveManager?.checkWaveComplete();
        }
    }

    /** 获取所有存活敌人 */
    public get Enemies(): Enemy[] { return this._enemies; }
    public get AliveCount(): number { return this._enemies.length; }

    /** 获取范围内最近的敌人 */
    public getNearestEnemy(position: Vec3, range: number): Enemy | null {
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

    /** 获取范围内所有敌人 */
    public getEnemiesInRange(position: Vec3, range: number): Enemy[] {
        const result: Enemy[] = [];
        for (const enemy of this._enemies) {
            if (enemy.IsDead) continue;
            const dist = Vec3.distance(position, enemy.node.position);
            if (dist <= range) result.push(enemy);
        }
        return result;
    }

    /** 清除所有敌人 */
    public clearAll(): void {
        for (const enemy of this._enemies) {
            if (enemy.node.isValid) enemy.node.destroy();
        }
        this._enemies.length = 0;
    }
}
