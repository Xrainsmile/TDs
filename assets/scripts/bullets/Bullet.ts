import { _decorator, Component, Vec3, Node } from 'cc';
import { TowerType } from '../core/Constants';
import { Enemy } from '../enemies/Enemy';

const { ccclass, property } = _decorator;

/**
 * Bullet - 子弹基类
 *
 * 负责子弹飞行、命中检测、伤害结算
 */
@ccclass('Bullet')
export class Bullet extends Component {
    /** 飞行速度 */
    public speed: number = 400;

    /** 伤害值 */
    public damage: number = 20;

    /** 塔类型（决定子弹效果） */
    public towerType: TowerType = TowerType.ARROW;

    /** 溅射范围（炮塔专用，0 表示无溅射） */
    public splashRadius: number = 0;

    /** 减速效果（魔法塔专用，1 表示无减速） */
    public slowMultiplier: number = 1;

    /** 减速持续时间 */
    public slowDuration: number = 0;

    private _target: Enemy | null = null;
    private _direction: Vec3 = new Vec3(0, 0, 0);
    private _isHoming: boolean = false;
    private _onHit: (() => void) | null = null;

    // --- 生命周期 ---

    protected update(dt: number): void {
        if (!this.node.active) return;

        if (this._isHoming && this._target && !this._target.IsDead) {
            // 追踪目标
            const targetPos = this._target.node.position;
            const pos = this.node.position;
            this._direction.set(
                targetPos.x - pos.x,
                targetPos.y - pos.y,
                0,
            );
            const dist = Vec3.len(this._direction);
            if (dist > 0) {
                this._direction.x /= dist;
                this._direction.y /= dist;
            }
        }

        // 移动
        const pos = this.node.position;
        this.node.position = new Vec3(
            pos.x + this._direction.x * this.speed * dt,
            pos.y + this._direction.y * this.speed * dt,
            0,
        );

        // 检查命中
        this.checkHit();
    }

    /**
     * 发射子弹
     */
    public fire(startPos: Vec3, target: Enemy, onHit: () => void): void {
        this.node.position = startPos;
        this._target = target;
        this._onHit = onHit;
        this._isHoming = true;

        // 初始方向
        const targetPos = target.node.position;
        this._direction.set(
            targetPos.x - startPos.x,
            targetPos.y - startPos.y,
            0,
        );
        const dist = Vec3.len(this._direction);
        if (dist > 0) {
            this._direction.x /= dist;
            this._direction.y /= dist;
        }
    }

    /**
     * 直线发射（不追踪）
     */
    public fireStraight(startPos: Vec3, direction: Vec3, onHit: () => void): void {
        this.node.position = startPos;
        this._isHoming = false;
        this._onHit = onHit;
        const dist = Vec3.len(direction);
        if (dist > 0) {
            this._direction.set(direction.x / dist, direction.y / dist, 0);
        }
    }

    private checkHit(): void {
        if (!this._target || this._target.IsDead) {
            if (!this._isHoming) {
                // 直线弹继续飞行直到出界
                return;
            }
            // 目标已死，子弹消失
            this.onBulletEnd();
            return;
        }

        const dist = Vec3.distance(this.node.position, this._target.node.position);
        if (dist < 16) {
            // 命中
            this.onHit();
        }
    }

    private onHit(): void {
        if (this._target && !this._target.IsDead) {
            this._target.takeDamage(this.damage);

            // 减速效果
            if (this.slowMultiplier < 1) {
                this._target.applySlow(this.slowMultiplier, this.slowDuration);
            }

            // 溅射伤害
            if (this.splashRadius > 0) {
                // TODO: 获取范围内敌人并造成溅射伤害
                // 需要 EnemyManager 引用
            }
        }
        this.onBulletEnd();
    }

    private onBulletEnd(): void {
        this._target = null;
        this._onHit?.();
    }

    /**
     * 重置子弹状态（归还对象池前调用）
     */
    public resetBullet(): void {
        this._target = null;
        this._isHoming = false;
        this._onHit = null;
        this.damage = 20;
        this.splashRadius = 0;
        this.slowMultiplier = 1;
        this.slowDuration = 0;
    }
}
