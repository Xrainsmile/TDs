import { Color, Graphics, Vec3 } from 'cc';
import { EnemyDef } from '../GameBalance';
import { EnemyRuntime, TowerParams, TowerRuntime } from '../RuntimeTypes';

const THRUST_EXTEND = 0.10;
const THRUST_PAUSE = 0.05;
const THRUST_RETRACT = 0.08;
const THRUST_REST_SCALE = 0.16;

export interface ThrustSystemContext {
    towers: TowerRuntime[];
    enemies: EnemyRuntime[];
    debug: boolean;
    getTowerParams(tower: TowerRuntime): TowerParams;
    findFirstTarget(towerPos: Vec3, range: number): number;
    getEnemyDef(type: EnemyRuntime['type']): EnemyDef | undefined;
    damageEnemy(tower: TowerRuntime, enemy: EnemyRuntime, amount: number, result: {
        isCrit: boolean;
        isOverload: boolean;
        strikeIndex: number;
    }): void;
    playHit(enemy: EnemyRuntime): void;
    playDamageNumber(enemy: EnemyRuntime, amount: number, isCrit: boolean, isOverload?: boolean): void;
    playThrustHitRing(enemy: EnemyRuntime, scale: number): void;
    playOverloadThrustHit(enemy: EnemyRuntime): void;
    playTowerRecoil(tower: TowerRuntime, dirX: number, dirY: number, strength: number): void;
    rollTowerCrit(params: TowerParams): boolean;
    critDamage(amount: number, params: TowerParams): number;
    bleedChance(): number;
    bleedDuration(): number;
    hasBleedBuff(): boolean;
    forceSecondStrikeCrit(tower: TowerRuntime, strikeIndex: number): boolean;
}

export class ThrustSystem {
    static attack(tower: TowerRuntime, ctx: ThrustSystemContext): void {
        if (tower.thrust && tower.thrust.active) return;
        const p = ctx.getTowerParams(tower);
        const tidx = ctx.findFirstTarget(tower.node.position, p.range);
        if (tidx < 0) return;
        const target = ctx.enemies[tidx];
        if (!target || !target.node.isValid) return;

        const tp = tower.node.position;
        const dx = target.node.position.x - tp.x;
        const dy = target.node.position.y - tp.y;
        const len = Math.hypot(dx, dy) || 1;
        const dirX = dx / len;
        const dirY = dy / len;

        const total = p.thrustRepeatCount ?? 1;
        tower.thrust = {
            active: true, phase: 'extend', timer: 0, dirX, dirY, damaged: false,
            strikeIndex: 1, totalStrikes: total, repeatDelay: p.thrustRepeatDelay ?? 0,
        };
        if (tower.straw && tower.straw.isValid) tower.straw.active = true;
        this.setVisualAngle(tower, dirX, dirY);
    }

    static update(dt: number, ctx: ThrustSystemContext): void {
        for (const tower of ctx.towers) {
            const st = tower.thrust;
            const straw = tower.straw;
            if (tower.disabledTimer > 0) { this.reset(tower, ctx); continue; }
            if (!st || !st.active || !straw || !straw.isValid) {
                if (ctx.debug && tower.thrustDebug) this.drawDebug(tower, false, ctx);
                continue;
            }
            st.timer += dt;
            const rangeScale = ctx.getTowerParams(tower).range / tower.def.attack.range;
            const restScale = THRUST_REST_SCALE * rangeScale;
            if (st.phase === 'extend') {
                const f = Math.min(1, st.timer / THRUST_EXTEND);
                const scaleY = this.strikeScaleY(st.strikeIndex);
                straw.setScale(restScale + (rangeScale - restScale) * f, scaleY, 1);
                if (f >= 1) {
                    straw.setScale(rangeScale, scaleY, 1);
                    st.phase = 'pause';
                    st.timer = 0;
                    this.applyHit(tower, ctx);
                }
            } else if (st.phase === 'pause') {
                if (st.timer >= THRUST_PAUSE) { st.phase = 'retract'; st.timer = 0; }
            } else if (st.phase === 'retract') {
                const f = Math.min(1, st.timer / THRUST_RETRACT);
                const scaleY = this.strikeScaleY(st.strikeIndex);
                straw.setScale(rangeScale - (rangeScale - restScale) * f, scaleY, 1);
                if (f >= 1) {
                    straw.setScale(restScale, 1, 1);
                    if (st.strikeIndex < st.totalStrikes) {
                        st.phase = 'repeatWait';
                        st.timer = 0;
                        st.damaged = false;
                    } else {
                        st.active = false;
                        st.phase = 'idle';
                        straw.active = false;
                    }
                }
            } else if (st.phase === 'repeatWait') {
                if (st.timer >= st.repeatDelay) {
                    const p2 = ctx.getTowerParams(tower);
                    const nextIdx = ctx.findFirstTarget(tower.node.position, p2.range);
                    const nxt = nextIdx >= 0 ? ctx.enemies[nextIdx] : null;
                    if (!nxt || !nxt.node.isValid) {
                        st.active = false;
                        st.phase = 'idle';
                        straw.active = false;
                    } else {
                        const dx = nxt.node.position.x - tower.node.position.x;
                        const dy = nxt.node.position.y - tower.node.position.y;
                        const len = Math.hypot(dx, dy);
                        if (len < 1) {
                            st.active = false;
                            st.phase = 'idle';
                            straw.active = false;
                        } else {
                            st.dirX = dx / len;
                            st.dirY = dy / len;
                            st.strikeIndex += 1;
                            st.phase = 'extend';
                            st.timer = 0;
                            st.damaged = false;
                            this.setVisualAngle(tower, st.dirX, st.dirY);
                        }
                    }
                }
            }
            if (ctx.debug && tower.thrustDebug) this.drawDebug(tower, true, ctx);
        }
    }

    static reset(tower: TowerRuntime, ctx: Pick<ThrustSystemContext, 'getTowerParams'>): void {
        if (tower.thrust) {
            tower.thrust.active = false;
            tower.thrust.phase = 'idle';
            tower.thrust.timer = 0;
            tower.thrust.damaged = false;
            tower.thrust.strikeIndex = 0;
            tower.thrust.totalStrikes = 1;
            tower.thrust.repeatDelay = 0;
        }
        if (tower.straw && tower.straw.isValid) {
            const rangeScale = ctx.getTowerParams(tower).range / tower.def.attack.range;
            tower.straw.setScale(THRUST_REST_SCALE * rangeScale, 1, 1);
            tower.straw.angle = 0;
            tower.straw.active = false;
        }
    }

    private static applyHit(tower: TowerRuntime, ctx: ThrustSystemContext): void {
        const p = ctx.getTowerParams(tower);
        const a = tower.def.attack;
        const root = tower.node.position;
        const st = tower.thrust!;
        const dirX = st.dirX, dirY = st.dirY;
        const range = p.range;
        const halfW = (a.width ?? 14) / 2;
        let best: EnemyRuntime | null = null;
        let bestF = -Infinity;
        for (const e of ctx.enemies) {
            if (!e.node.isValid) continue;
            const rE = ctx.getEnemyDef(e.type)?.radius ?? 14;
            const vx = e.node.position.x - root.x;
            const vy = e.node.position.y - root.y;
            const f = vx * dirX + vy * dirY;
            if (f < -rE || f > range + rE) continue;
            const fC = Math.max(0, Math.min(range, f));
            const cx = root.x + dirX * fC;
            const cy = root.y + dirY * fC;
            const dist = Math.hypot(e.node.position.x - cx, e.node.position.y - cy);
            if (dist > halfW + rE) continue;
            if (f > bestF) { bestF = f; best = e; }
        }
        if (best) {
            const isOverload = ctx.forceSecondStrikeCrit(tower, st.strikeIndex);
            const isCrit = isOverload || ctx.rollTowerCrit(p);
            const critParams = isOverload ? { ...p, critMultiplier: Math.max(p.critMultiplier, 3.5) } : p;
            const damage = isCrit ? ctx.critDamage(p.damage, critParams) : p.damage;
            ctx.damageEnemy(tower, best, damage, {
                isCrit,
                isOverload,
                strikeIndex: st.strikeIndex,
            });
            ctx.playHit(best);
            ctx.playDamageNumber(best, damage, isCrit, isOverload);
            if (isOverload) {
                ctx.playOverloadThrustHit(best);
            } else {
                ctx.playThrustHitRing(best, st.strikeIndex > 1 ? 1.18 : 1);
            }
            ctx.playTowerRecoil(tower, st.dirX, st.dirY, isOverload ? 1.9 : (st.strikeIndex > 1 ? 1.25 : 1));
            if (ctx.hasBleedBuff() && Math.random() < ctx.bleedChance()) {
                best.buffs['bleed'] = { timer: ctx.bleedDuration(), dps: 0 };
            }
        }
        st.damaged = true;
    }

    private static setVisualAngle(tower: TowerRuntime, dirX: number, dirY: number): void {
        if (!tower.straw) return;
        tower.straw.angle = Math.atan2(dirY, dirX) * 180 / Math.PI;
    }

    private static strikeScaleY(strikeIndex: number): number {
        return strikeIndex > 1 ? 1.12 : 1;
    }

    private static drawDebug(tower: TowerRuntime, attacking: boolean, ctx: Pick<ThrustSystemContext, 'getTowerParams'>): void {
        const g = tower.thrustDebug;
        if (!g) return;
        g.clear();
        const a = tower.def.attack;
        const p = ctx.getTowerParams(tower);
        const st = tower.thrust;
        if (attacking && st) {
            this.drawAttackDebug(g, tower, p, st.dirX, st.dirY);
        } else {
            g.strokeColor = new Color(255, 90, 90, 120);
            g.lineWidth = 1;
            g.circle(0, 0, p.range);
            g.stroke();
        }
        void a;
    }

    private static drawAttackDebug(g: Graphics, tower: TowerRuntime, p: TowerParams, dirX: number, dirY: number): void {
        const px = -dirY, py = dirX;
        const hw = (tower.def.attack.width ?? 14) / 2;
        const cx = dirX * p.range, cy = dirY * p.range;
        const c1x = -px * hw, c1y = -py * hw;
        const c2x = px * hw, c2y = py * hw;
        const c3x = cx + px * hw, c3y = cy + py * hw;
        const c4x = cx - px * hw, c4y = cy - py * hw;
        g.fillColor = new Color(255, 90, 90, 70);
        g.moveTo(c1x, c1y); g.lineTo(c2x, c2y); g.lineTo(c3x, c3y); g.lineTo(c4x, c4y); g.close(); g.fill();
        g.strokeColor = new Color(255, 90, 90, 220);
        g.lineWidth = 1;
        g.moveTo(0, 0);
        g.lineTo(cx, cy);
        g.stroke();
    }
}
