import { _decorator, Component, Node, Vec3 } from 'cc';
import { Constants } from '../core/Constants';

const { ccclass, property } = _decorator;

/**
 * GridManager - 网格地图管理器
 *
 * 职责：
 *  - 管理可放置塔的格子
 *  - 将屏幕坐标转换为网格坐标
 *  - 检测格子是否已被占用
 */
@ccclass('GridManager')
export class GridManager extends Component {
    @property({ tooltip: '格子大小（像素）' })
    public cellSize: number = 64;

    @property({ tooltip: '地图起始 X 坐标' })
    public originX: number = 0;

    @property({ tooltip: '地图起始 Y 坐标' })
    public originY: number = 0;

    /** 可放置塔的格子集合（key = "col,row"） */
    private _buildSlots: Set<string> = new Set();
    /** 已被占用的格子 */
    private _occupiedSlots: Set<string> = new Set();

    /**
     * 添加可放置格子
     */
    public addBuildSlot(col: number, row: number): void {
        this._buildSlots.add(`${col},${row}`);
    }

    /**
     * 批量添加可放置格子
     */
    public addBuildSlots(slots: { x: number; y: number }[]): void {
        for (const slot of slots) {
            this.addBuildSlot(slot.x, slot.y);
        }
    }

    /**
     * 世界坐标 → 网格坐标
     */
    public worldToGrid(worldPos: Vec3): { col: number; row: number } {
        return {
            col: Math.floor((worldPos.x - this.originX) / this.cellSize),
            row: Math.floor((worldPos.y - this.originY) / this.cellSize),
        };
    }

    /**
     * 网格坐标 → 世界坐标（格子中心）
     */
    public gridToWorld(col: number, row: number): Vec3 {
        return new Vec3(
            this.originX + col * this.cellSize + this.cellSize / 2,
            this.originY + row * this.cellSize + this.cellSize / 2,
            0,
        );
    }

    /**
     * 检查格子是否可放置塔
     */
    public canBuildAt(col: number, row: number): boolean {
        const key = `${col},${row}`;
        return this._buildSlots.has(key) && !this._occupiedSlots.has(key);
    }

    /**
     * 标记格子为已占用
     */
    public occupy(col: number, row: number): void {
        this._occupiedSlots.add(`${col},${row}`);
    }

    /**
     * 释放格子占用
     */
    public release(col: number, row: number): void {
        this._occupiedSlots.delete(`${col},${row}`);
    }

    /**
     * 获取可放置格子总数
     */
    public get BuildSlotCount(): number {
        return this._buildSlots.size;
    }

    /**
     * 获取已占用格子数
     */
    public get OccupiedCount(): number {
        return this._occupiedSlots.size;
    }

    /**
     * 清空所有占用
     */
    public clearOccupied(): void {
        this._occupiedSlots.clear();
    }
}
