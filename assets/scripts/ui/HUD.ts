import { _decorator, Component, Node, Label, UITransform, Layers, Graphics, Color, Vec3 } from 'cc';

const { ccclass } = _decorator;

/**
 * HUD - 顶部状态栏（统一管理 4 个状态文本 + 半透明背景条）
 *
 * 显示内容：
 * - Gold：剩余金币（左 -420）
 * - Base：友军 HP（左中 -200）
 * - Status：当前阶段提示（中 0）
 * - Wave：当前波次（右 420）
 *
 * 用法：父节点 addComponent(HUD) → 调用 init() → 通过 setGold/setWave/setLives/setStatus 更新
 * 也暴露 goldLabel/waveLabel/livesLabel/statusLabel 引用，兼容直接改 string 的旧代码。
 */
@ccclass('HUD')
export class HUD extends Component {
    /** 暴露 Label 引用，方便旧代码直接改 string */
    public goldLabel: Label | null = null;
    public livesLabel: Label | null = null;
    public statusLabel: Label | null = null;
    public waveLabel: Label | null = null;

    private readonly BG_HEIGHT = 60;     // 背景条高度

    /**
     * 创建背景条 + 状态 Label（两行布局）：
     * 第一行：Gold 左对齐 / Base 居中 / Wave 右对齐
     * 第二行：倒计时（或状态提示）居中
     */
    public init(visibleWidth: number = 640, visibleHeight: number = 960): void {
        const parent = this.node;
        const bgY = visibleHeight / 2 - this.BG_HEIGHT / 2 - 6;
        const halfW = visibleWidth / 2;
        const row1Y = visibleHeight / 2 - 18;
        const row2Y = visibleHeight / 2 - 44;

        // === 顶部半透明背景条（铺满可见宽度）===
        const bg = new Node('HUDBg');
        bg.layer = Layers.Enum.UI_2D;
        bg.setParent(parent);
        const bgTransform = bg.addComponent(UITransform);
        bgTransform.setContentSize(visibleWidth, this.BG_HEIGHT);
        bgTransform.setAnchorPoint(0.5, 0.5);
        bg.setPosition(0, bgY, 0);
        const gfx = bg.addComponent(Graphics);
        gfx.fillColor = new Color(0, 0, 0, 130);
        gfx.rect(-visibleWidth / 2, -this.BG_HEIGHT / 2, visibleWidth, this.BG_HEIGHT);
        gfx.fill();
        // 底部细分隔线
        gfx.strokeColor = new Color(255, 255, 255, 60);
        gfx.lineWidth = 1;
        gfx.moveTo(-visibleWidth / 2, -this.BG_HEIGHT / 2);
        gfx.lineTo(visibleWidth / 2, -this.BG_HEIGHT / 2);
        gfx.stroke();

        // === 第一行：Gold 左 / Base 中 / Wave 右 ===
        this.goldLabel = this.createLabel('Gold', new Vec3(-halfW + 55, row1Y, 0), 22);
        this.livesLabel = this.createLabel('Base', new Vec3(0, row1Y, 0), 22);
        this.waveLabel = this.createLabel('Wave', new Vec3(halfW - 55, row1Y, 0), 22);

        // === 第二行：倒计时 / 状态提示 居中 ===
        this.statusLabel = this.createLabel('Status', new Vec3(0, row2Y, 0), 18);
    }

    /** 创建单个 Label 子节点并返回组件引用 */
    private createLabel(name: string, pos: Vec3, fontSize: number): Label {
        const parent = this.node;
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.setParent(parent);
        node.addComponent(UITransform);
        node.setPosition(pos);
        const label = node.addComponent(Label);
        label.fontSize = fontSize;
        label.color = new Color(255, 255, 255, 255);
        return label;
    }

    // ===== 更新接口 =====
    public setGold(gold: number): void {
        if (this.goldLabel) this.goldLabel.string = `Gold: ${gold}`;
    }

    public setWave(current: number, total: number): void {
        if (this.waveLabel) this.waveLabel.string = `Wave: ${current}/${total}`;
    }

    public setLives(current: number, max: number): void {
        if (this.livesLabel) this.livesLabel.string = `Base: ${current}/${max}`;
    }

    public setStatus(text: string): void {
        if (this.statusLabel) this.statusLabel.string = text;
    }
}
