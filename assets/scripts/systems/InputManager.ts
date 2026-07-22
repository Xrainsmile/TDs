import { _decorator, Component, Node, EventTouch, v3, Vec3 } from 'cc';
import { GameState } from '../core/Constants';
import { GameStateManager } from '../systems/GameStateManager';
import { GridManager } from './GridManager';
import { TowerController } from './TowerController';
import { TowerMenu } from '../ui/TowerMenu';
import { Tower } from '../entities/Tower';

const { ccclass, property } = _decorator;

/**
 * InputManager - 输入管理器
 *
 * 处理点击/触摸操作：
 *  - 点击空地 → 显示建塔菜单
 *  - 点击已有塔 → 显示升级/出售菜单
 *  - 点击空白区域 → 隐藏菜单
 */
@ccclass('InputManager')
export class InputManager extends Component {
    @property({ type: GridManager })
    public gridManager: GridManager | null = null;

    @property({ type: TowerController })
    public towerController: TowerController | null = null;

    @property({ type: TowerMenu })
    public towerMenu: TowerMenu | null = null;

    private _gsm: GameStateManager | null = null;

    public init(gsm: GameStateManager): void {
        this._gsm = gsm;
    }

    protected onLoad(): void {
        console.log('InputManager: onLoad, node =', this.node.name);
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnded, this);
    }

    protected onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnded, this);
    }

    private onTouchStart(event: EventTouch): void {
        console.log('InputManager: TOUCH_START 收到');
    }

    private onTouchEnded(event: EventTouch): void {
        if (!this._gsm) {
            console.log('InputManager: _gsm 为空');
            return;
        }

        const state = this._gsm.State;
        if (state !== GameState.PREPARING && state !== GameState.WAVE_RUNNING && state !== GameState.WAVE_CLEARED) {
            console.log(`InputManager: 当前状态 ${state}，不可操作`);
            return;
        }

        // getUILocation() 返回 UI 坐标，已经是基于设计分辨率的坐标（中心为原点）
        const uiPos = event.getUILocation();
        const worldPos = v3(uiPos.x, uiPos.y, 0);

        if (!this.gridManager) {
            console.log('InputManager: gridManager 为空');
            return;
        }

        const grid = this.gridManager.worldToGrid(worldPos);
        console.log(`InputManager: UI坐标 (${uiPos.x.toFixed(0)}, ${uiPos.y.toFixed(0)}) → 网格 (${grid.col}, ${grid.row})`);

        if (this.gridManager.canBuildAt(grid.col, grid.row)) {
            const slotPos = this.gridManager.gridToWorld(grid.col, grid.row);
            console.log(`InputManager: 可以建塔，位置 (${slotPos.x.toFixed(0)}, ${slotPos.y.toFixed(0)})`);
            this.towerMenu?.showBuildMenu(slotPos);
        } else {
            this.checkTowerClick(worldPos);
        }
    }

    private checkTowerClick(worldPos: Vec3): void {
        if (!this.towerController) return;

        for (const tower of this.towerController.Towers) {
            const dist = Vec3.distance(tower.node.position, worldPos);
            if (dist < 32) {
                this.towerMenu?.showUpgradeMenu(tower);
                return;
            }
        }

        // 点击空白 → 隐藏菜单
        this.towerMenu?.hideAllMenus();
    }
}
