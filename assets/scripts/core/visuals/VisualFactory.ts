/**
 * VisualFactory.ts — 表现层：按皮肤构建攻击视觉节点（demo 用 Graphics 占位）。
 *
 * 职责边界：这里只负责"节点长什么样"（绘制/未来加载美术资源）。
 * 战斗逻辑（SceneInitializer 的 executor）仍负责创建后的 transform 驱动
 * （scale/angle/position）与命中时序，本工厂不碰。
 * 美术阶段：在各 create* 里按 skin.kind 分支，把 Graphics 换成 Sprite/Spine/粒子，
 *           返回的节点类型不变、transform 驱动不变 → 逻辑零改动。
 */
import { Node, Graphics, Layers, Color } from 'cc';
import { TowerDef } from '../GameBalance';
import { getVisualSkin } from './VisualSkins';

export function skinCol(arr: [number, number, number, number] | undefined, fallback: Color): Color {
    return arr ? new Color(arr[0], arr[1], arr[2], arr[3]) : fallback;
}

/** 戳击吸管（thrust）：根部 (0,0) 沿 +x 伸出；缩放/旋转由 executor 驱动 */
export function createThrustStraw(def: TowerDef, parent: Node): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const straw = new Node('Straw');
    straw.layer = Layers.Enum.UI_2D;
    straw.setParent(parent);
    const len = def.attack.range;
    if (skin.kind === 'graphics') {
        const sg = straw.addComponent(Graphics);
        // 主体（珍珠白，与塔身区分）
        sg.fillColor = skinCol(skin.body, new Color(250, 244, 230, 255));
        sg.rect(0, -8, len, 16);
        sg.fill();
        // 吸管口 / 戳尖端（缺省→塔色）
        sg.fillColor = skinCol(skin.accent, def.color);
        sg.rect(len - 10, -8, 10, 16);
        sg.fill();
        sg.strokeColor = skinCol(skin.outline, new Color(120, 90, 60, 220));
        sg.lineWidth = 1;
        sg.rect(0, -8, len, 16);
        sg.stroke();
    }
    return straw;
}

/** 旋斩光环（spin）：攻击时显示并旋转；初始隐藏 */
export function createSpinRing(def: TowerDef, parent: Node): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const ring = new Node('SpinRing');
    ring.layer = Layers.Enum.UI_2D;
    ring.setParent(parent);
    const r = def.attack.range;
    if (skin.kind === 'graphics') {
        const g = ring.addComponent(Graphics);
        g.strokeColor = skinCol(skin.body, new Color(def.color.r, def.color.g, def.color.b, 220));
        g.lineWidth = 4;
        g.circle(0, 0, r);
        g.stroke();
        g.strokeColor = skinCol(skin.accent, new Color(255, 255, 255, 220));
        g.lineWidth = 4;
        g.arc(0, 0, r, 0, Math.PI / 3, false);   // 缺口弧段，旋转时有"旋"感
        g.stroke();
    }
    ring.active = false;
    return ring;
}

/** 缝衣针弹体（pierce）：细长针体 + 针尖；位移由 executor 驱动 */
export function createPierceShot(def: TowerDef): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const node = new Node('NeedleShot');
    node.layer = Layers.Enum.UI_2D;
    if (skin.kind === 'graphics') {
        const g = node.addComponent(Graphics);
        // 针尖位于节点原点（命中判定以原点为针尖，伤害在针尖触敌瞬间结算），针体向后延伸；长度 24→48 加倍
        g.fillColor = skinCol(skin.body, new Color(235, 235, 245, 255));
        g.rect(-48, -2, 48, 4);        // 针体
        g.fill();
        g.fillColor = skinCol(skin.accent, new Color(150, 150, 165, 255));
        g.rect(-12, -2, 12, 4);        // 针尖（最前 12px，对齐命中点）
        g.fill();
    }
    return node;
}
