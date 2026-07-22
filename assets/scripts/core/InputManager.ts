import { _decorator, Component, Vec3, Node, EventTouch, UITransform, v3 } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { GridManager } from '../core/GridManager';
import { TowerManager } from '../towers/TowerManager';
import { TowerMenu } from '../ui/TowerMenu';

const { ccclass, property } = _decorator;

/**
 * InputManager - 输入管理器
 *
 * 职责：
 *  - 处理玩家点击/触摸操作
 *  - 判断点击位置：空地 → 显示建塔菜单；已有塔 → 显示升级菜单
 */
@ccclass('InputManager')
export class InputManager extends Component {
    @property({ type: GridManager, tooltip: '网格管理器' })
    public gridManager: GridManager | null = null;

    @property({ type: TowerManager, tooltip: '塔管理器' })
    public towerManager: TowerManager | null = null;

    @property({ type: TowerMenu, tooltip: '塔菜单' })
    public towerMenu: TowerMenu | null = null;

    protected onLoad(): void {
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnded, this);
    }

    protected onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnded, this);
    }

    private onTouchEnded(event: EventTouch): void {
        const gm = GameManager.Instance;
        if (!gm) return;

        const uiPos = event.getUILocation();
        const worldPos = v3(uiPos.x, uiPos.y, 0);

        if (!this.gridManager) return;

        const grid = this.gridManager.worldToGrid(worldPos);

        if (this.gridManager.canBuildAt(grid.col, grid.row)) {
            // 空地 - 显示建塔菜单
            const slotPos = this.gridManager.gridToWorld(grid.col, grid.row);
            this.towerMenu?.showBuildMenu(slotPos);
        } else {
            // 检查是否点击了已有塔
            this.checkTowerClick(worldPos);
        }
    }

    private checkTowerClick(worldPos: Vec3): void {
        if (!this.towerManager) return;

        for (const tower of this.towerManager.Towers) {
            const dist = Vec3.distance(tower.node.position, worldPos);
            if (dist < 32) {
                this.towerMenu?.showUpgradeMenu(tower);
                return;
            }
        }

        // 点击空白区域 - 隐藏菜单
        this.towerMenu?.hideAllMenus();
    }
}
