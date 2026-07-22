import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * GridManager - 网格地图管理器
 *
 * 管理可放置塔的格子，坐标转换，占用检测
 */
@ccclass('GridManager')
export class GridManager extends Component {
    @property({ tooltip: '格子大小（像素）' })
    public cellSize: number = 64;

    @property({ tooltip: '地图起始 X 坐标' })
    public originX: number = -320;

    @property({ tooltip: '地图起始 Y 坐标' })
    public originY: number = -192;

    private _buildSlots: Set<string> = new Set();
    private _occupiedSlots: Set<string> = new Set();

    public addBuildSlot(col: number, row: number): void { this._buildSlots.add(`${col},${row}`); }

    public addBuildSlots(slots: { x: number; y: number }[]): void {
        for (const s of slots) this.addBuildSlot(s.x, s.y);
    }

    /** 世界坐标 → 网格坐标 */
    public worldToGrid(worldPos: Vec3): { col: number; row: number } {
        return {
            col: Math.floor((worldPos.x - this.originX) / this.cellSize),
            row: Math.floor((worldPos.y - this.originY) / this.cellSize),
        };
    }

    /** 网格坐标 → 世界坐标（格子中心） */
    public gridToWorld(col: number, row: number): Vec3 {
        return new Vec3(
            this.originX + col * this.cellSize + this.cellSize / 2,
            this.originY + row * this.cellSize + this.cellSize / 2,
            0,
        );
    }

    public canBuildAt(col: number, row: number): boolean {
        const key = `${col},${row}`;
        return this._buildSlots.has(key) && !this._occupiedSlots.has(key);
    }

    public occupy(col: number, row: number): void { this._occupiedSlots.add(`${col},${row}`); }
    public release(col: number, row: number): void { this._occupiedSlots.delete(`${col},${row}`); }
    public clearOccupied(): void { this._occupiedSlots.clear(); }
}
