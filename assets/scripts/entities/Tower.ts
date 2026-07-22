import { _decorator, Component, Vec3 } from 'cc';
import { TowerType, GameConfig } from '../core/Constants';
import { Enemy } from './Enemy';
import { ProjectileController } from '../systems/ProjectileController';

const { ccclass, property } = _decorator;

/**
 * Tower - 塔实体
 *
 * 职责：
 *  - 攻击范围内的敌人
 *  - 发射子弹
 *  - 升级/出售
 */
@ccclass('Tower')
export class Tower extends Component {
    @property({ tooltip: '攻击范围' })
    public attackRange: number = 140;

    @property({ tooltip: '攻击伤害' })
    public attackDamage: number = 15;

    @property({ tooltip: '攻击间隔（秒）' })
    public attackInterval: number = 0.8;

    @property({ tooltip: '塔等级' })
    public level: number = 1;

    @property({ tooltip: '最大等级' })
    public maxLevel: number = 3;

    public towerType: TowerType = TowerType.ARROW;
    public projectileController: ProjectileController | null = null;
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

        const target = this.selectTarget(enemies);
        if (!target) return;
        this.attack(target);
    }

    /** 选择目标：最近的敌人 */
    protected selectTarget(enemies: Enemy[]): Enemy | null {
        let nearest: Enemy | null = null;
        let minDist = Infinity;
        for (const enemy of enemies) {
            const dist = Vec3.distance(this.node.position, enemy.node.position);
            if (dist < minDist) { minDist = dist; nearest = enemy; }
        }
        return nearest;
    }

    /** 发射子弹 */
    protected attack(target: Enemy): void {
        if (this.projectileController) {
            this.projectileController.fire(
                this.node.position, target, this.attackDamage, this.towerType
            );
        }
    }

    /** 升级 */
    public upgrade(growth: { attackRange: number; attackDamage: number; attackInterval: number }): boolean {
        if (this.level >= this.maxLevel) return false;
        this.level++;
        this.attackDamage = Math.floor(this.attackDamage * growth.attackDamage);
        this.attackRange = Math.floor(this.attackRange * growth.attackRange);
        this.attackInterval = Math.max(0.2, this.attackInterval * growth.attackInterval);
        return true;
    }

    public get SellValue(): number { return Math.floor(this._totalCost * GameConfig.TOWER_SELL_RETURN_RATIO); }
    public set TotalCost(v: number) { this._totalCost = v; }
    public get TotalCost(): number { return this._totalCost; }
    public get CanUpgrade(): boolean { return this.level < this.maxLevel; }
}
