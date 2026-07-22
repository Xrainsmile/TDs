import { _decorator, Component, Node, Vec3, Label, Button, Layers, UITransform, Color, Sprite } from 'cc';
import { TowerType, GameState } from '../core/Constants';
import { GameEvents } from '../core/EventNames';
import { TowerController } from '../systems/TowerController';
import { Tower } from '../entities/Tower';

const { ccclass, property } = _decorator;

/**
 * TowerMenu - 塔放置/升级菜单
 *
 * 处理建塔选择和已有塔的升级/出售
 */
@ccclass('TowerMenu')
export class TowerMenu extends Component {
    @property({ type: TowerController })
    public towerController: TowerController | null = null;

    private _buildMenu: Node | null = null;
    private _upgradeMenu: Node | null = null;
    private _selectedTower: Tower | null = null;
    private _selectedPosition: Vec3 = new Vec3();
    private _infoLabel: Label | null = null;

    public init(): void {
        this.createMenus();
    }

    private createMenus(): void {
        // 建塔菜单
        this._buildMenu = new Node('BuildMenu');
        this._buildMenu.layer = Layers.Enum.UI_2D;
        this._buildMenu.setParent(this.node);
        this._buildMenu.addComponent(UITransform);
        this.createButton(this._buildMenu, '箭塔(50)', -70, 0, () => this.buildTower(TowerType.ARROW));
        this.createButton(this._buildMenu, '炮塔(100)', 0, 0, () => this.buildTower(TowerType.CANNON));
        this.createButton(this._buildMenu, '魔法(80)', 70, 0, () => this.buildTower(TowerType.MAGIC));
        this._buildMenu.active = false;

        // 升级菜单
        this._upgradeMenu = new Node('UpgradeMenu');
        this._upgradeMenu.layer = Layers.Enum.UI_2D;
        this._upgradeMenu.setParent(this.node);
        this._upgradeMenu.addComponent(UITransform);
        this.createButton(this._upgradeMenu, '升级', -50, 0, () => this.onUpgrade());
        this.createButton(this._upgradeMenu, '出售', 50, 0, () => this.onSell());
        // 信息标签
        const infoNode = new Node('Info');
        infoNode.layer = Layers.Enum.UI_2D;
        infoNode.setParent(this._upgradeMenu);
        infoNode.addComponent(UITransform);
        this._infoLabel = infoNode.addComponent(Label);
        this._infoLabel.fontSize = 16;
        this._infoLabel.string = '';
        infoNode.setPosition(0, -40, 0);
        this._upgradeMenu.active = false;
    }

    private createButton(parent: Node, text: string, x: number, y: number, callback: () => void): void {
        const btn = new Node(`Btn_${text}`);
        btn.layer = Layers.Enum.UI_2D;
        btn.setParent(parent);
        const transform = btn.addComponent(UITransform);
        transform.setContentSize(60, 30);
        btn.setPosition(x, y, 0);

        const label = btn.addComponent(Label);
        label.string = text;
        label.fontSize = 14;
        label.lineHeight = 16;

        const button = btn.addComponent(Button);
        button.node.on(Button.EventType.CLICK, callback, this);
    }

    public showBuildMenu(position: Vec3): void {
        this.hideAllMenus();
        this._selectedPosition.set(position);
        if (this._buildMenu) {
            this._buildMenu.setPosition(position.x, position.y + 50, 0);
            this._buildMenu.active = true;
        }
    }

    public showUpgradeMenu(tower: Tower): void {
        this.hideAllMenus();
        this._selectedTower = tower;
        if (this._upgradeMenu && this._infoLabel) {
            const pos = tower.node.position;
            this._upgradeMenu.setPosition(pos.x, pos.y + 60, 0);
            this._infoLabel.string = `Lv.${tower.level}  Atk:${tower.attackDamage}  Sell:${tower.SellValue}`;
            this._upgradeMenu.active = true;
        }
    }

    public hideAllMenus(): void {
        if (this._buildMenu) this._buildMenu.active = false;
        if (this._upgradeMenu) this._upgradeMenu.active = false;
        this._selectedTower = null;
    }

    private buildTower(type: TowerType): void {
        if (this.towerController) {
            const tower = this.towerController.placeTower(type, this._selectedPosition);
            if (tower) this.hideAllMenus();
        }
    }

    private onUpgrade(): void {
        if (this._selectedTower && this.towerController) {
            this.towerController.upgradeTower(this._selectedTower);
        }
        this.hideAllMenus();
    }

    private onSell(): void {
        if (this._selectedTower && this.towerController) {
            this.towerController.sellTower(this._selectedTower);
        }
        this.hideAllMenus();
    }
}
