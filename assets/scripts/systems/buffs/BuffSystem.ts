import { _decorator, Component } from 'cc';
import { IBuff, BuffType, BuffConfig, BuffCategory } from './BuffTypes';

const { ccclass } = _decorator;

/**
 * BuffSystem - Buff 系统核心
 *
 * 职责：
 *  - 管理所有敌人身上的 Buff
 *  - 统一更新 Buff 持续时间和 DOT 伤害
 *  - 查询敌人的移动速度倍率（受减速/冻结影响）
 *  - 提供工厂方法创建各种 Buff
 *
 * 设计原则：
 *  - Buff 逻辑与 Enemy 实体解耦
 *  - 新增 Buff 类型只需注册配置，无需改 Enemy 代码
 *  - 支持叠加、刷新、互斥等规则
 */
@ccclass('BuffSystem')
export class BuffSystem extends Component {

    // --- Buff 配置注册 ---
    private _buffConfigs: Map<BuffType, BuffConfig> = new Map();

    // --- 敌人身上的 Buff（enemyUuid → buffs[]）---
    private _enemyBuffs: Map<number, IBuff[]> = new Map();

    protected onLoad(): void {
        this.registerDefaultBuffs();
    }

    /**
     * 注册默认 Buff 配置
     */
    private registerDefaultBuffs(): void {
        this.registerBuff({
            type: BuffType.BURN, name: '燃烧', category: BuffCategory.DOT,
            duration: 3, tickInterval: 0.5, tickDamage: 5,
            moveSpeedMultiplier: 1, maxStacks: 3, canRefresh: true,
            effectColor: { r: 255, g: 100, b: 0, a: 255 },
        });
        this.registerBuff({
            type: BuffType.POISON, name: '中毒', category: BuffCategory.DOT,
            duration: 5, tickInterval: 1, tickDamage: 3,
            moveSpeedMultiplier: 1, maxStacks: 5, canRefresh: false,
            effectColor: { r: 100, g: 200, b: 0, a: 255 },
        });
        this.registerBuff({
            type: BuffType.FREEZE, name: '冻结', category: BuffCategory.CC,
            duration: 1.5, tickInterval: 0, tickDamage: 0,
            moveSpeedMultiplier: 0, maxStacks: 1, canRefresh: true,
            effectColor: { r: 100, g: 200, b: 255, a: 255 },
        });
        this.registerBuff({
            type: BuffType.SLOW, name: '减速', category: BuffCategory.CC,
            duration: 2, tickInterval: 0, tickDamage: 0,
            moveSpeedMultiplier: 0.5, maxStacks: 1, canRefresh: true,
            effectColor: { r: 150, g: 150, b: 255, a: 255 },
        });
        this.registerBuff({
            type: BuffType.BLEED, name: '流血', category: BuffCategory.DOT,
            duration: 4, tickInterval: 0.5, tickDamage: 4,
            moveSpeedMultiplier: 1, maxStacks: 3, canRefresh: false,
            effectColor: { r: 200, g: 0, b: 0, a: 255 },
        });
        this.registerBuff({
            type: BuffType.STUN, name: '眩晕', category: BuffCategory.CC,
            duration: 1, tickInterval: 0, tickDamage: 0,
            moveSpeedMultiplier: 0, maxStacks: 1, canRefresh: false,
            effectColor: { r: 255, g: 255, b: 0, a: 255 },
        });
        this.registerBuff({
            type: BuffType.CURSE, name: '诅咒', category: BuffCategory.SPECIAL,
            duration: 999, tickInterval: 0, tickDamage: 0,
            moveSpeedMultiplier: 1, maxStacks: 1, canRefresh: false,
            effectColor: { r: 150, g: 0, b: 200, a: 255 },
        });
        this.registerBuff({
            type: BuffType.MARK, name: '标记', category: BuffCategory.DEBUFF,
            duration: 3, tickInterval: 0, tickDamage: 0,
            moveSpeedMultiplier: 1, maxStacks: 1, canRefresh: true,
            effectColor: { r: 255, g: 200, b: 0, a: 255 },
        });
    }

    /**
     * 注册自定义 Buff 配置（肉鸽 modifier 可用）
     */
    public registerBuff(config: BuffConfig): void {
        this._buffConfigs.set(config.type, config);
    }

    /**
     * 给敌人施加 Buff
     * @returns 实际应用的层数（考虑叠加上限）
     */
    public applyBuff(enemyUuid: number, type: BuffType, extraStacks: number = 1): number {
        const config = this._buffConfigs.get(type);
        if (!config) {
            console.warn(`BuffSystem: 未注册的 Buff 类型 ${type}`);
            return 0;
        }

        let buffs = this._enemyBuffs.get(enemyUuid);
        if (!buffs) {
            buffs = [];
            this._enemyBuffs.set(enemyUuid, buffs);
        }

        // 查找已有的同类型 Buff
        let existing = buffs.find(b => b.type === type);
        if (existing) {
            if (config.canRefresh) {
                existing.remainingTime = config.duration;
            }
            if (existing.stacks < config.maxStacks) {
                existing.stacks = Math.min(config.maxStacks, existing.stacks + extraStacks);
            }
        } else {
            buffs.push({
                type,
                stacks: Math.min(config.maxStacks, extraStacks),
                remainingTime: config.duration,
                config,
            });
        }

        return existing?.stacks ?? Math.min(config.maxStacks, extraStacks);
    }

    /**
     * 更新所有 Buff（每帧调用）
     * @returns 需要造成 DOT 伤害的敌人列表 [{ uuid, damage }]
     */
    public update(dt: number): { uuid: number; damage: number }[] {
        const dotResults: { uuid: number; damage: number }[] = [];

        for (const [enemyUuid, buffs] of this._enemyBuffs) {
            for (let i = buffs.length - 1; i >= 0; i--) {
                const buff = buffs[i];
                buff.remainingTime -= dt;

                // DOT 伤害
                if (buff.config.tickInterval > 0 && buff.config.tickDamage > 0) {
                    // 累积 tick 时间（用 remainingTime 取模判断）
                    const ticksThisFrame = Math.floor(
                        (buff.config.duration - buff.remainingTime) / buff.config.tickInterval
                    ) - Math.floor(
                        (buff.config.duration - buff.remainingTime - dt) / buff.config.tickInterval
                    );
                    if (ticksThisFrame > 0) {
                        const damage = buff.config.tickDamage * buff.stacks * ticksThisFrame;
                        dotResults.push({ uuid: enemyUuid, damage });
                    }
                }

                // 过期移除
                if (buff.remainingTime <= 0) {
                    buffs.splice(i, 1);
                }
            }

            if (buffs.length === 0) {
                this._enemyBuffs.delete(enemyUuid);
            }
        }

        return dotResults;
    }

    /**
     * 获取敌人的移动速度倍率（受所有 CC Buff 影响）
     * @returns 0=完全冻结, 1=正常, 0.5=减速50%
     */
    public getMoveSpeedMultiplier(enemyUuid: number): number {
        const buffs = this._enemyBuffs.get(enemyUuid);
        if (!buffs || buffs.length === 0) return 1;

        let multiplier = 1;
        for (const buff of buffs) {
            if (buff.config.moveSpeedMultiplier < multiplier) {
                multiplier = buff.config.moveSpeedMultiplier;
            }
        }
        return multiplier;
    }

    /**
     * 敌人是否有指定 Buff
     */
    public hasBuff(enemyUuid: number, type: BuffType): boolean {
        const buffs = this._enemyBuffs.get(enemyUuid);
        return buffs?.some(b => b.type === type) ?? false;
    }

    /**
     * 获取敌人身上指定 Buff 的层数
     */
    public getBuffStacks(enemyUuid: number, type: BuffType): number {
        const buffs = this._enemyBuffs.get(enemyUuid);
        const buff = buffs?.find(b => b.type === type);
        return buff?.stacks ?? 0;
    }

    /**
     * 获取敌人受到的额外伤害倍率（MARK 等减益效果）
     */
    public getDamageMultiplier(enemyUuid: number): number {
        if (this.hasBuff(enemyUuid, BuffType.MARK)) return 1.5;
        return 1;
    }

    /**
     * 敌人死亡时触发的效果（CURSE 诅咒爆炸等）
     */
    public onEnemyDeath(enemyUuid: number): { type: BuffType; stacks: number }[] {
        const buffs = this._enemyBuffs.get(enemyUuid);
        if (!buffs) return [];

        const triggers: { type: BuffType; stacks: number }[] = [];
        for (const buff of buffs) {
            if (buff.type === BuffType.CURSE) {
                triggers.push({ type: BuffType.CURSE, stacks: buff.stacks });
            }
        }

        // 清除死亡敌人的 Buff
        this._enemyBuffs.delete(enemyUuid);
        return triggers;
    }

    /**
     * 清除指定敌人所有 Buff
     */
    public clearBuffs(enemyUuid: number): void {
        this._enemyBuffs.delete(enemyUuid);
    }
}
