import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * PathManager - 敌人移动路径管理
 *
 * 存储路径点序列，提供位置插值查询
 */
@ccclass('PathManager')
export class PathManager extends Component {
    @property({ type: [Vec3], tooltip: '敌人移动路径点（世界坐标）' })
    public waypoints: Vec3[] = [];

    private _totalLength: number = 0;
    private _segmentLengths: number[] = [];

    protected onLoad(): void { this.calculateLength(); }

    /** 从配置设置路径点 */
    public setWaypoints(points: { x: number; y: number }[]): void {
        this.waypoints = points.map(p => new Vec3(p.x, p.y, 0));
        this.calculateLength();
    }

    private calculateLength(): void {
        this._totalLength = 0;
        this._segmentLengths = [0];
        for (let i = 1; i < this.waypoints.length; i++) {
            this._totalLength += Vec3.distance(this.waypoints[i - 1], this.waypoints[i]);
            this._segmentLengths.push(this._totalLength);
        }
    }

    public get WaypointCount(): number { return this.waypoints.length; }
    public get TotalLength(): number { return this._totalLength; }

    public getWaypoint(index: number): Vec3 {
        if (index < 0 || index >= this.waypoints.length) return Vec3.ZERO;
        return this.waypoints[index];
    }

    public getNextWaypointIndex(currentIndex: number): number {
        return Math.min(currentIndex + 1, this.waypoints.length - 1);
    }

    public isAtEnd(currentIndex: number): boolean {
        return currentIndex >= this.waypoints.length - 1;
    }
}
