/**
 * VisualSkins.ts — 表现层：visualEffectId → 视觉皮肤 注册表
 *
 * Demo 阶段：所有皮肤 kind='graphics'，由 VisualFactory 用 Graphics 程序绘制占位。
 * 美术阶段：把对应条目改成 kind='sprite'/'spine'/'particle'/'prefab' 并填 asset/clip，
 *           VisualFactory 按 kind 分支加载真资源，战斗逻辑零改动。
 */

export type VisualKind = 'graphics' | 'sprite' | 'spine' | 'particle' | 'prefab';

export interface VisualSkin {
    kind: VisualKind;
    /** demo graphics 配色（[r,g,b,a]）；缺省时回退到塔色/默认 */
    body?: [number, number, number, number];
    accent?: [number, number, number, number];
    outline?: [number, number, number, number];
    /** 美术资源（美术阶段填）：预制体/帧动画/Spine/粒子 资源路径与片段名、缩放 */
    asset?: string;
    clip?: string;
    scale?: number;
}

/** 兜底皮肤：visualEffectId 未注册时使用 */
const DEFAULT_SKIN: VisualSkin = {
    kind: 'graphics',
    body: [250, 244, 230, 255],
    outline: [120, 90, 60, 220],
};

/**
 * 美术衔接注册表：visualEffectId → 皮肤。
 * demo 全为 graphics；美术阶段在此把对应条目换成真资源（改 kind + 填 asset/clip）。
 */
export const VISUAL_SKINS: Record<string, VisualSkin> = {
    // 奶茶吸管戳击：珍珠白主体，尖端缺省→塔色(奶茶)
    bubble_tea_straw_thrust: { kind: 'graphics', body: [250, 244, 230, 255], outline: [120, 90, 60, 220] },
    // 打蛋器旋斩：塔色光环 + 白色弧段
    whisk_spin: { kind: 'graphics', body: [150, 200, 255, 220], accent: [255, 255, 255, 220] },
    // 锅铲砸击
    spatula_smash: { kind: 'graphics', body: [200, 140, 90, 255] },
    // 缝衣针穿透：亮针体 + 灰针尖
    needle_pierce: { kind: 'graphics', body: [235, 235, 245, 255], accent: [150, 150, 165, 255] },

    // ===== 共享特效皮肤（EffectManager 用，key 以 fx. 前缀）=====
    // 美术阶段：把对应特效改成 kind:'particle'/'prefab' 并填 asset，EffectManager 按 kind 分支播放。
    'fx.hit': { kind: 'graphics', body: [255, 255, 255, 160] },                 // 命中闪白
    'fx.damage_number': { kind: 'graphics', body: [255, 255, 255, 255], accent: [255, 80, 80, 255] }, // 伤害数字(普通/暴击)
    'fx.death': { kind: 'graphics' },                                           // 死亡碎裂（颜色取自敌人自身）
    'fx.poison': { kind: 'graphics', body: [100, 200, 50, 180], accent: [100, 200, 50, 200] }, // 中毒外圈/冒泡
    'fx.slow': { kind: 'graphics', body: [180, 80, 220, 200] },                 // 减速圆环
    'fx.heal': { kind: 'graphics', body: [100, 255, 100, 200], accent: [100, 255, 100, 255] }, // 治疗脉冲/+数字
    'fx.explosion': { kind: 'graphics', body: [255, 180, 80, 255], accent: [255, 100, 50, 255] }, // 爆炸波/填充
    'fx.card_selected': { kind: 'graphics', body: [255, 215, 0, 180] },         // 选卡金色闪光
};

/** 按 visualEffectId 取皮肤；未注册返回兜底 */
export function getVisualSkin(id: string | undefined): VisualSkin {
    return (id && VISUAL_SKINS[id]) ? VISUAL_SKINS[id] : DEFAULT_SKIN;
}
