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
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnded, this);
    }

    protected onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnded, this);
    }

    private onTouchEnded(event: EventTouch): void {
        if (!this._gsm) return;

        // 仅在 PREPARING 或 WAVE_RUNNING 或 WAVE_CLEARED 状态下可操作
        const state = this._gsm.State;
        if (state !== GameState.PREPARING && state !== GameState.WAVE_RUNNING && state !== GameState.WAVE_CLEARED) return;

        const uiPos = event.getUILocation();
        const worldPos = v3(uiPos.x, uiPos.y, 0);

        if (!this.gridManager) return;

        const grid = this.gridManager.worldToGrid(worldPos);

        if (this.gridManager.canBuildAt(grid.col, grid.row)) {
            // 空地 → 显示建塔菜单
            const slotPos = this.gridManager.gridToWorld(grid.col, grid.row);
            this.towerMenu?.showBuildMenu(slotPos);
        } else {
            // 检查是否点击了已有塔
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
