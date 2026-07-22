import { Node, Prefab, instantiate, Graphics, UITransform, Layers, Color } from 'cc';
import { TowerType, EnemyType } from '../core/Constants';

/**
 * PrefabFactory - 运行时节点工厂
 *
 * 在没有美术资源时，用 Graphics 组件画形状来生成节点模板
 * Controller 使用这些模板创建实例
 */

/** 敌人颜色配置 */
const ENEMY_COLORS: Record<number, { color: Color; size: number; shape: 'circle' | 'triangle' | 'square' | 'star' }> = {
    [EnemyType.NORMAL]: { color: new Color(80, 200, 80, 255), size: 14, shape: 'circle' },
    [EnemyType.FAST]: { color: new Color(255, 200, 50, 255), size: 14, shape: 'triangle' },
    [EnemyType.TANK]: { color: new Color(120, 120, 140, 255), size: 18, shape: 'square' },
    [EnemyType.BOSS]: { color: new Color(220, 50, 50, 255), size: 22, shape: 'star' },
};

/** 塔颜色配置 */
const TOWER_COLORS: Record<number, { color: Color; rangeColor: Color }> = {
    [TowerType.ARROW]: { color: new Color(50, 150, 255, 255), rangeColor: new Color(50, 150, 255, 40) },
    [TowerType.CANNON]: { color: new Color(200, 100, 50, 255), rangeColor: new Color(200, 100, 50, 40) },
    [TowerType.MAGIC]: { color: new Color(180, 80, 220, 255), rangeColor: new Color(180, 80, 220, 40) },
};

/** 子弹颜色配置 */
const PROJECTILE_COLORS: Record<number, Color> = {
    [TowerType.ARROW]: new Color(100, 180, 255, 255),
    [TowerType.CANNON]: new Color(220, 120, 50, 255),
    [TowerType.MAGIC]: new Color(200, 100, 240, 255),
};

/**
 * 创建敌人节点模板
 */
export function createEnemyNode(type: EnemyType): Node {
    const node = new Node(`Enemy_${type}`);
    node.layer = Layers.Enum.UI_2D;

    const config = ENEMY_COLORS[type] || ENEMY_COLORS[EnemyType.NORMAL];
    const transform = node.addComponent(UITransform);
    transform.setContentSize(config.size * 2, config.size * 2);

    const gfx = node.addComponent(Graphics);
    gfx.fillColor = config.color;

    switch (config.shape) {
        case 'circle':
            gfx.circle(0, 0, config.size);
            gfx.fill();
            break;
        case 'triangle':
            gfx.moveTo(0, config.size);
            gfx.lineTo(-config.size * 0.866, -config.size * 0.5);
            gfx.lineTo(config.size * 0.866, -config.size * 0.5);
            gfx.close();
            gfx.fill();
            break;
        case 'square':
            gfx.rect(-config.size, -config.size, config.size * 2, config.size * 2);
            gfx.fill();
            break;
        case 'star':
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const x = Math.cos(angle) * config.size;
                const y = Math.sin(angle) * config.size;
                if (i === 0) gfx.moveTo(x, y);
                else gfx.lineTo(x, y);
            }
            gfx.close();
            gfx.fill();
            break;
    }

    return node;
}

/**
 * 创建塔节点模板
 */
export function createTowerNode(type: TowerType): Node {
    const node = new Node(`Tower_${type}`);
    node.layer = Layers.Enum.UI_2D;

    const config = TOWER_COLORS[type] || TOWER_COLORS[TowerType.ARROW];
    const transform = node.addComponent(UITransform);
    transform.setContentSize(48, 48);

    const gfx = node.addComponent(Graphics);

    // 底座
    gfx.fillColor = new Color(60, 60, 70, 255);
    gfx.rect(-20, -20, 40, 40);
    gfx.fill();

    // 顶部（按类型区分颜色）
    gfx.fillColor = config.color;
    gfx.circle(0, 0, 14);
    gfx.fill();

    // 中心点
    gfx.fillColor = new Color(255, 255, 255, 255);
    gfx.circle(0, 0, 4);
    gfx.fill();

    return node;
}

/**
 * 创建子弹节点模板
 */
export function createProjectileNode(type: TowerType): Node {
    const node = new Node(`Projectile_${type}`);
    node.layer = Layers.Enum.UI_2D;

    const color = PROJECTILE_COLORS[type] || PROJECTILE_COLORS[TowerType.ARROW];
    const transform = node.addComponent(UITransform);
    transform.setContentSize(12, 12);

    const gfx = node.addComponent(Graphics);
    gfx.fillColor = color;
    gfx.circle(0, 0, 6);
    gfx.fill();

    return node;
}

/**
 * 创建路径可视化节点
 */
export function createPathNode(waypoints: { x: number; y: number }[]): Node {
    const node = new Node('PathVisual');
    node.layer = Layers.Enum.UI_2D;
    const transform = node.addComponent(UITransform);
    // 设置足够大的 ContentSize 确保 Graphics 能渲染
    transform.setContentSize(2000, 2000);
    transform.setAnchorPoint(0.5, 0.5);
    const gfx = node.addComponent(Graphics);

    gfx.lineWidth = 40;
    gfx.strokeColor = new Color(200, 180, 140, 180);
    gfx.fillColor = new Color(200, 180, 140, 120);

    if (waypoints.length > 0) {
        gfx.moveTo(waypoints[0].x, waypoints[0].y);
        for (let i = 1; i < waypoints.length; i++) {
            gfx.lineTo(waypoints[i].x, waypoints[i].y);
        }
        gfx.stroke();
    }

    // 起点和终点标记
    if (waypoints.length > 0) {
        gfx.fillColor = new Color(0, 255, 0, 200);
        gfx.circle(waypoints[0].x, waypoints[0].y, 16);
        gfx.fill();

        const last = waypoints[waypoints.length - 1];
        gfx.fillColor = new Color(255, 0, 0, 200);
        gfx.circle(last.x, last.y, 16);
        gfx.fill();
    }

    return node;
}

/**
 * 创建建造格子可视化节点
 */
export function createBuildSlotNode(x: number, y: number): Node {
    const node = new Node(`Slot_${x}_${y}`);
    node.layer = Layers.Enum.UI_2D;
    node.setPosition(x, y, 0);

    const transform = node.addComponent(UITransform);
    transform.setContentSize(56, 56);

    const gfx = node.addComponent(Graphics);
    gfx.lineWidth = 2;
    gfx.strokeColor = new Color(100, 200, 100, 120);
    gfx.fillColor = new Color(100, 200, 100, 40);
    gfx.rect(-28, -28, 56, 56);
    gfx.fill();
    gfx.stroke();

    return node;
}
