import { _decorator, Component, Node, Prefab, Vec3 } from 'cc';
import { TowerType } from '../core/Constants';
import { Projectile } from '../entities/Projectile';
import { Enemy } from '../entities/Enemy';
import { ObjectPool } from '../utils/ObjectPool';
import { DamageSystem } from './DamageSystem';
import { EnemyController } from './EnemyController';
import { createProjectileNode } from '../utils/PrefabFactory';
import { BuffType } from './buffs/BuffTypes';

const { ccclass, property } = _decorator;

/**
 * ProjectileController - 子弹控制器
 *
 * 职责：
 *  - 管理子弹的创建与回收（对象池）
 *  - 根据塔类型设置子弹属性
 *  - 统一发射接口
 *  - 命中时调用 DamageSystem 结算伤害
 */
@ccclass('ProjectileController')
export class ProjectileController extends Component {
    @property({ type: Node, tooltip: '子弹容器节点' })
    public projectileContainer: Node | null = null;

    @property({ type: [Prefab], tooltip: '子弹预制体（按 TowerType 顺序）' })
    public projectilePrefabs: Prefab[] = [];

    @property({ type: DamageSystem, tooltip: '伤害系统' })
    public damageSystem: DamageSystem | null = null;

    @property({ type: EnemyController, tooltip: '敌人控制器（用于溅射）' })
    public enemyController: any = null;  // EnemyController

    private _pools: Map<TowerType, ObjectPool> = new Map();

    protected onLoad(): void {
        this.initPools();
    }

    /** 初始化对象池 */
    public initPools(): void {
        const types = [TowerType.ARROW, TowerType.CANNON, TowerType.MAGIC];
        for (let i = 0; i < types.length; i++) {
            if (i < this.projectilePrefabs.length && this.projectilePrefabs[i]) {
                const pool = new ObjectPool();
                pool.init(this.projectilePrefabs[i], 20, this.projectileContainer ?? undefined);
                this._pools.set(types[i], pool);
            }
        }
    }

    /** 设置预制体并初始化池 */
    public setPrefabs(prefabs: Prefab[]): void {
        this.projectilePrefabs = prefabs;
        this.initPools();
    }

    /** 使用运行时生成的 Node 模板初始化池（无美术资源时） */
    public initWithTemplates(): void {
        const types = [TowerType.ARROW, TowerType.CANNON, TowerType.MAGIC];
        for (const type of types) {
            const template = createProjectileNode(type);
            template.addComponent(Projectile);
            const pool = new ObjectPool();
            pool.initWithTemplate(template, 20, this.projectileContainer ?? undefined);
            this._pools.set(type, pool);
        }
    }

    /** 发射子弹 */
    public fire(startPos: Vec3, target: Enemy, damage: number, towerType: TowerType): void {
        const pool = this._pools.get(towerType);
        if (!pool) {
            console.warn(`ProjectileController: 未找到类型 ${towerType} 的子弹池`);
            return;
        }

        const node = pool.get(this.projectileContainer ?? undefined);
        const projectile = node.getComponent(Projectile);
        if (!projectile) {
            console.warn('ProjectileController: 预制体上缺少 Projectile 组件');
            pool.put(node);
            return;
        }

        this.configureProjectile(projectile, damage, towerType);

        projectile.fire(startPos, target, () => {
            this.onProjectileHit(projectile, target);
            projectile.resetProjectile();
            pool.put(node);
        });
    }

    /** 根据塔类型配置子弹属性 */
    private configureProjectile(proj: Projectile, damage: number, towerType: TowerType): void {
        proj.damage = damage;
        proj.towerType = towerType;

        switch (towerType) {
            case TowerType.ARROW:
                proj.speed = 500;
                proj.splashRadius = 0;
                proj.slowMultiplier = 1;
                proj.slowDuration = 0;
                proj.buffType = null;  // 基础箭塔无 Buff（modifier 可加毒/暴击等）
                break;
            case TowerType.CANNON:
                proj.speed = 300;
                proj.splashRadius = 50;
                proj.slowMultiplier = 1;
                proj.slowDuration = 0;
                proj.buffType = null;
                break;
            case TowerType.MAGIC:
                proj.speed = 400;
                proj.splashRadius = 0;
                proj.slowMultiplier = 0.5;
                proj.slowDuration = 2.0;
                proj.buffType = BuffType.SLOW;  // 魔法塔减速
                proj.buffStacks = 1;
                break;
        }
    }

    /** 子弹命中时的伤害结算 */
    private onProjectileHit(proj: Projectile, target: Enemy): void {
        if (!this.damageSystem) return;

        // 施加 Buff（通过 DamageSystem → BuffSystem）
        if (proj.buffType && !target.IsDead) {
            switch (proj.buffType) {
                case BuffType.SLOW:
                    this.damageSystem.applySlow(target, proj.slowMultiplier, proj.slowDuration);
                    break;
                case BuffType.BURN:
                    this.damageSystem.applyBurn(target, proj.buffStacks);
                    break;
                case BuffType.POISON:
                    this.damageSystem.applyPoison(target, proj.buffStacks);
                    break;
                case BuffType.FREEZE:
                    this.damageSystem.applyFreeze(target);
                    break;
                case BuffType.BLEED:
                    this.damageSystem.applyBleed(target, proj.buffStacks);
                    break;
                case BuffType.MARK:
                    this.damageSystem.applyMark(target);
                    break;
                case BuffType.CURSE:
                    this.damageSystem.applyCurse(target);
                    break;
                default:
                    this.damageSystem.applyBuff(target, proj.buffType, proj.buffStacks);
            }
        }

        // 溅射伤害
        if (proj.splashRadius > 0 && this.enemyController) {
            const enemies = this.enemyController.getEnemiesInRange(proj.node.position, proj.splashRadius);
            this.damageSystem.dealSplashDamage(proj.node.position, proj.splashRadius, proj.damage, enemies);
        } else {
            // 单体伤害
            this.damageSystem.dealDamage(target, proj.damage);
        }
    }

    /** 清除所有子弹 */
    public clearAll(): void {
        for (const pool of this._pools.values()) pool.clear();
    }
}
