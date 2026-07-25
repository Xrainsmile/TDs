import { Vec3 } from 'cc';

// ============================================================
// MapConfig — 6×8 逻辑网格地图（固定设计坐标，唯一来源）
//
//  * 地图元素（道路/塔位/入口/基地）以网格坐标 GridCell{col,row} 组织，
//    位置由 gridToLocal() 计算（MapRoot 局部坐标）。
//  * 屏幕适配只操作 BattleRoot（整体等比缩放 + 居中），不重排内部元素。
//  * 约定仅为协作规范，运行时不强制校验，研发可按需调整地图布局。
// ============================================================

// ===== 网格定义 =====
export const GRID_COLS = 6;
export const GRID_ROWS = 8;
export const CELL_SIZE = 60;   // 目标棋盘 360×480

export const MAP_DESIGN_WIDTH = GRID_COLS * CELL_SIZE;   // 360
export const MAP_DESIGN_HEIGHT = GRID_ROWS * CELL_SIZE;  // 480

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
// 除道路格外，所有格子都可放塔（共 6×8 - 16 = 32 个）。
export const BUILD_CELLS: GridCell[] = (() => {
    const pathSet = new Set(PATH_CELLS.map(c => `${c.col},${c.row}`));
    const cells: GridCell[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            if (!pathSet.has(`${c},${r}`)) cells.push({ col: c, row: r });
        }
    }
    return cells;
})();

// ===== 渲染参数 =====
export const ROAD_WIDTH_RATIO = 0.65;   // 道路宽度 = CELL_SIZE 的 65%
export const SLOT_SIZE_RATIO = 0.70;    // 塔位尺寸 = CELL_SIZE 的 70%

