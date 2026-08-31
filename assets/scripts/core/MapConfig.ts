import { Vec3 } from 'cc';

// ============================================================
// MapConfig — 9×10 甜品台地图（固定设计坐标，唯一来源）
//
//  美术主题：甜品台保卫战（Dessert Table Defense）
//    桌布台面 = 地图底板
//    糖渍痕迹 = 敌人路径（虫子爬过留下的黏痕）
//    方块格 = 塔位（可放置 / 需起子激活 / 完全不可用）
//    奶油蛋糕 = 基地（需要保卫的目标）
//    台面裂缝 = 入口（虫子从这里爬上来）
//
//  路径结构（借鉴 Kingdom Rush 的分叉设计）：
//    入口共用段 → 中部 (4,2) 分叉为左右两路 → 汇合于 (4,7) → 基地
//    两路等长（各 16 格），分叉只改变防守重心的取舍，不改变路程长度。
//
//  * 地图元素以网格坐标 GridCell{col,row} 组织，位置由 gridToLocal() 计算。
//  * 屏幕适配只操作 BattleRoot（整体等比缩放 + 居中），不重排内部元素。
// ============================================================

// ===== 网格定义 =====
export const GRID_COLS = 9;
export const GRID_ROWS = 10;
export const CELL_SIZE = 64;   // 目标棋盘 576×640，铺满 640×960 下的战场区（616×654）

export const MAP_DESIGN_WIDTH = GRID_COLS * CELL_SIZE;   // 576
export const MAP_DESIGN_HEIGHT = GRID_ROWS * CELL_SIZE;  // 640

/** 格子类型 */
export enum CellType {
    PATH = 'path',           // 敌人路径（糖渍覆盖）
    AVAILABLE = 'available',  // 可放置（浅棕黄 + 加号，每局随机 6 个）
    LOCKED = 'locked',       // 需起子激活（灰色 + 起子图标）
    BLOCKED = 'blocked',     // 完全不可放置（白色，无图标）
}

export interface GridCell {
    col: number; // 0~8，左到右
    row: number; // 0~9，上到下
}

export function cellKey(c: GridCell): string { return `${c.col},${c.row}`; }

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

// ============================================================
//  路径：单入口 → 双路分叉 → 单出口
// ============================================================

/** 入口共用段（顶部裂缝 → 分叉点） */
export const TRUNK_IN_CELLS: GridCell[] = [
    { col: 4, row: 0 },
    { col: 4, row: 1 },
    { col: 4, row: 2 },   // 分叉点
];

/** 左路：绕行左侧餐盘区 */
export const BRANCH_A_CELLS: GridCell[] = [
    { col: 4, row: 2 },
    { col: 3, row: 2 },
    { col: 2, row: 2 },
    { col: 1, row: 2 },
    { col: 1, row: 3 },
    { col: 1, row: 4 },
    { col: 1, row: 5 },
    { col: 2, row: 5 },
    { col: 2, row: 6 },
    { col: 2, row: 7 },
    { col: 3, row: 7 },
    { col: 4, row: 7 },   // 汇合点
];

/** 右路：绕行右侧茶壶区（与左路镜像，长度一致） */
export const BRANCH_B_CELLS: GridCell[] = [
    { col: 4, row: 2 },
    { col: 5, row: 2 },
    { col: 6, row: 2 },
    { col: 7, row: 2 },
    { col: 7, row: 3 },
    { col: 7, row: 4 },
    { col: 7, row: 5 },
    { col: 6, row: 5 },
    { col: 6, row: 6 },
    { col: 6, row: 7 },
    { col: 5, row: 7 },
    { col: 4, row: 7 },   // 汇合点
];

/** 出口共用段（汇合点 → 基地） */
export const TRUNK_OUT_CELLS: GridCell[] = [
    { col: 4, row: 7 },
    { col: 4, row: 8 },
    { col: 4, row: 9 },   // 基地
];

/** 拼接路径段，自动去掉相邻重复端点 */
function joinPath(...segments: GridCell[][]): GridCell[] {
    const out: GridCell[] = [];
    for (const seg of segments) {
        for (const c of seg) {
            const last = out[out.length - 1];
            if (last && last.col === c.col && last.row === c.row) continue;
            out.push({ col: c.col, row: c.row });
        }
    }
    return out;
}

/** 两条完整路径（各 16 格，等长） */
export const PATH_BRANCHES: GridCell[][] = [
    joinPath(TRUNK_IN_CELLS, BRANCH_A_CELLS, TRUNK_OUT_CELLS),
    joinPath(TRUNK_IN_CELLS, BRANCH_B_CELLS, TRUNK_OUT_CELLS),
];

export const BRANCH_COUNT = PATH_BRANCHES.length;

/** 主路径（= 左路），兼容只认单条路径的旧代码与调试视图 */
export const PATH_CELLS: GridCell[] = PATH_BRANCHES[0];

// 入口 = 第一条路径的起点；基地 = 终点（两路起终点相同）
export const ENTRANCE_CELL: GridCell = PATH_BRANCHES[0][0];
export const BASE_CELL: GridCell = PATH_BRANCHES[0][PATH_BRANCHES[0].length - 1];

// 路径 waypoints（必须由路径格派生，禁止手写 Vec3）
export const PATH_BRANCH_WAYPOINTS: Vec3[][] = PATH_BRANCHES.map(cells => cells.map(gridToLocal));
export const PATH_WAYPOINTS: Vec3[] = PATH_BRANCH_WAYPOINTS[0];
export const ENTRANCE: Vec3 = gridToLocal(ENTRANCE_CELL);
export const BASE: Vec3 = gridToLocal(BASE_CELL);

/** 路径占用的全部格子（两路并集，用于塔位筛选；不用 flat 以兼容 ES5 target） */
export const PATH_CELL_KEYS: Set<string> = (() => {
    const keys = new Set<string>();
    for (const branch of PATH_BRANCHES) {
        for (const cell of branch) keys.add(cellKey(cell));
    }
    return keys;
})();

// ============================================================
//  全量格子类型表（9×10 = 90 格）
//
//  默认规则：
//    PATH_CELL_KEYS 内的 → CellType.PATH
//    其余非路径格 → 默认 CellType.LOCKED（需起子激活）
//    四角边缘 → CellType.BLOCKED（完全不可用，视觉白色）
//    每局随机 6 个 → CellType.AVAILABLE（浅棕黄 + 加号）
// ============================================================

/** 完全不可用的角落/边缘格（白色，不放塔也不需激活） */
export const BLOCKED_CELLS: GridCell[] = [
    // 左上角区域
    { col: 0, row: 0 }, { col: 0, row: 1 },
    // 右上角区域
    { col: 8, row: 0 }, { col: 8, row: 1 },
    // 左下角区域
    { col: 0, row: 8 }, { col: 0, row: 9 }, { col: 1, row: 9 },
    // 右下角区域
    { col: 7, row: 9 }, { col: 8, row: 8 }, { col: 8, row: 9 },
];

export const BLOCKED_CELL_KEYS: Set<string> = new Set(BLOCKED_CELLS.map(cellKey));

/**
 * 所有潜在可建造格（非路径、非封锁）：从中随机选 6 个作为 AVAILABLE，
 * 其余默认为 LOCKED。
 * 这些是旧版 BUILD_CELLS 的超集——覆盖所有非路径非封锁格。
 */
export const ALL_BUILDABLE_CELLS: GridCell[] = (() => {
    const cells: GridCell[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const key = `${c},${r}`;
            if (!PATH_CELL_KEYS.has(key) && !BLOCKED_CELL_KEYS.has(key)) {
                cells.push({ col: c, row: r });
            }
        }
    }
    return cells;
})();

/** 兼容旧代码：所有可建造格 = ALL_BUILDABLE_CELLS */
export const BUILD_CELLS: GridCell[] = ALL_BUILDABLE_CELLS;

/**
 * 每局生成随机可用格（从 ALL_BUILDABLE_CELLS 中随机选 count 个）。
 * 使用 Fisher-Yates 洗牌保证均匀分布。
 *
 * @param count 可用格数量（默认 6）
 * @param rngRandom 随机函数（默认 Math.random，测试时可注入固定种子）
 * @returns 可用格的 cellKey Set
 */
export function generateAvailableCells(
    count: number = 6,
    rngRandom: () => number = Math.random
): Set<string> {
    const pool = [...ALL_BUILDABLE_CELLS];
    // Fisher-Yates 洗牌前 count 个
    for (let i = 0; i < Math.min(count, pool.length); i++) {
        const j = i + Math.floor(rngRandom() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return new Set(pool.slice(0, count).map(cellKey));
}

/**
 * 获取某格的类型（静态配置，不含运行时随机状态）。
 * 返回 PATH / BLOCKED 或 null（表示可能是 AVAILABLE 或 LOCKED，需查运行时 availableSet）。
 */
export function getStaticCellType(cell: GridCell): CellType | null {
    if (PATH_CELL_KEYS.has(cellKey(cell))) return CellType.PATH;
    if (BLOCKED_CELL_KEYS.has(cellKey(cell))) return CellType.BLOCKED;
    return null;  // 需要运行时判断 AVAILABLE vs LOCKED
}

/**
 * 获取某格的完整类型（含运行时随机状态）。
 * @param cell 网格坐标
 * @param availableSet 本局随机可用格集合
 */
export function getCellType(cell: GridCell, availableSet: Set<string>): CellType {
    const staticType = getStaticCellType(cell);
    if (staticType !== null) return staticType;
    return availableSet.has(cellKey(cell)) ? CellType.AVAILABLE : CellType.LOCKED;
}

// ============================================================
//  旧版兼容：锁定格列表（用于关卡配置 lockedSlotCount）
//  新版逻辑已迁移到 generateAvailableCells + getCellType
// ============================================================

/** 所有非路径非封锁格中，除随机 available 外的都是 locked */
export const LOCKED_BUILD_CELLS: GridCell[] = [];  // 不再静态定义，由运行时动态决定

export const LOCKED_BUILD_CELL_KEYS: Set<string> = new Set();

// ===== 渲染参数 =====
export const ROAD_WIDTH_RATIO = 0.72;   // 糖渍宽度 = CELL_SIZE 的 72%
export const SLOT_SIZE_RATIO = 0.88;    // 方块填充比例（几乎填满格子，留小间隙）
