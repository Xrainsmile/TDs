import { Vec3 } from 'cc';
import { MAP_DESIGN_WIDTH, MAP_DESIGN_HEIGHT, PATH_WAYPOINTS } from './GameBalance';

// ============================================================
// PortraitLayoutSystem — 竖屏地图/塔位统一布局系统
//
// 强制约束：
//  * 塔位数据只能保存 row 和 column，禁止保存 x/y 坐标。
//  * 除本系统外，其他代码禁止直接 setPosition 布置地图与塔位。
//  * 后续修改只能调整 LayoutConfig 或某个塔位的 row/column。
//  * 开发模式提供布局校验（同列 x 一致 / 镜像对称 / 不越界不重叠路径 / 8px 吸附）。
// ============================================================

// ===== 固定列定义（集中于此，唯一来源）=====
// 4 列按战场宽度百分比定位；左右成对严格镜像（0.08↔0.92、0.22↔0.78）
export type SlotColumn = 'leftOuter' | 'leftInner' | 'rightInner' | 'rightOuter';

export const LAYOUT_COLUMNS: Record<SlotColumn, number> = {
    leftOuter: 0.08,
    leftInner: 0.22,
    rightInner: 0.78,
    rightOuter: 0.92,
};

// 镜像列映射：用于校验左右成对塔位是否对称
export const COLUMN_MIRROR: Record<SlotColumn, SlotColumn> = {
    leftOuter: 'rightOuter',
    rightOuter: 'leftOuter',
    leftInner: 'rightInner',
    rightInner: 'leftInner',
};

// ===== 固定行定义（row 索引 → BattleRoot 局部 y 坐标）=====
// 转角附近用内列，直线段附近用外列。所有塔位 y 取自固定行集合，杜绝逐塔微调。
export const LAYOUT_ROWS: number[] = [
    330,   // row 0：入口转角附近（内列）
    240,   // row 1：顶部直线段（外列）
    150,   // row 2：转角（内列）
    60,    // row 3：直线段（外列）
    -30,   // row 4：转角（内列）
    -120,  // row 5：直线段（外列）
    -210,  // row 6：转角（内列）
    -300,  // row 7：直线段（外列）
    -330,  // row 8：基地转角附近（内列）
];

// 每行允许使用的列（转角→内列，直线段→外列）
export const ROW_COLUMNS: SlotColumn[][] = [
    ['leftInner', 'rightInner'],     // row 0
    ['leftOuter', 'rightOuter'],     // row 1
    ['leftInner', 'rightInner'],     // row 2
    ['leftOuter', 'rightOuter'],     // row 3
    ['leftInner', 'rightInner'],     // row 4
    ['leftOuter', 'rightOuter'],     // row 5
    ['leftInner', 'rightInner'],     // row 6
    ['leftOuter', 'rightOuter'],     // row 7
    ['leftInner', 'rightInner'],     // row 8
];

// ===== 塔位清单：只保存 row 和 column（禁止 x/y）=====
export interface SlotCell {
    row: number;
    column: SlotColumn;
}

export const SLOT_CELLS: SlotCell[] = [
    { row: 0, column: 'leftInner' },
    { row: 0, column: 'rightInner' },
    { row: 1, column: 'leftOuter' },
    { row: 1, column: 'rightOuter' },
    { row: 2, column: 'leftInner' },
    { row: 2, column: 'rightInner' },
    { row: 3, column: 'leftOuter' },
    { row: 3, column: 'rightOuter' },
    { row: 4, column: 'leftInner' },
    { row: 4, column: 'rightInner' },
    { row: 5, column: 'leftOuter' },
    { row: 5, column: 'rightOuter' },
    { row: 6, column: 'leftInner' },
    { row: 6, column: 'rightInner' },
    { row: 7, column: 'leftOuter' },
    { row: 7, column: 'rightOuter' },
    { row: 8, column: 'leftInner' },
    { row: 8, column: 'rightInner' },
];

// 8px 吸附网格步长
const SNAP_GRID = 8;

export interface LayoutGeometry {
    battleWidth: number;
    battleLeft: number;
    battleCenterX: number;   // 通常为 0
    mapScale: number;
}

/**
 * 根据固定列/行 + 战场几何，把 {row, column} 解析为 BattleRoot 局部坐标。
 * 列 x 按战场宽度百分比计算并转局部坐标；行 y 取自固定行集合。
 * 结果自动吸附到 8px 网格（坐标未对齐网格时自动吸附）。
 */
export function resolveSlotPosition(cell: SlotCell, geo: LayoutGeometry): Vec3 {
    const colRatio = LAYOUT_COLUMNS[cell.column];
    const screenX = geo.battleLeft + colRatio * geo.battleWidth;
    let localX = (screenX - geo.battleCenterX) / geo.mapScale;
    let localY = LAYOUT_ROWS[cell.row];

    // 8px 网格吸附
    localX = Math.round(localX / SNAP_GRID) * SNAP_GRID;
    localY = Math.round(localY / SNAP_GRID) * SNAP_GRID;

    return new Vec3(localX, localY, 0);
}

/**
 * 生成全部塔位的局部坐标（数组顺序与 SLOT_CELLS 一致）。
 */
export function generateSlotPositions(geo: LayoutGeometry): Vec3[] {
    return SLOT_CELLS.map(c => resolveSlotPosition(c, geo));
}

// ===== 开发模式校验（仅在 DEBUG 时调用，错误直接抛出）=====

/** 路径走廊半宽（局部坐标），用于重叠判定 */
function pathCorridorHalfWidth(): number {
    // PATH_WAYPOINTS 在 BattleRoot 局部坐标；走廊 x 范围约 [-120,120]，留边 20
    return 140;
}

/**
 * 校验全部塔位：
 *  - 同列塔位 x 不一致 → 抛出
 *  - 镜像塔位不对称 → 抛出
 *  - 塔位超出战场或与道路重叠 → 抛出
 * 坐标未对齐 8px 网格已在 resolveSlotPosition 自动吸附，此处仅校验吸附后数值。
 */
export function validateLayout(geo: LayoutGeometry): void {
    const positions = SLOT_CELLS.map(c => ({ cell: c, pos: resolveSlotPosition(c, geo) }));

    // 1. 同列 x 完全一致
    const byCol = new Map<SlotColumn, number[]>();
    for (const { cell, pos } of positions) {
        const arr = byCol.get(cell.column) ?? [];
        arr.push(pos.x);
        byCol.set(cell.column, arr);
    }
    for (const [col, xs] of byCol) {
        const first = xs[0];
        for (const x of xs) {
            if (Math.abs(x - first) > 0.01) {
                throw new Error(`[Layout] 同列塔位 x 不一致：列 ${col} 出现 ${x} 与 ${first}`);
            }
        }
    }

    // 2. 镜像塔位严格对称（x 互为相反数）
    const posByCell = new Map<string, Vec3>();
    positions.forEach(({ cell, pos }) => posByCell.set(`${cell.row}:${cell.column}`, pos));
    for (const { cell, pos } of positions) {
        const mirror = COLUMN_MIRROR[cell.column];
        const m = posByCell.get(`${cell.row}:${mirror}`);
        if (m && Math.abs(pos.x + m.x) > 0.01) {
            throw new Error(`[Layout] 镜像塔位不对称：(${cell.row},${cell.column}) x=${pos.x} 与镜像 (${cell.row},${mirror}) x=${m.x}`);
        }
    }

    // 3. 不超出战场、不与道路重叠（BattleRoot 局部坐标，半宽 MAP_DESIGN_WIDTH/2）
    const halfW = MAP_DESIGN_WIDTH / 2;
    const halfH = MAP_DESIGN_HEIGHT / 2;
    const corridor = pathCorridorHalfWidth();
    for (const { cell, pos } of positions) {
        if (Math.abs(pos.x) > halfW || Math.abs(pos.y) > halfH) {
            throw new Error(`[Layout] 塔位超出战场：(${cell.row},${cell.column}) = (${pos.x},${pos.y})`);
        }
        if (Math.abs(pos.x) < corridor) {
            throw new Error(`[Layout] 塔位与道路重叠：(${cell.row},${cell.column}) x=${pos.x} 落入走廊 ±${corridor}`);
        }
    }

    // 4. 坐标未对齐 8px 网格的，resolveSlotPosition 已吸附；此处确认结果确为 8 的倍数
    for (const { cell, pos } of positions) {
        if (pos.x % SNAP_GRID !== 0 || pos.y % SNAP_GRID !== 0) {
            throw new Error(`[Layout] 塔位坐标未对齐 ${SNAP_GRID}px 网格：(${cell.row},${cell.column}) = (${pos.x},${pos.y})`);
        }
    }
}
