import { _decorator, Component, view, Vec3, v3, EventTouch } from 'cc';

const { ccclass, property } = _decorator;

/**
 * CoordinateService - 坐标转换服务
 *
 * 统一处理屏幕↔世界↔格子坐标转换
 * 所有交互（放塔/点击/技能）都通过此服务
 *
 * 设计分辨率 960x640，中心为原点
 */
@ccclass('CoordinateService')
export class CoordinateService extends Component {
    /** 设计分辨率 */
    public static readonly DESIGN_WIDTH = 960;
    public static readonly DESIGN_HEIGHT = 640;

    /** 格子大小 */
    @property
    public cellSize: number = 64;

    /** 地图原点（格子 0,0 对应的世界坐标） */
    @property
    public originX: number = 0;
    @property
    public originY: number = 0;

    /**
     * 触摸事件 → 世界坐标
     * getUILocation() 返回屏幕像素坐标（左下角原点，0~960）
     * 转为世界坐标（中心原点，-480~480）
     */
    public touchToWorld(event: EventTouch): Vec3 {
        const ui = event.getUILocation();
        return v3(
            ui.x - CoordinateService.DESIGN_WIDTH / 2,
            ui.y - CoordinateService.DESIGN_HEIGHT / 2,
            0,
        );
    }

    /**
     * 世界坐标 → 格子坐标
     */
    public worldToGrid(world: Vec3): { col: number; row: number } {
        return {
            col: Math.floor((world.x - this.originX) / this.cellSize),
            row: Math.floor((world.y - this.originY) / this.cellSize),
        };
    }

    /**
     * 格子坐标 → 世界坐标（格子中心）
     */
    public gridToWorld(col: number, row: number): Vec3 {
        return v3(
            this.originX + col * this.cellSize + this.cellSize / 2,
            this.originY + row * this.cellSize + this.cellSize / 2,
            0,
        );
    }

    /**
     * 触摸事件 → 格子坐标（一步到位）
     */
    public touchToGrid(event: EventTouch): { col: number; row: number } {
        return this.worldToGrid(this.touchToWorld(event));
    }

    /**
     * 触摸事件 → 世界坐标（字符串，调试用）
     */
    public debugTouch(event: EventTouch): string {
        const world = this.touchToWorld(event);
        const grid = this.worldToGrid(world);
        return `touch(${event.getUILocation().x.toFixed(0)},${event.getUILocation().y.toFixed(0)}) → world(${world.x.toFixed(0)},${world.y.toFixed(0)}) → grid(${grid.col},${grid.row})`;
    }
}
