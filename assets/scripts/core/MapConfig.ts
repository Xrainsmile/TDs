import { Vec3 } from 'cc';

// ============================================================
// MapConfig — 6×8 逻辑网格地图（固定设计坐标，唯一来源）
//
//  * 所有地图元素（道路/塔位/入口/基地）只保存网格坐标 GridCell{col,row}，
//    禁止保存或手写 Vec3/x/y。位置统一由 gridToLocal() 计算（MapRoot 局部坐标）。
//  * 屏幕适配只操作 BattleRoot（整体等比缩放 + 居中），绝不重排内部元素。
//  * 校验函数仅输出错误，绝不修改地图数据。
// ============================================================

// ===== 网格定义 =====
export const GRID_COLS = 6;
export const GRID_ROWS = 8;
export const CELL_SIZE = 80;

export const MAP_DESIGN_WIDTH = GRID_COLS * CELL_SIZE;   // 480
export const MAP_DESIGN_HEIGHT = GRID_ROWS * CELL_SIZE;  // 640

export interface GridCell {
    col: number; // 0~5，左到右
    row: number; // 0~7，上到下
}

// ===== 坐标转换（唯一入口）=====
/** 网格坐标 → MapRoot 局部坐标（格子中心） */
export function gridToLocal(cell: GridCell): Vec3 {
    return new Vec3(
        (cell.col + 0.5) * CELL_SIZE - MAP_DESIGN_WIDTH / 2,
        MAP_DESIGN_HEIGHT / 2 - (cell.row + 0.5) * CELL_SIZE,
        0
    );
}

/** 局部坐标 → 最近网格坐标（手机点击/拖动/未来地图操作使用） */
export function localToGrid(local: Vec3): GridCell {
    const col = Math.round((local.x + MAP_DESIGN_WIDTH / 2) / CELL_SIZE - 0.5);
    const row = Math.round((MAP_DESIGN_HEIGHT / 2 - local.y) / CELL_SIZE - 0.5);
    return { col, row };
}

// ===== 道路（蛇形，16 格，全部用 GridCell）=====
export const PATH_CELLS: GridCell[] = [
    { col: 2, row: 0 },
    { col: 3, row: 0 },
    { col: 3, row: 1 },
    { col: 3, row: 2 },
    { col: 2, row: 2 },
    { col: 1, row: 2 },
    { col: 1, row: 3 },
    { col: 1, row: 4 },
    { col: 2, row: 4 },
    { col: 3, row: 4 },
    { col: 4, row: 4 },
    { col: 4, row: 5 },
    { col: 4, row: 6 },
    { col: 3, row: 6 },
    { col: 2, row: 6 },
    { col: 2, row: 7 },
];

// 入口 = 第一个道路格；基地 = 最后一个道路格
export const ENTRANCE_CELL: GridCell = PATH_CELLS[0];
export const BASE_CELL: GridCell = PATH_CELLS[PATH_CELLS.length - 1];

// 道路 waypoints（必须由 PATH_CELLS 派生，禁止手写 Vec3；供移动/绘制使用）
export const PATH_WAYPOINTS: Vec3[] = PATH_CELLS.map(gridToLocal);
export const ENTRANCE: Vec3 = gridToLocal(ENTRANCE_CELL);
export const BASE: Vec3 = gridToLocal(BASE_CELL);

// ===== 塔位（仅 GridCell，禁止 Vec3/x/y）=====
// 左右两外侧列（col0 / col5）各 8 行，共 16 个，均不与道路格重叠。
export const BUILD_CELLS: GridCell[] = [
    ...Array.from({ length: GRID_ROWS }, (_, r) => ({ col: 0, row: r } as GridCell)),
    ...Array.from({ length: GRID_ROWS }, (_, r) => ({ col: GRID_COLS - 1, row: r } as GridCell)),
];

// ===== 渲染参数 =====
export const ROAD_WIDTH_RATIO = 0.65;   // 道路宽度 = CELL_SIZE 的 65%
export const SLOT_SIZE_RATIO = 0.70;    // 塔位尺寸 = CELL_SIZE 的 70%

// ===== 布局校验（仅输出错误，不修改地图数据）=====
const ROAD_HALF_STROKE = (CELL_SIZE * ROAD_WIDTH_RATIO) / 2;
const SLOT_RADIUS = (CELL_SIZE * SLOT_SIZE_RATIO) / 2;
const MIN_ROAD_CLEARANCE = 12;

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
 * 地图校验：仅 console.error 输出问题（含具体格坐标），绝不调用 setPosition 或修改任何数据。
 * 检查项：col/row 边界 / 道路相邻曼哈顿距离=1 / 塔位不与道路重复 / 塔位不重复 /
 *         PATH_WAYPOINTS 必须由 PATH_CELLS 派生（禁止手写 Vec3）/ 塔位不压道路 / 出入口不越界。
 */
export function validateMapLayout(): void {
    const errors: string[] = [];

    // 1. 道路格边界
    for (const c of PATH_CELLS) {
        if (c.col < 0 || c.col >= GRID_COLS || c.row < 0 || c.row >= GRID_ROWS) {
            errors.push(`道路格越界: (${c.col},${c.row})`);
        }
    }

    // 2. 道路相邻格曼哈顿距离必须为 1
    for (let i = 0; i < PATH_CELLS.length - 1; i++) {
        const a = PATH_CELLS[i];
        const b = PATH_CELLS[i + 1];
        const m = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
        if (m !== 1) {
            errors.push(`道路相邻格不相邻: (${a.col},${a.row})→(${b.col},${b.row}) 曼哈顿=${m}`);
        }
    }

    // 3. 塔位边界 / 不与道路重复 / 不重复
    const pathSet = new Set(PATH_CELLS.map(c => `${c.col},${c.row}`));
    const seen = new Set<string>();
    for (const c of BUILD_CELLS) {
        if (c.col < 0 || c.col >= GRID_COLS || c.row < 0 || c.row >= GRID_ROWS) {
            errors.push(`塔位越界: (${c.col},${c.row})`);
            continue;
        }
        const key = `${c.col},${c.row}`;
        if (pathSet.has(key)) errors.push(`塔位与道路格重复: (${c.col},${c.row})`);
        if (seen.has(key)) errors.push(`塔位重复: (${c.col},${c.row})`);
        seen.add(key);
    }

    // 4. 地图元素禁止手写 Vec3：PATH_WAYPOINTS 必须由 PATH_CELLS 派生（长度一致视为派生）
    if (PATH_WAYPOINTS.length !== PATH_CELLS.length) {
        errors.push('PATH_WAYPOINTS 与 PATH_CELLS 长度不一致（疑似手写 Vec3，应改用 gridToLocal 派生）');
    }

    // 5. 塔位不压道路（距离检查）
    const overlapThreshold = ROAD_HALF_STROKE + SLOT_RADIUS + MIN_ROAD_CLEARANCE;
    for (const c of BUILD_CELLS) {
        const p = gridToLocal(c);
        let minRoad = Infinity;
        for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
            const a = PATH_WAYPOINTS[i];
            const b = PATH_WAYPOINTS[i + 1];
            const d = distToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
            if (d < minRoad) minRoad = d;
        }
        if (minRoad < overlapThreshold) {
            errors.push(`塔位距道路过近: (${c.col},${c.row}) 距道路=${minRoad.toFixed(1)} 阈值=${overlapThreshold}`);
        }
    }

    // 6. 入口/基地不越界
    for (const [name, cell] of [['入口', ENTRANCE_CELL], ['基地', BASE_CELL]] as const) {
        if (cell.col < 0 || cell.col >= GRID_COLS || cell.row < 0 || cell.row >= GRID_ROWS) {
            errors.push(`${name}格越界: (${cell.col},${cell.row})`);
        }
    }

    if (errors.length > 0) {
        console.error('[MapLayout] 校验失败（仅提示，未修改地图数据）：');
        for (const e of errors) console.error('  - ' + e);
    }
}
