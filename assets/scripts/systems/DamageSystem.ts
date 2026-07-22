import { _decorator, Component, Vec3 } from 'cc';
import { Enemy } from '../entities/Enemy';

const { ccclass } = _decorator;

/**
 * DamageSystem - 伤害系统
 *
 * 职责：
 *  - 统一处理伤害结算逻辑
 *  - 支持直接伤害、溅射伤害、减速效果
 *  - 敌人死亡时通知（回调）
 */
@ccclass('DamageSystem')
export class DamageSystem extends Component {

    /**
     * 对单个敌人造成伤害
     * @returns 敌人是否因此死亡
     */
    public dealDamage(target: Enemy, damage: number): boolean {
        if (target.IsDead) return false;
        target.takeDamage(damage);
        return target.IsDead;
    }

    /**
     * 对范围内所有敌人造成溅射伤害
     */
    public dealSplashDamage(center: Vec3, radius: number, damage: number, enemies: Enemy[]): number {
        let killed = 0;
        for (const enemy of enemies) {
            if (enemy.IsDead) continue;
            const dist = Vec3.distance(center, enemy.node.position);
            if (dist <= radius) {
                // 距离衰减：边缘 50% 伤害
                const falloff = 1 - (dist / radius) * 0.5;
                const actualDamage = damage * falloff;
                if (this.dealDamage(enemy, actualDamage)) {
                    killed++;
                }
            }
        }
        return killed;
    }

    /**
     * 施加减速效果
     */
    public applySlow(target: Enemy, multiplier: number, duration: number): void {
        target.applySlow(multiplier, duration);
    }
}
