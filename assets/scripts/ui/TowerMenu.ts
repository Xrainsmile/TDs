import { _decorator, Component, Node, Vec3, UITransform, EventTouch } from 'cc';
import { GameManager } from '../core/GameManager';
import { EventNames } from '../core/EventNames';
import { TowerType, GameState, Constants } from '../core/Constants';
import { TowerManager } from '../towers/TowerManager';
import { Tower } from '../towers/Tower';

const { ccclass, property } = _decorator;

/**
 * TowerMenu - 塔放置/升级菜单
 *
 * 处理：
 *  - 玩家点击空地弹出塔选择菜单
 *  - 玩家点击已有塔弹出升级/出售菜单
 */
@ccclass('TowerMenu')
export class TowerMenu extends Component {
    @property({ type: Node, tooltip: '建塔选择菜单根节点' })
    public buildMenu: Node | null = null;

    @property({ type: Node, tooltip: '升级/出售菜单根节点' })
    public upgradeMenu: Node | null = null;

    @property({ type: TowerManager, tooltip: '塔管理器' })
    public towerManager: TowerManager | null = null;

    private _selectedTower: Tower | null = null;
    private _selectedPosition: Vec3 = new Vec3();

    protected onLoad(): void {
        if (this.buildMenu) this.buildMenu.active = false;
        if (this.upgradeMenu) this.upgradeMenu.active = false;

        const gm = GameManager.Instance;
        if (gm) {
            gm.on(EventNames.TOWER_SELECTED, this.onTowerSelected, this);
            gm.on(EventNames.TOWER_DESELECTED, this.onTowerDeselected, this);
        }
    }

    protected onDestroy(): void {
        const gm = GameManager.Instance;
        if (gm) {
            gm.off(EventNames.TOWER_SELECTED, this.onTowerSelected, this);
            gm.off(EventNames.TOWER_DESELECTED, this.onTowerDeselected, this);
        }
    }

    /**
     * 显示建塔菜单
     */
    public showBuildMenu(position: Vec3): void {
        this.hideAllMenus();
        this._selectedPosition.set(position);

        if (this.buildMenu) {
            this.buildMenu.setPosition(position.x, position.y + 80, 0);
            this.buildMenu.active = true;
        }
    }

    /**
     * 显示升级菜单
     */
    public showUpgradeMenu(tower: Tower): void {
        this.hideAllMenus();
        this._selectedTower = tower;

        if (this.upgradeMenu) {
            const pos = tower.node.position;
            this.upgradeMenu.setPosition(pos.x, pos.y + 80, 0);
            this.upgradeMenu.active = true;
        }
    }

    /**
     * 隐藏所有菜单
     */
    public hideAllMenus(): void {
        if (this.buildMenu) this.buildMenu.active = false;
        if (this.upgradeMenu) this.upgradeMenu.active = false;
        this._selectedTower = null;
    }

    // --- 按钮回调（在场景中绑定） ---

    /**
     * 选择建箭塔
     */
    public onSelectArrowTower(): void {
        this.buildTower(TowerType.ARROW);
    }

    /**
     * 选择建炮塔
     */
    public onSelectCannonTower(): void {
        this.buildTower(TowerType.CANNON);
    }

    /**
     * 选择建魔法塔
     */
    public onSelectMagicTower(): void {
        this.buildTower(TowerType.MAGIC);
    }

    private buildTower(type: TowerType): void {
        if (!this.towerManager) return;
        const tower = this.towerManager.placeTower(type, this._selectedPosition);
        if (tower) {
            this.hideAllMenus();
        }
    }

    /**
     * 升级选中的塔
     */
    public onUpgradeTower(): void {
        if (this._selectedTower && this.towerManager) {
            this.towerManager.upgradeTower(this._selectedTower);
        }
        this.hideAllMenus();
    }

    /**
     * 出售选中的塔
     */
    public onSellTower(): void {
        if (this._selectedTower && this.towerManager) {
            this.towerManager.sellTower(this._selectedTower);
        }
        this.hideAllMenus();
    }

    private onTowerSelected(tower: Tower): void {
        this.showUpgradeMenu(tower);
    }

    private onTowerDeselected(): void {
        this.hideAllMenus();
    }
}
