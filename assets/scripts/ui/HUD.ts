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

    private readonly BG_HEIGHT = 48;     // 背景条高度

    /** 创建背景条 + 4 个 Label，必须在父节点已挂载后调用 */
    public init(visibleWidth: number = 960, visibleHeight: number = 640): void {
        const parent = this.node;
        const bgY = visibleHeight / 2 - this.BG_HEIGHT / 2 - 8;
        const labelY = bgY - 16;

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

        // === 4 个状态 Label ===
        const halfW = visibleWidth / 2;
        this.goldLabel = this.createLabel('Gold', new Vec3(-halfW + 60, labelY, 0), 24);
        this.livesLabel = this.createLabel('Lives', new Vec3(-halfW + 280, labelY, 0), 24);
        this.statusLabel = this.createLabel('Status', new Vec3(0, labelY, 0), 20);
        this.waveLabel = this.createLabel('Wave', new Vec3(halfW - 60, labelY, 0), 24);
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
