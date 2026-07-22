import { _decorator, Component, Vec3 } from 'cc';
import { Enemy } from '../entities/Enemy';
import { BuffSystem } from './buffs/BuffSystem';
import { BuffType } from './buffs/BuffTypes';

const { ccclass, property } = _decorator;

/**
 * DamageSystem - 伤害结算系统
 *
 * 职责：
 *  - 统一处理伤害结算逻辑
 *  - 支持直接伤害、溅射伤害、DOT 触发
 *  - 通过 BuffSystem 施加 Buff（燃烧/中毒/减速等）
 *
 * 与 BuffSystem 协作：
 *  - DamageSystem 负责"一次性伤害 + 触发 Buff"
 *  - BuffSystem 负责"持续效果管理（DOT/CC/叠加）"
 */
@ccclass('DamageSystem')
export class DamageSystem extends Component {
    @property({ type: BuffSystem, tooltip: 'Buff 系统' })
    public buffSystem: BuffSystem | null = null;

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
     * 施加 Buff（替代原来的 applySlow）
     */
    public applyBuff(target: Enemy, type: BuffType, stacks: number = 1): void {
        if (this.buffSystem && !target.IsDead) {
            this.buffSystem.applyBuff(target.Uuid, type, stacks);
        }
    }

    /**
     * 施加减速（快捷方法）
     */
    public applySlow(target: Enemy, multiplier: number, duration: number): void {
        if (!this.buffSystem || target.IsDead) return;
        // 注册临时减速 Buff 配置
        this.buffSystem.registerBuff({
            type: BuffType.SLOW,
            name: '减速',
            category: 'cc' as any,
            duration,
            tickInterval: 0,
            tickDamage: 0,
            moveSpeedMultiplier: multiplier,
            maxStacks: 1,
            canRefresh: true,
        });
        this.buffSystem.applyBuff(target.Uuid, BuffType.SLOW);
    }

    /**
     * 施加燃烧（快捷方法）
     */
    public applyBurn(target: Enemy, stacks: number = 1): void {
        this.applyBuff(target, BuffType.BURN, stacks);
    }

    /**
     * 施加中毒（快捷方法）
     */
    public applyPoison(target: Enemy, stacks: number = 1): void {
        this.applyBuff(target, BuffType.POISON, stacks);
    }

    /**
     * 施加冻结（快捷方法）
     */
    public applyFreeze(target: Enemy): void {
        this.applyBuff(target, BuffType.FREEZE);
    }

    /**
     * 施加流血（快捷方法）
     */
    public applyBleed(target: Enemy, stacks: number = 1): void {
        this.applyBuff(target, BuffType.BLEED, stacks);
    }

    /**
     * 施加标记（快捷方法）
     */
    public applyMark(target: Enemy): void {
        this.applyBuff(target, BuffType.MARK);
    }

    /**
     * 施加诅咒（快捷方法，死亡时爆炸）
     */
    public applyCurse(target: Enemy): void {
        this.applyBuff(target, BuffType.CURSE);
    }
}
