import { _decorator, Component, Vec3 } from 'cc';
import { TowerType } from '../core/Constants';
import { Enemy } from './Enemy';

const { ccclass, property } = _decorator;

/**
 * Projectile - 子弹实体
 *
 * 负责子弹飞行、追踪、命中检测
 */
@ccclass('Projectile')
export class Projectile extends Component {
    @property({ tooltip: '飞行速度' })
    public speed: number = 400;

    @property({ tooltip: '伤害值' })
    public damage: number = 20;

    public towerType: TowerType = TowerType.ARROW;
    public splashRadius: number = 0;
    public slowMultiplier: number = 1;
    public slowDuration: number = 0;

    private _target: Enemy | null = null;
    private _direction: Vec3 = new Vec3(0, 0, 0);
    private _isHoming: boolean = false;
    private _onHit: (() => void) | null = null;

    protected update(dt: number): void {
        if (!this.node.active) return;

        if (this._isHoming && this._target && !this._target.IsDead) {
            const targetPos = this._target.node.position;
            const pos = this.node.position;
            this._direction.set(targetPos.x - pos.x, targetPos.y - pos.y, 0);
            const dist = Vec3.len(this._direction);
            if (dist > 0) {
                this._direction.x /= dist;
                this._direction.y /= dist;
            }
        }

        const pos = this.node.position;
        this.node.position = new Vec3(
            pos.x + this._direction.x * this.speed * dt,
            pos.y + this._direction.y * this.speed * dt,
            0,
        );

        this.checkHit();
    }

    /** 发射（追踪模式） */
    public fire(startPos: Vec3, target: Enemy, onHit: () => void): void {
        this.node.position = startPos;
        this._target = target;
        this._onHit = onHit;
        this._isHoming = true;

        const targetPos = target.node.position;
        this._direction.set(targetPos.x - startPos.x, targetPos.y - startPos.y, 0);
        const dist = Vec3.len(this._direction);
        if (dist > 0) {
            this._direction.x /= dist;
            this._direction.y /= dist;
        }
    }

    private checkHit(): void {
        if (!this._target || this._target.IsDead) {
            if (!this._isHoming) return;
            this.onBulletEnd();
            return;
        }

        const dist = Vec3.distance(this.node.position, this._target.node.position);
        if (dist < 16) {
            this.onBulletEnd();
        }
    }

    private onBulletEnd(): void {
        this._target = null;
        this._onHit?.();
    }

    /** 重置（归还对象池前调用） */
    public resetProjectile(): void {
        this._target = null;
        this._isHoming = false;
        this._onHit = null;
        this.damage = 20;
        this.splashRadius = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
    }
}
