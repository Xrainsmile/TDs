import { Vec3 } from 'cc';

// ============================================================
// MapConfig — 固定地图设计坐标（唯一来源）
//
// 强制约束（撤销 PortraitLayoutSystem 后）：
//  * Road / BuildSlot / 入口 / 基地 的位置统一保存在本文件，全部为 MapRoot 局部（设计空间）固定坐标。
//  * 塔位允许根据道路转角单独设计位置（直接写坐标，不做 row/column 抽象、不做自动镜像、不做自动吸附）。
//  * 屏幕适配只操作 MapRoot（整体缩放 + 居中），绝不根据手机尺寸重排 MapRoot 内部元素。
//  * checkMapLayout 仅输出警告（具体塔位 ID），绝不调用 setPosition 移动任何节点。
// ============================================================

// ===== 地图设计尺寸（设计空间，固定；适配只缩放 MapRoot）=====
export const MAP_DESIGN_WIDTH = 520;
export const MAP_DESIGN_HEIGHT = 720;

// ===== 道路：竖屏蛇形（10 waypoint，入口顶部中央 → 基地底部中央）=====
// 中央走廊 x∈[-120,120]，转角在 x=±120；塔位（见 BUILD_SLOTS）布置在走廊两侧，互不重叠。
// 坐标为 MapRoot 局部（设计空间）固定值，与设备尺寸无关。
export const PATH_WAYPOINTS: Vec3[] = [
    new Vec3(0, 330, 0),     // 入口（顶部中央）
    new Vec3(120, 330, 0),
    new Vec3(120, 150, 0),
    new Vec3(-120, 150, 0),
    new Vec3(-120, -30, 0),
    new Vec3(120, -30, 0),
    new Vec3(120, -210, 0),
    new Vec3(-120, -210, 0),
    new Vec3(-120, -330, 0),
    new Vec3(0, -330, 0),    // 基地（底部中央）
];

export const ENTRANCE: Vec3 = PATH_WAYPOINTS[0];
export const BASE: Vec3 = PATH_WAYPOINTS[PATH_WAYPOINTS.length - 1];

// ===== 塔位：固定设计坐标（禁止 row/column 抽象 / 自动镜像 / 自动吸附）=====
// 仅保存固定坐标，可单独按道路转角设计。id 用于布局校验输出具体塔位。
// 设计：内列 x=±180（距道路走廊边 12px），外列 x=±225（距地图边 7px）；
//       转角行用内列，直线段行用外列，共 18 个塔位。
export interface BuildSlotDef {
    id: string;
    pos: Vec3;
}

const INNER_X = 180;
const OUTER_X = 225;

export const BUILD_SLOTS: BuildSlotDef[] = [
    // 转角行（y=330/150/-30/-210/-330）→ 内列
    { id: 'L0', pos: new Vec3(-INNER_X, 330, 0) },
    { id: 'R0', pos: new Vec3(INNER_X, 330, 0) },
    { id: 'L2', pos: new Vec3(-INNER_X, 150, 0) },
    { id: 'R2', pos: new Vec3(INNER_X, 150, 0) },
    { id: 'L4', pos: new Vec3(-INNER_X, -30, 0) },
    { id: 'R4', pos: new Vec3(INNER_X, -30, 0) },
    { id: 'L6', pos: new Vec3(-INNER_X, -210, 0) },
    { id: 'R6', pos: new Vec3(INNER_X, -210, 0) },
    { id: 'L8', pos: new Vec3(-INNER_X, -330, 0) },
    { id: 'R8', pos: new Vec3(INNER_X, -330, 0) },
    // 直线段行（y=240/60/-120/-300）→ 外列
    { id: 'L1', pos: new Vec3(-OUTER_X, 240, 0) },
    { id: 'R1', pos: new Vec3(OUTER_X, 240, 0) },
    { id: 'L3', pos: new Vec3(-OUTER_X, 60, 0) },
    { id: 'R3', pos: new Vec3(OUTER_X, 60, 0) },
    { id: 'L5', pos: new Vec3(-OUTER_X, -120, 0) },
    { id: 'R5', pos: new Vec3(OUTER_X, -120, 0) },
    { id: 'L7', pos: new Vec3(-OUTER_X, -300, 0) },
    { id: 'R7', pos: new Vec3(OUTER_X, -300, 0) },
];

// ===== 布局校验阈值（仅提示，不修改）=====
const ROAD_HALF_STROKE = 20;   // 道路描边半宽（drawPath lineWidth=40）
const SLOT_RADIUS = 28;        // 塔位视觉半径（createTowerSlot 56×56）
const MIN_ROAD_CLEARANCE = 12; // 与道路最小间距
const MIN_SLOT_SPACING = 56;   // 塔位间最小中心距

/** 点到线段距离 */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
}

/**
 * 布局校验：只输出警告（含具体塔位 ID），绝不移动任何节点。
 * 检查项：塔位超出地图 / 塔位与道路重叠 / 塔位间距过小 / 入口或基地被裁切。
 */
export function checkMapLayout(): void {
    const halfW = MAP_DESIGN_WIDTH / 2;
    const halfH = MAP_DESIGN_HEIGHT / 2;
    const roadOverlapThreshold = ROAD_HALF_STROKE + SLOT_RADIUS + MIN_ROAD_CLEARANCE;

    for (const slot of BUILD_SLOTS) {
        const { x, y } = slot.pos;

        // 1. 塔位超出地图
        if (Math.abs(x) > halfW || Math.abs(y) > halfH) {
            console.warn(`[MapLayout] 塔位超出地图: id=${slot.id} pos=(${x},${y}) 地图半尺寸=(${halfW},${halfH})`);
            continue; // 越界时距离类检查无意义
        }

        // 2. 塔位与道路重叠
        let minRoadDist = Infinity;
        for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
            const a = PATH_WAYPOINTS[i];
            const b = PATH_WAYPOINTS[i + 1];
            const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
            if (d < minRoadDist) minRoadDist = d;
        }
        if (minRoadDist < roadOverlapThreshold) {
            console.warn(`[MapLayout] 塔位与道路重叠: id=${slot.id} pos=(${x},${y}) 距道路=${minRoadDist.toFixed(1)} 阈值=${roadOverlapThreshold}`);
        }

        // 3. 塔位间距过小
        for (const other of BUILD_SLOTS) {
            if (other === slot) continue;
            const d = Math.hypot(x - other.pos.x, y - other.pos.y);
            if (d < MIN_SLOT_SPACING) {
                console.warn(`[MapLayout] 塔位间距过小: id=${slot.id}(${x},${y}) ↔ id=${other.id}(${other.pos.x},${other.pos.y}) 距离=${d.toFixed(1)} 阈值=${MIN_SLOT_SPACING}`);
                break;
            }
        }
    }

    // 4. 入口或基地被裁切
    for (const [name, p] of [['入口', ENTRANCE], ['基地', BASE]] as const) {
        if (Math.abs(p.x) > halfW || Math.abs(p.y) > halfH) {
            console.warn(`[MapLayout] ${name}被裁切: pos=(${p.x},${p.y}) 地图半尺寸=(${halfW},${halfH})`);
        }
    }
}
