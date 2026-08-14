import { RunBuildState } from '../cards/RunBuildState';
import { TowerStats } from '../RoguelikeCards';
import { TowerParams, TowerRuntime } from '../RuntimeTypes';

export class TowerParamResolver {
    static resolve(tower: TowerRuntime, towerStats: TowerStats, runBuild: RunBuildState): TowerParams {
        const def = tower.def;
        const ts = towerStats;
        const star = tower.star;
        const affix = tower.affix;

        // 基础（全局 roguelike 倍率）；各塔攻击力统一 +20%（Math.round 取整）
        let damage = Math.round(def.attack.damage * 1.2 * ts.damageMultiplier);
        let interval = def.attack.attackInterval / (ts.speedMultiplier * (tower.auraSpeedMul ?? 1));
        let range = def.attack.range * ts.rangeMultiplier;
        let poisonDps = 8;
        let poisonDuration = 6.0;

        const se = def.attack.statusEffects ?? [];
        const slowEff = se.find(s => s.type === 'SLOW');
        const markEff = se.find(s => s.type === 'MARK');
        let slowMultiplier = slowEff?.magnitude ?? 0.7;
        let slowDuration = slowEff?.duration ?? 1.0;
        let vulnerable = markEff?.magnitude ?? 1.0;
        let executeBonus = 0;
        let rapid = false;
        let critChance = tower.corePowerCritChance ?? 0;
        let critMultiplier = tower.corePowerCritMultiplier ?? 1;

        if (def.id === 'bubble_tea_straw') {
            damage *= (1 + ts.strawDamageBonus);
            range *= Math.max(0.65, 1 - ts.strawRangePenalty);
            if (tower.corePowered) {
                damage *= (1 + ts.corePoweredDamageBonus);
                critChance += ts.corePoweredCritBonus;
            }
        }
        if (def.id === 'spatula') {
            interval *= (1 + ts.smashIntervalPenalty);
        }

        if (star === 2) {
            damage *= 1.3;
            range *= 1.15;
            interval /= 1.1;
            poisonDps *= 1.3;
            poisonDuration *= 1.3;
            slowMultiplier = Math.min(slowMultiplier, 0.55);
            slowDuration *= 1.3;
        }

        if (affix === 'heavy') damage *= 1.25;
        if (affix === 'execute') executeBonus = 0.5;
        if (affix === 'rapid') rapid = true;
        if (affix === 'virulent') poisonDps *= 1.25;
        if (affix === 'persistent') poisonDuration *= 1.5;
        if (affix === 'deepfreeze') slowMultiplier = Math.min(slowMultiplier, 0.45);
        if (affix === 'linger') slowDuration *= 1.5;
        if (affix === 'vulnerable') vulnerable = 1.2;

        const mods = runBuild.towerModifiersOf(def.id);
        let thrustRepeatCount = 1;
        let thrustRepeatDelay = 0;
        let poisonOnHitDps = 0;
        let poisonOnHitDuration = 0;
        for (const m of mods) {
            const ch = m.changes;
            if (ch.damageMultiplier) damage = Math.round(damage * ch.damageMultiplier);
            if (ch.intervalMultiplier) interval *= ch.intervalMultiplier;
            if (ch.rangeMultiplier) range *= ch.rangeMultiplier;
            if (ch.repeatCount && ch.repeatCount > 1) {
                thrustRepeatCount = ch.repeatCount;
                thrustRepeatDelay = ch.repeatDelay ?? 0;
            }
            if (ch.poisonDps && ch.poisonDuration) {
                poisonOnHitDps = Math.max(poisonOnHitDps, ch.poisonDps);
                poisonOnHitDuration = Math.max(poisonOnHitDuration, ch.poisonDuration);
            }
        }

        return {
            damage, interval, range, poisonDps, poisonDuration, slowMultiplier, slowDuration,
            vulnerable, executeBonus, rapid, critChance, critMultiplier, thrustRepeatCount, thrustRepeatDelay,
            poisonOnHitDps, poisonOnHitDuration,
        };
    }
}
