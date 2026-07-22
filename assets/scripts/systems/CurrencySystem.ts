import { _decorator, Component } from 'cc';
import { GameEvents } from '../core/EventNames';

const { ccclass, property } = _decorator;

/**
 * CurrencySystem - 货币（金币）系统
 *
 * 职责：
 *  - 管理金币增减
 *  - 检查是否足够消费
 *  - 发出金币变化事件
 */
@ccclass('CurrencySystem')
export class CurrencySystem extends Component {
    private _gold: number = 0;

    public get Gold(): number { return this._gold; }

    /** 设置金币（初始化用） */
    public setGold(amount: number): void {
        this._gold = amount;
        this.emitChange();
    }

    /** 增加金币 */
    public addGold(amount: number): void {
        this._gold += amount;
        this.emitChange();
    }

    /** 消费金币，不足返回 false */
    public spendGold(amount: number): boolean {
        if (this._gold < amount) {
            this.node.emit(GameEvents.NOT_ENOUGH_GOLD);
            return false;
        }
        this._gold -= amount;
        this.emitChange();
        return true;
    }

    /** 退还金币 */
    public refundGold(amount: number): void {
        this._gold += amount;
        this.emitChange();
    }

    private emitChange(): void {
        this.node.emit(GameEvents.GOLD_CHANGED, this._gold);
    }
}
