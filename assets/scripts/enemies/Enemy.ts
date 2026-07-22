import { _decorator, Component, Vec3, Node } from 'cc';
import { EnemyType } from '../core/Constants';

const { ccclass, property } = _decorator;

/**
 * Enemy - 敌人基类
 *
 * 负责单个敌人的生命值、移动、状态管理
 */
@ccclass('Enemy')
export class Enemy extends Component {
    @property({ tooltip: '最大生命值' })
    public maxHp: number = 100;

    @property({ tooltip: '移动速度（像素/秒）' })
    public moveSpeed: number = 80;

    @property({ tooltip: '到达终点扣除的生命值' })
    public livesCost: number = 1;

    @property({ tooltip: '击杀奖励金币' })
    public killGold: number = 10;

    /** 敌人类型 */
    public enemyType: EnemyType = EnemyType.NORMAL;

    private _hp: number = 0;
    private _currentWaypoint: number = 0;
    private _pathWaypoints: Vec3[] = [];
    private _isDead: boolean = false;
    private _isSlowed: boolean = false;
    private _slowMultiplier: number = 1;
    private _slowTimer: number = 0;

    /** 当前路径管理器回调 */
    private _onReachedEnd: (() => void) | null = null;
    private _onKilled: (() => void) | null = null;

    // --- 生命周期 ---

    protected onEnable(): void {
        this.reset();
    }

    public reset(): void {
        this._hp = this.maxHp;
        this._currentWaypoint = 0;
        this._isDead = false;
        this._isSlowed = false;
        this._slowMultiplier = 1;
        this._slowTimer = 0;
    }

    protected update(dt: number): void {
        if (this._isDead) return;

        // 处理减速计时
        if (this._isSlowed) {
            this._slowTimer -= dt;
            if (this._slowTimer <= 0) {
                this._isSlowed = false;
                this._slowMultiplier = 1;
            }
        }

        this.moveAlongPath(dt);
    }

    // --- 路径移动 ---

    /**
     * 设置路径
     */
    public setPath(waypoints: Vec3[], onReachedEnd: () => void, onKilled: () => void): void {
        this._pathWaypoints = waypoints;
        this._currentWaypoint = 0;
        this._onReachedEnd = onReachedEnd;
        this._onKilled = onKilled;

        if (waypoints.length > 0) {
            this.node.position = waypoints[0];
        }
    }

    private moveAlongPath(dt: number): void {
        if (this._pathWaypoints.length < 2) return;

        const speed = this.moveSpeed * this._slowMultiplier;
        const target = this._pathWaypoints[this._currentWaypoint + 1];
        if (!target) return;

        const pos = this.node.position;
        const dir = new Vec3(
            target.x - pos.x,
            target.y - pos.y,
            0,
        );
        const dist = Vec3.len(dir);

        if (dist < 2) {
            this._currentWaypoint++;
            if (this._currentWaypoint >= this._pathWaypoints.length - 1) {
                this.reachedEnd();
            }
            return;
        }

        // 归一化方向并移动
        dir.x /= dist;
        dir.y /= dist;
        this.node.position = new Vec3(
            pos.x + dir.x * speed * dt,
            pos.y + dir.y * speed * dt,
            0,
        );

        // 朝向
        this.node.angle = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
    }

    // --- 伤害 ---

    /**
     * 受到伤害
     */
    public takeDamage(damage: number): void {
        if (this._isDead) return;
        this._hp -= damage;
        if (this._hp <= 0) {
            this.die();
        }
    }

    /**
     * 施加减速效果
     */
    public applySlow(multiplier: number, duration: number): void {
        if (multiplier < this._slowMultiplier) {
            this._slowMultiplier = multiplier;
        }
        this._slowTimer = Math.max(this._slowTimer, duration);
        this._isSlowed = true;
    }

    private die(): void {
        if (this._isDead) return;
        this._isDead = true;
        this._onKilled?.();
    }

    private reachedEnd(): void {
        if (this._isDead) return;
        this._isDead = true;
        this._onReachedEnd?.();
    }

    // --- Getters ---

    public get Hp(): number {
        return this._hp;
    }

    public get IsDead(): boolean {
        return this._isDead;
    }

    public get HpRatio(): number {
        return this.maxHp > 0 ? this._hp / this.maxHp : 0;
    }
}
