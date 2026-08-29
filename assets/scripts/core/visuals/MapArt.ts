import { Node, Graphics, Color, Layers, UITransform, Vec3 } from 'cc';
import {
    MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT, CELL_SIZE,
    PATH_BRANCH_WAYPOINTS, PATH_CELL_KEYS, GRID_COLS, GRID_ROWS,
    gridToLocal, ENTRANCE, BASE, ROAD_WIDTH_RATIO, SLOT_SIZE_RATIO, cellKey,
} from '../MapConfig';

// ============================================================
//  MapArt — 甜品台保卫战 · 程序化美术层
//
//  全部用 Graphics 绘制，无需任何外部贴图，可在当前引擎直接跑。
//  美术替换路径：把任一 draw* 方法改成 Sprite 加载即可，坐标/尺寸不变。
//
//  视觉层次（自下而上）：
//    1. 桌布底板（格纹 + 蕾丝花边）
//    2. 糖渍路径（半透明黏痕 + 高光 + 深色描边）
//    3. 餐垫塔位（圆形垫子，可用=暖白，锁定=灰）
//    4. 入口虫洞（台面裂缝）/ 基地蛋糕
// ============================================================

/** 甜品台配色板 */
export const DESSERT_PALETTE = {
    // 桌布
    clothBase: new Color(248, 240, 226, 255),
    clothStripe: new Color(240, 226, 208, 255),
    clothLace: new Color(255, 252, 245, 255),
    clothEdge: new Color(214, 192, 166, 255),
    // 糖渍
    syrupFill: new Color(206, 158, 96, 210),
    syrupGlow: new Color(240, 205, 150, 170),
    syrupEdge: new Color(150, 100, 48, 200),
    // 餐垫
    matOpen: new Color(255, 248, 232, 235),
    matOpenEdge: new Color(196, 164, 118, 255),
    matLocked: new Color(146, 142, 136, 200),
    matLockedEdge: new Color(96, 92, 88, 255),
    // 蛋糕 / 虫洞
    cakeSponge: new Color(238, 198, 140, 255),
    cakeCream: new Color(255, 250, 240, 255),
    cakeCherry: new Color(226, 66, 78, 255),
    cakeShadow: new Color(178, 132, 82, 255),
    holeDark: new Color(58, 40, 28, 255),
    holeRim: new Color(120, 88, 60, 255),
} as const;

function makeGfxNode(name: string, parent: Node, w: number, h: number): Graphics {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    node.setParent(parent);
    const t = node.addComponent(UITransform);
    t.setContentSize(w, h);
    t.setAnchorPoint(0.5, 0.5);
    return node.addComponent(Graphics);
}

// ============================================================
//  1. 桌布底板
// ============================================================
export function drawTablecloth(parent: Node): Node {
    const gfx = makeGfxNode('Tablecloth', parent, MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
    const halfW = MAP_DESIGN_WIDTH / 2;
    const halfH = MAP_DESIGN_HEIGHT / 2;
    const P = DESSERT_PALETTE;

    // 底色
    gfx.fillColor = P.clothBase;
    gfx.rect(-halfW, -halfH, MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
    gfx.fill();

    // 格纹（每 2 格一条，避免过于密集）
    const stripeW = CELL_SIZE * 2;
    gfx.fillColor = P.clothStripe;
    for (let x = -halfW; x < halfW; x += stripeW * 2) {
        gfx.rect(x, -halfH, stripeW, MAP_DESIGN_HEIGHT);
        gfx.fill();
    }
    for (let y = -halfH; y < halfH; y += stripeW * 2) {
        gfx.rect(-halfW, y, MAP_DESIGN_WIDTH, stripeW);
        gfx.fill();
    }

    // 四周蕾丝花边（半圆波浪）
    const laceR = 7;
    const step = laceR * 2;
    gfx.fillColor = P.clothLace;
    for (let x = -halfW + laceR; x <= halfW - laceR + 0.01; x += step) {
        gfx.circle(x, halfH, laceR); gfx.fill();
        gfx.circle(x, -halfH, laceR); gfx.fill();
    }
    for (let y = -halfH + laceR; y <= halfH - laceR + 0.01; y += step) {
        gfx.circle(-halfW, y, laceR); gfx.fill();
        gfx.circle(halfW, y, laceR); gfx.fill();
    }

    // 外框描边（压住花边，形成桌布边缘）
    gfx.lineWidth = 3;
    gfx.strokeColor = P.clothEdge;
    gfx.rect(-halfW, -halfH, MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
    gfx.stroke();

    return gfx.node;
}

// ============================================================
//  2. 糖渍路径（双路）
// ============================================================
export function drawSyrupPath(parent: Node): Node {
    const gfx = makeGfxNode('SyrupPath', parent, MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
    const P = DESSERT_PALETTE;
    const roadW = CELL_SIZE * ROAD_WIDTH_RATIO;

    for (const wps of PATH_BRANCH_WAYPOINTS) {
        // 外层深色描边（糖渍边缘）
        gfx.lineWidth = roadW + 6;
        gfx.lineCap = Graphics.LineCap.ROUND;
        gfx.lineJoin = Graphics.LineJoin.ROUND;
        gfx.strokeColor = P.syrupEdge;
        strokePolyline(gfx, wps);

        // 主体糖渍
        gfx.lineWidth = roadW;
        gfx.strokeColor = P.syrupFill;
        strokePolyline(gfx, wps);

        // 内层高光（细一点，偏亮，形成"湿滑反光"）
        gfx.lineWidth = roadW * 0.34;
        gfx.strokeColor = P.syrupGlow;
        strokePolyline(gfx, wps);
    }

    return gfx.node;
}

function strokePolyline(gfx: Graphics, pts: Vec3[]): void {
    gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
    gfx.stroke();
}

// ============================================================
//  3. 餐垫塔位（圆形垫子）
// ============================================================
export function drawSlotMat(gfx: Graphics, locked: boolean): void {
    gfx.clear();
    const P = DESSERT_PALETTE;
    const r = (CELL_SIZE * SLOT_SIZE_RATIO) / 2;

    const fill = locked ? P.matLocked : P.matOpen;
    const edge = locked ? P.matLockedEdge : P.matOpenEdge;

    // 垫子主体（圆形，模拟餐垫）
    gfx.fillColor = fill;
    gfx.circle(0, 0, r);
    gfx.fill();

    // 外圈描边
    gfx.lineWidth = 2.5;
    gfx.strokeColor = edge;
    gfx.circle(0, 0, r);
    gfx.stroke();

    // 内圈压线（餐垫的缝线装饰）
    gfx.lineWidth = 1.5;
    gfx.strokeColor = locked ? P.matLockedEdge : new Color(214, 186, 142, 200);
    gfx.circle(0, 0, r - 5);
    gfx.stroke();

    if (locked) {
        // 锁定：灰色挂锁（锁身 + 锁梁）
        gfx.fillColor = new Color(228, 228, 234, 235);
        gfx.rect(-7.5, -3, 15, 13);
        gfx.fill();
        gfx.lineWidth = 2.6;
        gfx.strokeColor = new Color(228, 228, 234, 235);
        gfx.arc(0, -3, 6.5, Math.PI, 0, false);
        gfx.stroke();
        // 锁孔
        gfx.fillColor = new Color(120, 116, 112, 255);
        gfx.circle(0, 2, 2.2);
        gfx.fill();
    } else {
        // 可用：中心十字（表示"可放置"）
        gfx.strokeColor = P.matOpenEdge;
        gfx.lineWidth = 2.8;
        gfx.moveTo(-11, 0); gfx.lineTo(11, 0);
        gfx.moveTo(0, -11); gfx.lineTo(0, 11);
        gfx.stroke();
    }
}

// ============================================================
//  3.5 塔底座（圆形奶油裱花，替代旧的深灰方块）
//  旧实现用 56×56 深灰方块，四角会露在圆形塔身外形成黑灰边框。
//  改为与餐垫呼应的圆形奶油底座，并用塔自身颜色做裱花点以区分塔类型。
// ============================================================
export function drawTowerBase(gfx: Graphics, accentColor: Color): void {
    gfx.clear();
    const P = DESSERT_PALETTE;
    const r = (CELL_SIZE * SLOT_SIZE_RATIO) / 2;   // 与餐垫同半径，正好盖住餐垫的十字

    // 落影
    gfx.fillColor = new Color(150, 120, 84, 55);
    gfx.circle(0, -2.5, r);
    gfx.fill();

    // 奶油底座主体（圆形，不留方角）
    gfx.fillColor = P.cakeCream;
    gfx.circle(0, 0, r - 1);
    gfx.fill();

    // 外圈描边
    gfx.lineWidth = 2.5;
    gfx.strokeColor = P.matOpenEdge;
    gfx.circle(0, 0, r - 1);
    gfx.stroke();

    // 奶油裱花点：用塔自身颜色，便于一眼区分塔类型
    gfx.fillColor = accentColor;
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        gfx.circle(Math.cos(a) * (r - 5.5), Math.sin(a) * (r - 5.5), 2.2);
        gfx.fill();
    }

    // 内圈压线（与餐垫缝线呼应）
    gfx.lineWidth = 1.2;
    gfx.strokeColor = new Color(214, 186, 142, 180);
    gfx.circle(0, 0, r - 9);
    gfx.stroke();
}

// ============================================================
//  4. 入口虫洞（台面裂缝）
// ============================================================
export function drawEntrance(parent: Node): Node {
    const gfx = makeGfxNode('Entrance', parent, CELL_SIZE * 1.6, CELL_SIZE * 1.6);
    gfx.node.setPosition(ENTRANCE);
    const P = DESSERT_PALETTE;

    // 外圈：被啃噬的桌布（不规则暗环）
    gfx.fillColor = P.holeRim;
    gfx.circle(0, 0, 26);
    gfx.fill();

    // 裂缝主体：深色椭圆（透视上的洞口）
    gfx.fillColor = P.holeDark;
    gfx.ellipse(0, 0, 19, 13);
    gfx.fill();

    // 内部更深的洞芯
    gfx.fillColor = new Color(28, 18, 12, 255);
    gfx.ellipse(0, -1, 12, 7.5);
    gfx.fill();

    // 洞口边缘的碎屑（4 个小点，暗示被咬破）
    gfx.fillColor = P.holeRim;
    const crumbs = [[-24, -8, 3.2], [22, -10, 2.8], [-18, 14, 2.4], [20, 12, 3.0]];
    for (const [cx, cy, cr] of crumbs) { gfx.circle(cx, cy, cr); gfx.fill(); }

    return gfx.node;
}

// ============================================================
//  5. 基地：奶油蛋糕
// ============================================================
export function drawCakeBase(parent: Node): Node {
    const gfx = makeGfxNode('CakeBase', parent, 76, 76);
    gfx.node.setPosition(BASE);
    const P = DESSERT_PALETTE;

    // 蛋糕投影（贴地椭圆）
    gfx.fillColor = new Color(120, 88, 54, 90);
    gfx.ellipse(0, -26, 30, 9);
    gfx.fill();

    // 蛋糕盘（底盘）
    gfx.fillColor = new Color(232, 232, 238, 255);
    gfx.ellipse(0, -22, 30, 8);
    gfx.fill();
    gfx.lineWidth = 2;
    gfx.strokeColor = new Color(186, 186, 196, 255);
    gfx.ellipse(0, -22, 30, 8);
    gfx.stroke();

    // 蛋糕胚（两层，下层大上层小）
    gfx.fillColor = P.cakeShadow;
    gfx.rect(-24, -22, 48, 16);
    gfx.fill();
    gfx.fillColor = P.cakeSponge;
    gfx.rect(-24, -20, 48, 14);
    gfx.fill();

    gfx.fillColor = P.cakeShadow;
    gfx.rect(-18, -6, 36, 13);
    gfx.fill();
    gfx.fillColor = new Color(246, 212, 158, 255);
    gfx.rect(-18, -4, 36, 11);
    gfx.fill();

    // 奶油顶（三个圆弧堆出的云朵状）
    gfx.fillColor = P.cakeCream;
    gfx.circle(-11, 9, 9); gfx.fill();
    gfx.circle(11, 9, 9); gfx.fill();
    gfx.circle(0, 14, 11); gfx.fill();

    // 樱桃 + 梗
    gfx.strokeColor = new Color(92, 132, 66, 255);
    gfx.lineWidth = 2.4;
    gfx.moveTo(0, 22); gfx.lineTo(5, 30);
    gfx.stroke();
    gfx.fillColor = P.cakeCherry;
    gfx.circle(0, 24, 6);
    gfx.fill();
    // 樱桃高光
    gfx.fillColor = new Color(255, 170, 176, 220);
    gfx.circle(-2, 26, 2);
    gfx.fill();

    return gfx.node;
}

// ============================================================
//  6. 桌布上的装饰（非路径、非塔位的空白格点缀，避免大片空洞）
// ============================================================
export function drawTableDecor(parent: Node): Node {
    const gfx = makeGfxNode('TableDecor', parent, MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT);
    const occupied = new Set<string>(PATH_CELL_KEYS);

    // 在空格上撒"糖霜点"，密度低，仅作视觉填充
    let seed = 20260829;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    gfx.fillColor = new Color(228, 208, 182, 120);
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            if (occupied.has(cellKey({ col: c, row: r }))) continue;
            const n = rnd();
            if (n > 0.42) continue;   // 约 42% 的空格有装饰
            const p = gridToLocal({ col: c, row: r });
            const ox = (rnd() - 0.5) * 30;
            const oy = (rnd() - 0.5) * 30;
            const rr = 1.6 + rnd() * 2.0;
            gfx.circle(p.x + ox, p.y + oy, rr);
            gfx.fill();
        }
    }
    return gfx.node;
}

/** 一次性构建完整地图美术，返回图层节点（按 z 序已排好） */
export function buildMapArt(parent: Node): { cloth: Node; syrup: Node; decor: Node; entrance: Node; cake: Node } {
    return {
        cloth: drawTablecloth(parent),
        decor: drawTableDecor(parent),
        syrup: drawSyrupPath(parent),
        entrance: drawEntrance(parent),
        cake: drawCakeBase(parent),
    };
}
