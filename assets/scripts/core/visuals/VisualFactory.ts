/**
 * VisualFactory.ts — 表现层：按皮肤构建攻击视觉节点（demo 用 Graphics 占位）。
 *
 * 职责边界：这里只负责"节点长什么样"（绘制/未来加载美术资源）。
 * 战斗逻辑（SceneInitializer 的 executor）仍负责创建后的 transform 驱动
 * （scale/angle/position）与命中时序，本工厂不碰。
 * 美术阶段：在各 create* 里按 skin.kind 分支，把 Graphics 换成 Sprite/Spine/粒子，
 *           返回的节点类型不变、transform 驱动不变 → 逻辑零改动。
 */
import { Node, Graphics, Layers, Color, UITransform, Sprite, SpriteFrame, Texture2D, assetManager, AssetManager } from 'cc';
import { TowerDef } from '../GameBalance';
import { CARD_VISUAL_ASSETS, getVisualSkin, TOWER_VISUAL_SKINS, VISUAL_SKINS, VisualSkin } from './VisualSkins';

export function skinCol(arr: [number, number, number, number] | undefined, fallback: Color): Color {
    return arr ? new Color(arr[0], arr[1], arr[2], arr[3]) : fallback;
}

// ===== sprite 资源缓存（美术阶段：kind='sprite' 的皮肤预加载后在此同步取用）=====
const spriteFrameCache = new Map<string, SpriteFrame>();
const spriteFrameWaiters = new Map<string, Array<(frame: SpriteFrame | null) => void>>();

let artBundlePromise: Promise<AssetManager.Bundle> | null = null;

/** 懒加载美术分包 bundle（art-bundle）；首次加载后缓存，后续复用同一 Promise。 */
function getArtBundle(): Promise<AssetManager.Bundle> {
    if (artBundlePromise) return artBundlePromise;
    artBundlePromise = new Promise<AssetManager.Bundle>((resolve, reject) => {
        assetManager.loadBundle('art-bundle', (err: Error | null, bundle: AssetManager.Bundle | null) => {
            if (err || !bundle) {
                console.warn('[VisualFactory] 美术分包 art-bundle 加载失败，将回退 Graphics 占位', err);
                reject(err);
            } else {
                resolve(bundle);
            }
        });
    });
    return artBundlePromise;
}

/** 贴图加载收尾（缓存 + 回调），与加载来源无关。 */
function finishSpriteLoad(path: string, texture: Texture2D | null, err: Error | null): void {
    let frame: SpriteFrame | null = null;
    if (err || !texture) {
        console.warn(`[VisualFactory] 贴图加载失败，回退 Graphics 占位: ${path}`, err);
    } else {
        frame = new SpriteFrame();
        frame.texture = texture;
        spriteFrameCache.set(path, frame);
    }
    const callbacks = spriteFrameWaiters.get(path) ?? [];
    spriteFrameWaiters.delete(path);
    for (const callback of callbacks) callback(frame);
}

function loadSpriteFrame(path: string, done?: (frame: SpriteFrame | null) => void): void {
    const cached = spriteFrameCache.get(path);
    if (cached) {
        done?.(cached);
        return;
    }
    const waiters = spriteFrameWaiters.get(path);
    if (waiters) {
        if (done) waiters.push(done);
        return;
    }
    spriteFrameWaiters.set(path, done ? [done] : []);
    // 图片主路径是 ImageAsset；Cocos 3.8 将可渲染纹理注册在同路径的 /texture 子资源。
    // 美术资源已拆为分包 bundle（art-bundle），从分包而非主包 resources 加载。
    // 注意：skin.asset 存的是全局路径（带 "art-bundle/" 前缀），但 bundle.load 的路径
    // 必须相对于 bundle 根，所以要去掉前缀再取子资源。
    const bundlePath = path.replace(/^art-bundle\//, '');
    getArtBundle().then((bundle) => {
        bundle.load(`${bundlePath}/texture`, Texture2D, (err: Error | null, texture: Texture2D | null) => {
            finishSpriteLoad(path, texture ?? null, err ?? null);
        });
    }).catch((err) => {
        finishSpriteLoad(path, null, err instanceof Error ? err : new Error(String(err)));
    });
}

/**
 * 预加载所有 kind='sprite' 皮肤的贴图。asset = resources 下相对路径（不含扩展名）。
 * 场景 start 时调用一次（fire-and-forget）；当前无 sprite 皮肤时为 no-op。
 * 加载失败/未完成的皮肤由 create* 回退 Graphics 占位，玩法不中断。
 */
export function preloadVisualSprites(): void {
    const paths = new Set<string>();
    for (const key of Object.keys(VISUAL_SKINS)) {
        const skin = VISUAL_SKINS[key];
        if (skin.kind === 'sprite' && skin.asset) paths.add(skin.asset);
    }
    for (const key of Object.keys(TOWER_VISUAL_SKINS)) {
        const skin = TOWER_VISUAL_SKINS[key];
        paths.add(skin.idle);
        if (skin.powered) paths.add(skin.powered);
    }
    for (const key of Object.keys(CARD_VISUAL_ASSETS)) paths.add(CARD_VISUAL_ASSETS[key]);
    for (const path of paths) loadSpriteFrame(path);
}

/**
 * 给节点挂 sprite。贴图约定"水平朝右"，宽度撑满 targetWidth、高度按图片原始宽高比自适应，
 * 锚点由调用方按各视觉的几何约定传入（与 Graphics 占位对齐，executor 的 transform 驱动不变）。
 * 返回 false（未预载/无 asset）时调用方回退 Graphics 占位。
 */
function attachSprite(node: Node, skin: VisualSkin, targetWidth: number, anchorX: number, anchorY: number): boolean {
    const sf = skin.asset ? spriteFrameCache.get(skin.asset) : undefined;
    if (!sf) return false;
    const scale = skin.scale ?? 1;
    const aspect = sf.rect.height / sf.rect.width;   // 高度按原图比例，避免拉伸变形
    const t = node.addComponent(UITransform);
    t.setContentSize(targetWidth * scale, targetWidth * aspect * scale);
    t.setAnchorPoint(anchorX, anchorY);
    const sp = node.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;   // 尺寸由 contentSize 决定，不随贴图回弹
    sp.spriteFrame = sf;
    return true;
}

interface TowerArtState {
    sprite: Sprite;
    fallback: Node;
    idlePath: string;
    poweredPath?: string;
    desiredPath: string;
}

const towerArtStates = new WeakMap<Node, TowerArtState>();

/** 为有正式素材的塔挂载本体图片；加载完成前保留程序绘制占位。 */
export function createTowerArt(towerId: string, parent: Node, fallback: Node): Node | null {
    const skin = TOWER_VISUAL_SKINS[towerId];
    if (!skin) return null;

    const node = new Node('TowerArt');
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(skin.size, skin.size);
    transform.setAnchorPoint(0.5, 0.5);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const state: TowerArtState = {
        sprite,
        fallback,
        idlePath: skin.idle,
        poweredPath: skin.powered,
        desiredPath: skin.idle,
    };
    towerArtStates.set(parent, state);
    loadTowerArt(state, skin.idle);
    return node;
}

function loadTowerArt(state: TowerArtState, path: string): void {
    loadSpriteFrame(path, frame => {
        if (!frame || !state.sprite.node.isValid || state.desiredPath !== path) return;
        state.sprite.spriteFrame = frame;
        state.fallback.active = false;
    });
}

/** 切换塔本体普通/供电图片；相同状态重复调用不会触发加载。 */
export function setTowerPoweredVisual(towerNode: Node, powered: boolean): void {
    const state = towerArtStates.get(towerNode);
    if (!state) return;
    const desired = powered && state.poweredPath ? state.poweredPath : state.idlePath;
    if (state.desiredPath === desired && state.sprite.spriteFrame) return;
    state.desiredPath = desired;
    const cached = spriteFrameCache.get(desired);
    if (cached) {
        state.sprite.spriteFrame = cached;
        state.fallback.active = false;
        return;
    }
    loadTowerArt(state, desired);
}

const iconDesiredPaths = new WeakMap<Node, string>();

/** 创建可复用的卡牌图标节点，具体图片由 setCardIcon 按卡牌 id 切换。 */
export function createCardIcon(parent: Node, size: number, x = 0, y = 0): Node {
    const node = new Node('Icon');
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(size, size);
    transform.setAnchorPoint(0.5, 0.5);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    node.active = false;
    return node;
}

/** 设置正式卡图；尚无美术的卡返回 false 并隐藏图标节点。 */
export function setCardIcon(iconNode: Node, cardId: string): boolean {
    const path = CARD_VISUAL_ASSETS[cardId];
    if (!path) {
        iconNode.active = false;
        iconDesiredPaths.delete(iconNode);
        return false;
    }
    iconNode.active = true;
    iconDesiredPaths.set(iconNode, path);
    const sprite = iconNode.getComponent(Sprite);
    const cached = spriteFrameCache.get(path);
    if (sprite && cached) {
        sprite.spriteFrame = cached;
        return true;
    }
    loadSpriteFrame(path, frame => {
        if (!frame || !iconNode.isValid || iconDesiredPaths.get(iconNode) !== path) return;
        const currentSprite = iconNode.getComponent(Sprite);
        if (currentSprite) currentSprite.spriteFrame = frame;
    });
    return true;
}

/** 给拖动幽灵设置塔本体图片；没有正式塔图时隐藏节点并让调用方回退占位图。 */
export function setTowerIcon(iconNode: Node, towerId: string): boolean {
    const path = TOWER_VISUAL_SKINS[towerId]?.idle;
    if (!path) {
        iconNode.active = false;
        iconDesiredPaths.delete(iconNode);
        return false;
    }
    iconNode.active = true;
    iconDesiredPaths.set(iconNode, path);
    const sprite = iconNode.getComponent(Sprite);
    const cached = spriteFrameCache.get(path);
    if (sprite && cached) {
        sprite.spriteFrame = cached;
        return true;
    }
    loadSpriteFrame(path, frame => {
        if (!frame || !iconNode.isValid || iconDesiredPaths.get(iconNode) !== path) return;
        const currentSprite = iconNode.getComponent(Sprite);
        if (currentSprite) currentSprite.spriteFrame = frame;
    });
    return true;
}

function drawTube(g: Graphics, len: number, width: number, angleDeg: number, body: Color, tip: Color, outline: Color): void {
    const rad = angleDeg * Math.PI / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy;
    const ny = dx;
    const half = width / 2;
    const tipLen = Math.min(12, len * 0.2);
    const bodyLen = len - tipLen;

    g.fillColor = body;
    g.moveTo(nx * half, ny * half);
    g.lineTo(dx * bodyLen + nx * half, dy * bodyLen + ny * half);
    g.lineTo(dx * bodyLen - nx * half, dy * bodyLen - ny * half);
    g.lineTo(-nx * half, -ny * half);
    g.close();
    g.fill();

    g.fillColor = tip;
    g.moveTo(dx * bodyLen + nx * half, dy * bodyLen + ny * half);
    g.lineTo(dx * len + nx * half, dy * len + ny * half);
    g.lineTo(dx * len - nx * half, dy * len - ny * half);
    g.lineTo(dx * bodyLen - nx * half, dy * bodyLen - ny * half);
    g.close();
    g.fill();

    g.strokeColor = outline;
    g.lineWidth = 1;
    g.moveTo(nx * half, ny * half);
    g.lineTo(dx * len + nx * half, dy * len + ny * half);
    g.lineTo(dx * len - nx * half, dy * len - ny * half);
    g.lineTo(-nx * half, -ny * half);
    g.close();
    g.stroke();
}

/** 戳击吸管（thrust）：根部 (0,0) 沿 +x 伸出；缩放/旋转由 executor 驱动 */
export function createThrustStraw(def: TowerDef, parent: Node): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const straw = new Node('Straw');
    straw.layer = Layers.Enum.UI_2D;
    straw.setParent(parent);
    const len = def.attack.range;
    // sprite 分支：贴图"水平朝右、根部在左缘"，锚点 (0, 0.5) 对齐 Graphics 几何
    // 可见吸管在方形图内左侧约有 10% 留白，以该位置作根部锚点。
    if (skin.kind === 'sprite' && attachSprite(straw, skin, len, 0.105, 0.5)) {
        return straw;
    }
    const sg = straw.addComponent(Graphics);
    const body = skinCol(skin.body, new Color(250, 244, 230, 255));
    const tip = skinCol(skin.accent, def.color);
    const outline = skinCol(skin.outline, new Color(120, 90, 60, 220));
    drawTube(sg, len, 16, 0, body, tip, outline);
    return straw;
}

/** 双管吸管：静态改造标识。只挂在塔旁，不参与攻击动画和索敌。 */
export function createDoubleStrawMarker(def: TowerDef, parent: Node): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const marker = new Node('DoubleStrawMarker');
    marker.layer = Layers.Enum.UI_2D;
    marker.setParent(parent);
    marker.setSiblingIndex(Math.min(1, parent.children.length - 1));
    marker.setPosition(-5, 11, 0);
    marker.angle = 105;
    // 第二根吸管从杯身后方伸出，只作为改造标识；实际攻击仍由主吸管连续执行两次。
    if (skin.kind === 'sprite' && attachSprite(marker, skin, 34, 0.105, 0.5)) {
        return marker;
    }
    const g = marker.addComponent(Graphics);
    const body = skinCol(skin.body, new Color(250, 244, 230, 255));
    const tip = skinCol(skin.accent, def.color);
    const outline = skinCol(skin.outline, new Color(120, 90, 60, 220));
    drawTube(g, 30, 7, 0, body, tip, outline);
    return marker;
}

/** 旋斩光环（spin）：攻击时显示并旋转；初始隐藏 */
export function createSpinRing(def: TowerDef, parent: Node): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const ring = new Node('SpinRing');
    ring.layer = Layers.Enum.UI_2D;
    ring.setParent(parent);
    const r = def.attack.range;
    // sprite 分支：贴图为居中圆环/冲击波，锚点 (0.5, 0.5)，直径 = 2 × range
    if (skin.kind === 'sprite' && attachSprite(ring, skin, r * 2, 0.5, 0.5)) {
        ring.active = false;
        return ring;
    }
    const g = ring.addComponent(Graphics);
    g.strokeColor = skinCol(skin.body, new Color(def.color.r, def.color.g, def.color.b, 220));
    g.lineWidth = 4;
    g.circle(0, 0, r);
    g.stroke();
    g.strokeColor = skinCol(skin.accent, new Color(255, 255, 255, 220));
    g.lineWidth = 4;
    g.arc(0, 0, r, 0, Math.PI / 3, false);   // 缺口弧段，旋转时有"旋"感
    g.stroke();
    ring.active = false;
    return ring;
}

/** 缝衣针弹体（pierce）：细长针体 + 针尖；位移由 executor 驱动 */
export function createPierceShot(def: TowerDef): Node {
    const skin = getVisualSkin(def.attack.visualEffectId);
    const node = new Node('NeedleShot');
    node.layer = Layers.Enum.UI_2D;
    // sprite 分支：贴图"水平朝右、针尖在右缘"，锚点 (1, 0.5) 使针尖对齐节点原点（命中点），针体长 48
    if (skin.kind === 'sprite' && attachSprite(node, skin, 48, 1, 0.5)) {
        return node;
    }
    const g = node.addComponent(Graphics);
    // 针尖位于节点原点（命中判定以原点为针尖，伤害在针尖触敌瞬间结算），针体向后延伸；长度 24→48 加倍
    g.fillColor = skinCol(skin.body, new Color(235, 235, 245, 255));
    g.rect(-48, -2, 48, 4);        // 针体
    g.fill();
    g.fillColor = skinCol(skin.accent, new Color(150, 150, 165, 255));
    g.rect(-12, -2, 12, 4);        // 针尖（最前 12px，对齐命中点）
    g.fill();
    return node;
}

/** 核心供电：挂在被供电吸管身上的电流圈。动画/显隐由运行逻辑驱动。 */
export function createCorePowerRing(parent: Node): Node {
    const skin = getVisualSkin('fx.core_power');
    const node = new Node('CorePowerRing');
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    node.setSiblingIndex(0);   // 电流圈位于塔身后方，不遮挡主体和星级徽章。
    node.setPosition(0, 0, 0);
    if (skin.kind === 'sprite' && attachSprite(node, skin, 76, 0.5, 0.5)) {
        node.active = false;
        return node;
    }
    const t = node.addComponent(UITransform);
    t.setContentSize(76, 76);
    t.setAnchorPoint(0.5, 0.5);
    const g = node.addComponent(Graphics);

    g.strokeColor = skinCol(skin.accent, new Color(120, 220, 255, 230));
    g.lineWidth = 3;
    g.circle(0, 0, 29);
    g.stroke();
    g.strokeColor = skinCol(skin.body, new Color(255, 235, 80, 230));
    g.lineWidth = 2;
    g.arc(0, 0, 34, Math.PI * 0.05, Math.PI * 0.36, false);
    g.arc(0, 0, 34, Math.PI * 1.05, Math.PI * 1.36, false);
    g.stroke();

    node.active = false;
    return node;
}

/** 核心供电：充电宝到目标吸管之间的闪电线。具体折线由运行逻辑每帧重绘。 */
export function createCorePowerLink(parent: Node): { node: Node; gfx: Graphics } {
    const node = new Node('CorePowerLink');
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    node.setSiblingIndex(0);   // 连线位于塔和敌人后方，避免横穿主体。
    node.setPosition(0, 0, 0);
    const t = node.addComponent(UITransform);
    t.setContentSize(2000, 2000);
    t.setAnchorPoint(0.5, 0.5);
    const gfx = node.addComponent(Graphics);
    node.active = false;
    return { node, gfx };
}

/** 用可拉伸的闪电段更新供电连线；资源尚未就绪时返回 false，调用方继续画 Graphics。 */
export function updateCorePowerLinkSprites(node: Node, from: Vec3Like, targets: Vec3Like[], phase: number): boolean {
    const skin = getVisualSkin('fx.core_power_bolt');
    const frame = skin.asset ? spriteFrameCache.get(skin.asset) : undefined;
    if (!frame) return false;

    for (let i = 0; i < targets.length; i++) {
        let bolt = node.children[i];
        if (!bolt) {
            bolt = new Node(`Bolt_${i}`);
            bolt.layer = Layers.Enum.UI_2D;
            bolt.setParent(node);
            bolt.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
            const sprite = bolt.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
        }
        bolt.active = true;
        const target = targets[i];
        const dx = target.x - from.x;
        const dy = target.y - from.y;
        const len = Math.hypot(dx, dy);
        bolt.setPosition(from.x + dx * 0.5, from.y + dy * 0.5, 0);
        bolt.angle = Math.atan2(dy, dx) * 180 / Math.PI;
        bolt.getComponent(UITransform)!.setContentSize(len, 24);
        bolt.setScale(1, 0.92 + Math.sin(phase + i * 1.3) * 0.08, 1);
    }
    for (let i = targets.length; i < node.children.length; i++) node.children[i].active = false;
    return true;
}

interface Vec3Like { x: number; y: number; }

/** 彩色线轴：同一条缝合链的连线节点。具体折线由运行逻辑每帧重绘。 */
export function createStitchChainLine(parent: Node): { node: Node; gfx: Graphics } {
    const node = new Node('StitchChainLine');
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    node.setPosition(0, 0, 0);
    const t = node.addComponent(UITransform);
    t.setContentSize(2000, 2000);
    t.setAnchorPoint(0.5, 0.5);
    const gfx = node.addComponent(Graphics);
    return { node, gfx };
}
