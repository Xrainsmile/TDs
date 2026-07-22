import { _decorator, Component, Node, Prefab, Vec3 } from 'cc';
import { TowerType } from '../core/Constants';
import { Enemy } from '../enemies/Enemy';
import { Bullet } from './Bullet';
import { ObjectPool } from '../utils/ObjectPool';

const { ccclass, property } = _decorator;

/**
 * BulletManager - 子弹管理器
 *
 * 职责：
 *  - 管理子弹的创建与回收（对象池）
 *  - 根据塔类型设置子弹属性
 *  - 提供统一的发射接口
 */
@ccclass('BulletManager')
export class BulletManager extends Component {
    @property({ type: Node, tooltip: '子弹容器节点' })
    public bulletContainer: Node | null = null;

    @property({ type: [Prefab], tooltip: '子弹预制体（按 TowerType 顺序）' })
    public bulletPrefabs: Prefab[] = [];

    private _pools: Map<TowerType, ObjectPool> = new Map();

    protected onLoad(): void {
        this.initPools();
    }

    private initPools(): void {
        const types = [TowerType.ARROW, TowerType.CANNON, TowerType.MAGIC];
        for (let i = 0; i < types.length; i++) {
            if (i < this.bulletPrefabs.length && this.bulletPrefabs[i]) {
                const pool = new ObjectPool();
                pool.init(this.bulletPrefabs[i], 20, this.bulletContainer ?? undefined);
                this._pools.set(types[i], pool);
            }
        }
    }

    /**
     * 发射子弹
     * @param startPos 发射起点
     * @param target 目标敌人
     * @param damage 伤害值
     * @param towerType 塔类型（决定子弹属性）
     */
    public fire(startPos: Vec3, target: Enemy, damage: number, towerType: TowerType): void {
        const pool = this._pools.get(towerType);
        if (!pool) {
            console.warn(`BulletManager: 未找到类型 ${towerType} 的子弹池`);
            return;
        }

        const node = pool.get(this.bulletContainer ?? undefined);
        const bullet = node.getComponent(Bullet);
        if (!bullet) {
            console.warn('BulletManager: 预制体上缺少 Bullet 组件');
            pool.put(node);
            return;
        }

        // 根据塔类型设置子弹属性
        this.configureBullet(bullet, damage, towerType);

        bullet.fire(startPos, target, () => {
            bullet.resetBullet();
            pool.put(node);
        });
    }

    /**
     * 根据塔类型配置子弹属性
     */
    private configureBullet(bullet: Bullet, damage: number, towerType: TowerType): void {
        bullet.damage = damage;
        bullet.towerType = towerType;

        switch (towerType) {
            case TowerType.ARROW:
                bullet.speed = 500;
                bullet.splashRadius = 0;
                bullet.slowMultiplier = 1;
                break;
            case TowerType.CANNON:
                bullet.speed = 300;
                bullet.splashRadius = 50;
                bullet.slowMultiplier = 1;
                break;
            case TowerType.MAGIC:
                bullet.speed = 400;
                bullet.splashRadius = 0;
                bullet.slowMultiplier = 0.5;
                bullet.slowDuration = 2.0;
                break;
        }
    }

    /**
     * 清除所有子弹
     */
    public clearAll(): void {
        for (const pool of this._pools.values()) {
            pool.clear();
        }
    }
}
