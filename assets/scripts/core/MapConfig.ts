import { Vec3 } from 'cc';

// ============================================================
// MapConfig — 9×10 甜品台地图（固定设计坐标，唯一来源）
//
//  美术主题：甜品台保卫战（Dessert Table Defense）
//    桌布台面 = 地图底板
//    糖渍痕迹 = 敌人路径（虫子爬过留下的黏痕）
//    圆形餐垫 = 塔位（摆放厨具的位置）
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
//  塔位：显式配置的 30 个餐垫位
//
//  全部满足：非路径格 且 到最近路径格曼哈顿距离 = 1（紧邻糖渍，射程收益最高）。
//  刻意排除 col=0 / col=8 的最外圈（(0,2)(0,3)(0,4)(0,5)(8,2)(8,3)(8,4)(8,5)），
//  避免塔贴在地图最边缘、视觉上"浮在桌布外"。
// ============================================================
export const BUILD_CELLS: GridCell[] = [
    // 顶部：入口两侧（拦截第一波）
    { col: 3, row: 0 }, { col: 5, row: 0 },
    // 上段分叉前
    { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 },
    { col: 5, row: 1 }, { col: 6, row: 1 }, { col: 7, row: 1 },
    // 中段：两路之间的"中央岛"（一座塔可兼顾左右）
    { col: 2, row: 3 }, { col: 3, row: 3 }, { col: 4, row: 3 },
    { col: 5, row: 3 }, { col: 6, row: 3 },
    { col: 2, row: 4 }, { col: 6, row: 4 },
    { col: 3, row: 5 }, { col: 5, row: 5 },
    // 下段：汇合前的最后拦截
    { col: 1, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 },
    { col: 5, row: 6 }, { col: 7, row: 6 },
    { col: 1, row: 7 }, { col: 7, row: 7 },
    // 底部：基地前最后防线
    { col: 2, row: 8 }, { col: 3, row: 8 }, { col: 5, row: 8 }, { col: 6, row: 8 },
    { col: 3, row: 9 }, { col: 5, row: 9 },
];

// ============================================================
//  封闭格（灰色餐垫，需锤子敲开才能放塔）
//
//  显式以网格坐标配置，避免地图排序/塔位数量变化后封闭位置漂移。
//  12/30 锁定（40%）：左右两路各 5 个、中路 2 个，均匀分散，
//  保证玩家无论主攻哪一路都要为"好位置"付出锤子。
//  注意：只有落在 BUILD_CELLS 内的坐标才会生效，配在集合外会被静默忽略。
// ============================================================
export const LOCKED_BUILD_CELLS: GridCell[] = [
    // 顶部
    { col: 3, row: 0 },
    // 上段
    { col: 2, row: 1 }, { col: 6, row: 1 },
    // 中段
    { col: 3, row: 3 }, { col: 5, row: 3 }, { col: 2, row: 4 }, { col: 5, row: 5 },
    // 下段
    { col: 1, row: 6 }, { col: 4, row: 6 }, { col: 7, row: 6 },
    // 底部
    { col: 3, row: 8 }, { col: 5, row: 9 },
];

export const LOCKED_BUILD_CELL_KEYS: Set<string> = new Set(
    LOCKED_BUILD_CELLS.map(cellKey)
);

// ===== 渲染参数 =====
export const ROAD_WIDTH_RATIO = 0.72;   // 糖渍宽度 = CELL_SIZE 的 72%
export const SLOT_SIZE_RATIO = 0.72;    // 餐垫直径 = CELL_SIZE 的 72%
