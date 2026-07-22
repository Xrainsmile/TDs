import { _decorator, Component, Vec3, Graphics, Color, UITransform } from 'cc';
import { EnemyType } from '../core/Constants';
import { BuffSystem } from '../systems/buffs/BuffSystem';
import { BuffType } from '../systems/buffs/BuffTypes';

const { ccclass, property } = _decorator;

/** 敌人外观配置 */
const ENEMY_VISUALS: Map<EnemyType, { color: Color; size: number; shape: 'circle' | 'triangle' | 'square' | 'star' }> = new Map([
    [EnemyType.NORMAL, { color: new Color(80, 200, 80, 255), size: 14, shape: 'circle' }],
    [EnemyType.FAST, { color: new Color(255, 200, 50, 255), size: 14, shape: 'triangle' }],
    [EnemyType.TANK, { color: new Color(120, 120, 140, 255), size: 18, shape: 'square' }],
    [EnemyType.BOSS, { color: new Color(220, 50, 50, 255), size: 22, shape: 'star' }],
]);

/**
 * Enemy - 敌人实体
 *
 * 职责（精简后）：
 *  - 移动（查询 BuffSystem 获取速度倍率）
 *  - 血量
 *  - 死亡通知
 *
 * 不再负责：
 *  - 减速效果（由 BuffSystem 管理）
 *  - 燃烧/中毒/DOT（由 BuffSystem 管理）
 *  - 诅咒/标记等特殊效果（由 BuffSystem 管理）
 *
 * 新增 Buff 时无需修改此类
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

    public enemyType: EnemyType = EnemyType.NORMAL;

    /** BuffSystem 引用（由 EnemyController 注入） */
    public buffSystem: BuffSystem | null = null;

    private _hp: number = 0;
    private _currentWaypoint: number = 0;
    private _pathWaypoints: Vec3[] = [];
    private _isDead: boolean = false;
    private _onReachedEnd: (() => void) | null = null;
    private _onKilled: (() => void) | null = null;

    /** 唯一标识（用于 BuffSystem 索引） */
    private _uuid: number = 0;
    private static _nextUuid: number = 1;

    protected onEnable(): void {
        this._uuid = Enemy._nextUuid++;
        this.reset();
        this.redraw();
    }

    public reset(): void {
        this._hp = this.maxHp;
        this._currentWaypoint = 0;
        this._isDead = false;
        if (this.buffSystem) {
            this.buffSystem.clearBuffs(this._uuid);
        }
    }

    protected update(dt: number): void {
        if (this._isDead) return;

        // 从 BuffSystem 获取速度倍率（减速/冻结/眩晕）
        let speedMultiplier = 1;
        if (this.buffSystem) {
            speedMultiplier = this.buffSystem.getMoveSpeedMultiplier(this._uuid);
        }

        if (speedMultiplier > 0) {
            this.moveAlongPath(dt, speedMultiplier);
        }
    }

    /** 设置路径 */
    public setPath(waypoints: Vec3[], onReachedEnd: () => void, onKilled: () => void): void {
        this._pathWaypoints = waypoints;
        this._currentWaypoint = 0;
        this._onReachedEnd = onReachedEnd;
        this._onKilled = onKilled;
        if (waypoints.length > 0) {
            this.node.position = waypoints[0];
        }
    }

    private moveAlongPath(dt: number, speedMultiplier: number): void {
        if (this._pathWaypoints.length < 2) return;

        const speed = this.moveSpeed * speedMultiplier;
        const target = this._pathWaypoints[this._currentWaypoint + 1];
        if (!target) return;

        const pos = this.node.position;
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
            this._currentWaypoint++;
            if (this._currentWaypoint >= this._pathWaypoints.length - 1) {
                this.reachedEnd();
            }
            return;
        }

        this.node.position = new Vec3(
            pos.x + (dx / dist) * speed * dt,
            pos.y + (dy / dist) * speed * dt,
            0,
        );
        this.node.angle = Math.atan2(dy, dx) * 180 / Math.PI;
    }

    /**
     * 受到伤害
     * @param damage 原始伤害值
     * @returns 实际造成的伤害（考虑 MARK 等增伤 Buff）
     */
    public takeDamage(damage: number): number {
        if (this._isDead) return 0;

        // 查询增伤 Buff
        let actualDamage = damage;
        if (this.buffSystem) {
            actualDamage = damage * this.buffSystem.getDamageMultiplier(this._uuid);
        }

        this._hp -= actualDamage;
        if (this._hp <= 0) {
            this.die();
        }
        return actualDamage;
    }

    /**
     * 直接受到 DOT 伤害（由 BuffSystem 调用）
     * 不触发增伤 Buff，避免无限循环
     */
    public takeDotDamage(damage: number): void {
        if (this._isDead) return;
        this._hp -= damage;
        if (this._hp <= 0) {
            this.die();
        }
    }

    private die(): void {
        if (this._isDead) return;
        this._isDead = true;

        // 通知 BuffSystem 处理死亡触发效果（诅咒爆炸等）
        if (this.buffSystem) {
            this.buffSystem.onEnemyDeath(this._uuid);
        }

        this._onKilled?.();
    }

    private reachedEnd(): void {
        if (this._isDead) return;
        this._isDead = true;
        if (this.buffSystem) {
            this.buffSystem.clearBuffs(this._uuid);
        }
        this._onReachedEnd?.();
    }

    public get Uuid(): number { return this._uuid; }
    public get Hp(): number { return this._hp; }
    public get IsDead(): boolean { return this._isDead; }
    public get HpRatio(): number { return this.maxHp > 0 ? this._hp / this.maxHp : 0; }

    /** 重新绘制敌人形状 */
    private redraw(): void {
        let gfx = this.node.getComponent(Graphics);
        if (!gfx) {
            gfx = this.node.addComponent(Graphics);
        }
        gfx.clear();

        const visual = ENEMY_VISUALS.get(this.enemyType);
        if (!visual) return;

        const transform = this.node.getComponent(UITransform);
        if (transform) {
            transform.setContentSize(visual.size * 2, visual.size * 2);
        }

        gfx.fillColor = visual.color;
        switch (visual.shape) {
            case 'circle':
                gfx.circle(0, 0, visual.size);
                gfx.fill();
                break;
            case 'triangle':
                gfx.moveTo(0, visual.size);
                gfx.lineTo(-visual.size * 0.866, -visual.size * 0.5);
                gfx.lineTo(visual.size * 0.866, -visual.size * 0.5);
                gfx.close();
                gfx.fill();
                break;
            case 'square':
                gfx.rect(-visual.size, -visual.size, visual.size * 2, visual.size * 2);
                gfx.fill();
                break;
            case 'star':
                for (let i = 0; i < 6; i++) {
                    const angle = (i / 6) * Math.PI * 2;
                    const x = Math.cos(angle) * visual.size;
                    const y = Math.sin(angle) * visual.size;
                    if (i === 0) gfx.moveTo(x, y);
                    else gfx.lineTo(x, y);
                }
                gfx.close();
                gfx.fill();
                break;
        }
    }
}
