import { _decorator, Component, Node, UITransform, Layers, Graphics, Color, Vec3, Label, tween } from 'cc';

const { ccclass } = _decorator;

/**
 * EffectManager — 集中提供所有战斗特效
 *
 * 使用 Cocos Graphics + Tween，不依赖外部图片。
 * 挂在 gameLayer 节点上，所有特效在 gameLayer 下创建。
 */
@ccclass('EffectManager')
export class EffectManager extends Component {
    private static _instance: EffectManager | null = null;
    public static get instance(): EffectManager {
        return this._instance!;
    }

    onLoad() {
        EffectManager._instance = this;
    }

    onDestroy() {
        if (EffectManager._instance === this) {
            EffectManager._instance = null;
        }
    }

    private get gameLayer(): Node {
        return this.node;
    }

    /** 创建一个挂载 Graphics 的节点 */
    private createGfxNode(name: string, pos: Vec3, size: number): { node: Node; gfx: Graphics } {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        node.setParent(this.gameLayer);
        node.setPosition(pos);
        const t = node.addComponent(UITransform);
        t.setContentSize(size, size);
        t.setAnchorPoint(0.5, 0.5);
        const gfx = node.addComponent(Graphics);
        return { node, gfx };
    }

    // ===== 1. 命中反馈：敌人闪白0.08秒＋轻微放大 =====
    public playHit(enemyNode: Node): void {
        if (!enemyNode || !enemyNode.isValid) return;
        const originalScale = enemyNode.scale.clone();
        const originalColor = this.getEnemyColor(enemyNode);
        // 闪白
        this.setEnemyColor(enemyNode, new Color(255, 255, 255, 255));
        // 放大
        tween(enemyNode)
            .to(0.04, { scale: new Vec3(originalScale.x * 1.3, originalScale.y * 1.3, 1) })
            .to(0.04, { scale: originalScale })
            .call(() => {
                if (enemyNode.isValid) this.setEnemyColor(enemyNode, originalColor);
            })
            .start();
    }

    // ===== 2. 受伤数字：飘出 -20，0.5秒淡出 =====
    public playDamageNumber(pos: Vec3, damage: number, isCrit: boolean = false): void {
        const node = new Node('DmgNumber');
        node.layer = Layers.Enum.UI_2D;
        node.setParent(this.gameLayer);
        node.setPosition(pos.x, pos.y + 20, 0);
        node.addComponent(UITransform);
        const label = node.addComponent(Label);
        label.string = isCrit ? `-${Math.round(damage)}!` : `-${Math.round(damage)}`;
        label.fontSize = isCrit ? 20 : 14;
        label.color = isCrit ? new Color(255, 80, 80, 255) : new Color(255, 255, 255, 255);
        tween(node)
            .by(0.5, { position: new Vec3(0, 30, 0) })
            .start();
        tween(label)
            .to(0.4, { color: new Color(label.color.r, label.color.g, label.color.b, 0) })
            .call(() => node.destroy())
            .start();
    }

    // ===== 3. 死亡效果：缩小＋碎裂圆点＋淡出 =====
    public playDeath(pos: Vec3, color: Color): void {
        // 碎裂圆点（4个小圆向外飞散）
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const fragPos = pos.clone();
            const { node, gfx } = this.createGfxNode('DeathFrag', fragPos, 16);
            gfx.fillColor = color;
            gfx.circle(0, 0, 4);
            gfx.fill();
            const dx = Math.cos(angle) * 25;
            const dy = Math.sin(angle) * 25;
            tween(node)
                .by(0.3, { position: new Vec3(dx, dy, 0) })
                .to(0.2, { scale: new Vec3(0.1, 0.1, 1) })
                .call(() => node.destroy())
                .start();
        }
    }

    // ===== 4. 中毒状态：绿色外圈＋周期冒泡 =====
    public playPoison(enemyNode: Node): void {
        if (!enemyNode || !enemyNode.isValid) return;
        // 绿色外圈（持续1秒后淡出）
        const pos = enemyNode.position;
        const { node, gfx } = this.createGfxNode('PoisonRing', pos, 40);
        gfx.strokeColor = new Color(100, 200, 50, 180);
        gfx.lineWidth = 3;
        gfx.circle(0, 0, 14);
        gfx.stroke();
        // 冒泡（3个小绿点上升）
        for (let i = 0; i < 3; i++) {
            const bubble = new Node('PoisonBubble');
            bubble.layer = Layers.Enum.UI_2D;
            bubble.setParent(node);
            bubble.setPosition((i - 1) * 6, 0, 0);
            bubble.addComponent(UITransform);
            const bg = bubble.addComponent(Graphics);
            bg.fillColor = new Color(100, 200, 50, 200);
            bg.circle(0, 0, 3);
            bg.fill();
            tween(bubble)
                .delay(i * 0.15)
                .by(0.6, { position: new Vec3(0, 15, 0) })
                .start();
        }
        tween(node)
            .delay(0.8)
            .to(0.2, { scale: new Vec3(0.5, 0.5, 1) })
            .call(() => node.destroy())
            .start();
    }

    // ===== 5. 减速状态：蓝紫色圆环 =====
    public playSlow(enemyNode: Node): void {
        if (!enemyNode || !enemyNode.isValid) return;
        const pos = enemyNode.position;
        const { node, gfx } = this.createGfxNode('SlowRing', pos, 40);
        gfx.strokeColor = new Color(180, 80, 220, 200);
        gfx.lineWidth = 4;
        gfx.circle(0, 0, 16);
        gfx.stroke();
        // 旋转残影
        tween(node)
            .by(0.5, { angle: 180 })
            .to(0.3, { scale: new Vec3(1.5, 1.5, 1) })
            .call(() => node.destroy())
            .start();
    }

    // ===== 6. 治疗效果：绿色脉冲光环＋+5数字 =====
    public playHeal(pos: Vec3, amount: number): void {
        // 脉冲光环
        const { node, gfx } = this.createGfxNode('HealPulse', pos, 80);
        gfx.strokeColor = new Color(100, 255, 100, 200);
        gfx.lineWidth = 3;
        gfx.circle(0, 0, 20);
        gfx.stroke();
        tween(node)
            .to(0.3, { scale: new Vec3(2, 2, 1) })
            .to(0.2, { scale: new Vec3(0.1, 0.1, 1) })
            .call(() => node.destroy())
            .start();
        // +5 数字
        const labelNode = new Node('HealNumber');
        labelNode.layer = Layers.Enum.UI_2D;
        labelNode.setParent(this.gameLayer);
        labelNode.setPosition(pos.x, pos.y + 15, 0);
        labelNode.addComponent(UITransform);
        const label = labelNode.addComponent(Label);
        label.string = `+${amount}`;
        label.fontSize = 14;
        label.color = new Color(100, 255, 100, 255);
        tween(labelNode)
            .by(0.8, { position: new Vec3(0, 25, 0) })
            .start();
        tween(label)
            .delay(0.5)
            .to(0.3, { color: new Color(100, 255, 100, 0) })
            .call(() => labelNode.destroy())
            .start();
    }

    // ===== 7. 溅射爆炸：橙色扩散圆环＋短暂震动 =====
    public playExplosion(pos: Vec3, radius: number): void {
        const { node, gfx } = this.createGfxNode('ExplosionWave', pos, radius * 2);
        const drawWave = (r: number, alpha: number) => {
            gfx.clear();
            gfx.strokeColor = new Color(255, 180, 80, alpha);
            gfx.lineWidth = 6;
            gfx.circle(0, 0, r);
            gfx.stroke();
            gfx.fillColor = new Color(255, 100, 50, alpha * 0.4);
            gfx.circle(0, 0, r * 0.7);
            gfx.fill();
        };
        drawWave(10, 255);
        let frame = 0;
        const totalFrames = 5;
        this.schedule(() => {
            frame++;
            const t = frame / totalFrames;
            const r = 10 + (radius - 10) * t;
            const alpha = Math.round(255 * (1 - t));
            if (frame >= totalFrames) {
                node.destroy();
            } else {
                drawWave(r, alpha);
            }
        }, 0.08, totalFrames - 1, 0);
        // 屏幕震动（震动 gameLayer）
        const gameLayer = this.gameLayer;
        const originalPos = gameLayer.position.clone();
        tween(gameLayer)
            .to(0.03, { position: new Vec3(originalPos.x + 3, originalPos.y + 2, 0) })
            .to(0.03, { position: new Vec3(originalPos.x - 2, originalPos.y - 3, 0) })
            .to(0.03, { position: originalPos })
            .start();
    }

    // ===== 8. 选卡反馈：卡片放大、金色闪光、名称停留1秒 =====
    public playCardSelected(cardNode: Node, buffName: string): void {
        if (!cardNode || !cardNode.isValid) return;
        // 卡片放大
        const originalScale = cardNode.scale.clone();
        tween(cardNode)
            .to(0.15, { scale: new Vec3(originalScale.x * 1.3, originalScale.y * 1.3, 1) })
            .to(0.15, { scale: originalScale })
            .start();
        // 金色闪光（在卡片上叠加一个金色半透明矩形）
        const flashNode = new Node('CardFlash');
        flashNode.layer = Layers.Enum.UI_2D;
        flashNode.setParent(cardNode);
        flashNode.setPosition(0, 0, 0);
        const t = flashNode.addComponent(UITransform);
        t.setContentSize(140, 160);
        const gfx = flashNode.addComponent(Graphics);
        gfx.fillColor = new Color(255, 215, 0, 180);
        gfx.roundRect(-70, -80, 140, 160, 10);
        gfx.fill();
        tween(gfx)
            .to(0.3, { fillColor: new Color(255, 215, 0, 0) })
            .call(() => flashNode.destroy())
            .start();
    }

    // ===== 辅助方法 =====
    private getEnemyColor(enemyNode: Node): Color {
        // 尝试从 Graphics 组件获取颜色（简化版，返回白色作为默认）
        const gfx = enemyNode.getComponent(Graphics);
        return gfx ? gfx.fillColor : new Color(255, 255, 255, 255);
    }

    private setEnemyColor(enemyNode: Node, color: Color): void {
        const gfx = enemyNode.getComponent(Graphics);
        if (gfx) {
            gfx.clear();
            gfx.fillColor = color;
            gfx.circle(0, 0, 12);
            gfx.fill();
        }
    }
}
