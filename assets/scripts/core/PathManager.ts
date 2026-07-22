import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * PathManager - 敌人移动路径管理
 *
 * 存储路径点序列，提供进度查询与位置插值
 */
@ccclass('PathManager')
export class PathManager extends Component {
    @property({ type: [Vec3], tooltip: '敌人移动路径点（世界坐标）' })
    public waypoints: Vec3[] = [];

    /** 路径总长度 */
    private _totalLength: number = 0;
    /** 各段累积长度 */
    private _segmentLengths: number[] = [];

    protected onLoad(): void {
        this.calculateLength();
    }

    private calculateLength(): void {
        this._totalLength = 0;
        this._segmentLengths = [0];
        for (let i = 1; i < this.waypoints.length; i++) {
            const dist = Vec3.distance(this.waypoints[i - 1], this.waypoints[i]);
            this._totalLength += dist;
            this._segmentLengths.push(this._totalLength);
        }
    }

    /** 路径点数量 */
    public get WaypointCount(): number {
        return this.waypoints.length;
    }

    /** 路径总长度 */
    public get TotalLength(): number {
        return this._totalLength;
    }

    /**
     * 根据进度（0~1）获取路径上的位置
     */
    public getPositionAtProgress(progress: number, out: Vec3): Vec3 {
        if (this.waypoints.length === 0) {
            out.set(0, 0, 0);
            return out;
        }
        if (this.waypoints.length === 1) {
            out.set(this.waypoints[0]);
            return out;
        }

        const targetDist = Math.max(0, Math.min(1, progress)) * this._totalLength;

        // 二分查找所在段
        let lo = 0;
        let hi = this._segmentLengths.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this._segmentLengths[mid] <= targetDist) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }

        const segStart = lo;
        const segEnd = Math.min(segStart + 1, this.waypoints.length - 1);
        const segLen = this._segmentLengths[segEnd] - this._segmentLengths[segStart];
        const t = segLen > 0 ? (targetDist - this._segmentLengths[segStart]) / segLen : 0;

        Vec3.lerp(out, this.waypoints[segStart], this.waypoints[segEnd], t);
        return out;
    }

    /**
     * 获取下一个路径点索引
     */
    public getNextWaypointIndex(currentIndex: number): number {
        return Math.min(currentIndex + 1, this.waypoints.length - 1);
    }

    /**
     * 获取路径点
     */
    public getWaypoint(index: number): Vec3 {
        if (index < 0 || index >= this.waypoints.length) {
            return Vec3.ZERO;
        }
        return this.waypoints[index];
    }

    /** 是否到达终点 */
    public isAtEnd(currentIndex: number): boolean {
        return currentIndex >= this.waypoints.length - 1;
    }
}
