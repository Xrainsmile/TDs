import { _decorator, Component, Vec3 } from 'cc';
import { TowerType, EnemyType } from '../core/Constants';
import { Enemy } from '../enemies/Enemy';
import { BulletManager } from '../bullets/BulletManager';

const { ccclass, property } = _decorator;

/**
 * Tower - 塔基类
 *
 * 职责：
 *  - 攻击范围内的敌人
 *  - 发射子弹
 *  - 升级/出售
 */
@ccclass('Tower')
export class Tower extends Component {
    @property({ tooltip: '攻击范围' })
    public attackRange: number = 120;

    @property({ tooltip: '攻击伤害' })
    public attackDamage: number = 20;

    @property({ tooltip: '攻击间隔（秒）' })
    public attackInterval: number = 1.0;

    @property({ tooltip: '塔等级' })
    public level: number = 1;

    @property({ tooltip: '最大等级' })
    public maxLevel: number = 3;

    /** 塔类型 */
    public towerType: TowerType = TowerType.ARROW;

    /** 子弹管理器引用 */
    public bulletManager: BulletManager | null = null;

    /** 敌人管理器引用（通过回调获取敌人） */
    public getEnemiesInRange: ((pos: Vec3, range: number) => Enemy[]) | null = null;

    private _attackTimer: number = 0;
    private _totalCost: number = 0;

    protected update(dt: number): void {
        this._attackTimer += dt;
        if (this._attackTimer >= this.attackInterval) {
            this._attackTimer = 0;
            this.tryAttack();
        }
    }

    private tryAttack(): void {
        if (!this.getEnemiesInRange) return;

        const enemies = this.getEnemiesInRange(this.node.position, this.attackRange);
        if (enemies.length === 0) return;

        // 选择最前面的敌人（最接近终点）
        const target = this.selectTarget(enemies);
        if (!target) return;

        this.attack(target);
    }

    /**
     * 选择目标策略：优先攻击最接近终点的敌人
     */
    protected selectTarget(enemies: Enemy[]): Enemy | null {
        // 默认：选择距离塔最近的敌人
        // 子类可重写以实现不同策略
        let nearest: Enemy | null = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
            const dist = Vec3.distance(this.node.position, enemy.node.position);
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    /**
     * 执行攻击（发射子弹）
     */
    protected attack(target: Enemy): void {
        if (this.bulletManager) {
            this.bulletManager.fire(
                this.node.position,
                target,
                this.attackDamage,
                this.towerType,
            );
        }
    }

    /**
     * 升级塔
     */
    public upgrade(): boolean {
        if (this.level >= this.maxLevel) return false;
        this.level++;
        this.attackDamage = Math.floor(this.attackDamage * 1.5);
        this.attackRange = Math.floor(this.attackRange * 1.2);
        this.attackInterval = Math.max(0.2, this.attackInterval * 0.9);
        return true;
    }

    /**
     * 出售塔（返还 70% 总投入）
     */
    public get SellValue(): number {
        return Math.floor(this._totalCost * 0.7);
    }

    public set TotalCost(value: number) {
        this._totalCost = value;
    }

    public get TotalCost(): number {
        return this._totalCost;
    }

    public get CanUpgrade(): boolean {
        return this.level < this.maxLevel;
    }
}
