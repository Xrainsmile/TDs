/**
 * cards/EffectExecutor.ts — 统一效果执行器
 *
 * EffectExecutor.execute(effect, ctx) 按 effectType 分发到 ctx 提供的具体操作。
 * 执行器本身不依赖运行主流程（SceneInitializer），只面向 EffectContext 接口，
 * 从而效果配置可序列化、可复用、可统计。高度特殊的终结效果用 effectType='custom' + effectId 由代码注册。
 */

import { EffectContext, EffectDefinition } from './types';

/** 将 modifyStat 的 value 作用到 TowerStats 对应字段（percent 以加成形式累加） */
function applyModifyStat(effect: EffectDefinition, ctx: EffectContext): void {
    const stats = ctx.towerStats;
    const stat = effect.parameters?.stat as string | undefined;
    const v = effect.value ?? 0;
    const isPercent = effect.valueType === 'percent';
    if (!stat) return;
    switch (stat) {
        case 'damage': stats.damageBonus += v; break;
        case 'speed': stats.speedBonus += v; break;
        case 'range': stats.rangeBonus += v; break;
        case 'healSuppression': stats.healSuppression += v; break;
        case 'splash': stats.splashLevel += Math.round(v); break;
        case 'bleed': stats.bleedLevel += Math.round(v); break;
        case 'slow': stats.slowLevel += Math.round(v); break;
        default:
            console.warn(`[EffectExecutor] 未知 stat: ${stat}`);
    }
    void isPercent; // percent 此处即加成小数（如 +0.1），由配置语义决定
}

/** 执行单条效果 */
export function executeEffect(effect: EffectDefinition, ctx: EffectContext): void {
    const p = effect.parameters;
    switch (effect.effectType) {
        case 'modifyStat':
            applyModifyStat(effect, ctx);
            break;
        case 'spawnTower':
            ctx.spawnTower?.(String(p?.towerId ?? ''), p);
            break;
        case 'unlockTile':
            ctx.unlockTile?.(p);
            break;
        case 'addStatus':
            ctx.addStatusToEnemies?.(String(p?.status ?? ''), effect.duration ?? 0, effect.chance);
            break;
        case 'dealDamage':
            ctx.dealDamageToEnemies?.(effect.value ?? 0, p);
            break;
        case 'modifyProjectile':
            ctx.modifyProjectile?.(p ?? {});
            break;
        case 'triggerReaction':
            ctx.triggerReaction?.(p ?? {});
            break;
        case 'grantGold':
            ctx.grantGold?.(effect.value ?? 0);
            break;
        case 'addModifier':
            ctx.addModifierToTower?.(String(p?.towerId ?? ''), String(p?.modifierId ?? ''));
            break;
        case 'changeRule':
            ctx.changeRule?.(p ?? {});
            break;
        case 'custom':
            if (effect.effectId && ctx.custom) ctx.custom(effect.effectId, effect);
            else console.warn(`[EffectExecutor] 未注册的 custom 效果: ${effect.effectId ?? '(无 id)'}`);
            break;
        default:
            console.warn(`[EffectExecutor] 未实现的 effectType: ${effect.effectType}`);
    }
}

/** 顺序执行一组效果 */
export function executeEffects(effects: EffectDefinition[], ctx: EffectContext): void {
    for (const e of effects) executeEffect(e, ctx);
}
