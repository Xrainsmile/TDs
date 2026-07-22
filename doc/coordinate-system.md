# Cocos Creator 3.x 坐标系统踩坑总结

> 项目：TDs 塔防游戏  
> 引擎：Cocos Creator 3.8.8  
> 问题：拖拽放塔时鼠标与防御塔位置严重偏移

---

## 问题现象

1. 拖拽时防御塔与鼠标位置差距极大（偏上偏右约 200 像素）
2. 越靠近屏幕左下角，偏差越小；越靠右上角，偏差越大
3. 无法将塔放置到建造点（磁吸无效）

---

## 根因分析

### 1. Canvas 位置偏移

场景模板中 Canvas 默认位置是 **(480, 320)**（设计分辨率的一半），Camera 也在 (480, 320)。所有子节点的世界坐标都加了 (480, 320) 偏移。

**修复**：把 Canvas 和 Camera 移到 **(0, 0)**。

### 2. Canvas UITransform 尺寸不匹配

场景模板中 Canvas UITransform 尺寸是 **1280x720**，而设计分辨率设为 **960x640**。尺寸不匹配导致缩放偏差。

**修复**：把 Canvas UITransform 尺寸改为 **960x640**，Camera 正交高度改为 **320**。

### 3. 坐标 API 语义不清

Cocos 3.x 中触摸事件的坐标 API 很容易混淆：

| API | 返回内容 | 原点 | 范围 |
|---|---|---|---|
| `event.getLocation()` | 屏幕像素坐标 | 左下角 | 0~视口宽度 |
| `event.getUILocation()` | UI 坐标 | 左下角 | 0~设计分辨率宽度 |
| `convertToNodeSpaceAR()` | 节点本地坐标 | 节点锚点 | 相对节点 |

**关键发现**：`getUILocation()` **不是**中心为原点的设计分辨率坐标，而是**左下角为原点**的 UI 坐标！

### 4. 视口中心 vs 设计分辨率中心

`getUILocation()` 返回左下角为原点的坐标（0~960），需要减去设计分辨率中心 (480, 320) 才能得到世界坐标。

但之前错误地用 `view.getVisibleSize()` 返回的视口尺寸（1280x688）来计算中心点，应该用设计分辨率尺寸（960x640）。

实际上 `view.getVisibleSize()` 在设置了设计分辨率后返回的是**设计分辨率尺寸**，不是视口尺寸。

### 5. 事件绑定层级错误

`TOUCH_MOVE` 和 `TOUCH_END` 绑定在**塔按钮**上，手指离开按钮后事件不再触发，无法拖拽到建造点。

**修复**：`TOUCH_START` 绑定在按钮上，`TOUCH_MOVE`/`TOUCH_END` 绑定在 **Canvas** 上（全屏追踪）。

---

## 最终解决方案

```typescript
// 1. 场景文件修复（一次性）
// Canvas 位置 (0, 0)，UITransform 960x640，Camera 位置 (0, 0, 1000)，正交高度 320

// 2. 代码中坐标转换
const visibleSize = view.getVisibleSize(); // 返回设计分辨率尺寸 960x640
const touchToCanvasLocal = (event: EventTouch): Vec3 => {
    const uiLoc = event.getUILocation(); // 屏幕像素坐标，左下角原点
    const worldX = uiLoc.x - visibleSize.width / 2;  // 减去设计分辨率一半
    const worldY = uiLoc.y - visibleSize.height / 2;
    return new Vec3(worldX, worldY, 0);
};

// 3. 事件绑定
towerButton.on(Node.EventType.TOUCH_START, ...);  // 触发拖拽
canvas.on(Node.EventType.TOUCH_MOVE, ...);         // 全屏追踪
canvas.on(Node.EventType.TOUCH_END, ...);          // 全屏检测
```

---

## 磁吸放置

```typescript
// 磁吸半径 120 像素，找最近建造点
let nearestSlot = -1;
let nearestDist = Infinity;
for (let i = 0; i < slotPositions.length; i++) {
    const dist = Math.sqrt(
        (dropX - slotPositions[i].x) ** 2 +
        (dropY - slotPositions[i].y) ** 2
    );
    if (dist < nearestDist) {
        nearestDist = dist;
        nearestSlot = i;
    }
}

if (nearestSlot >= 0 && nearestDist < 120) {
    // 放置塔
}
```

---

## 教训

1. **不要手动做坐标转换**（`x - W/2`），容易忽略缩放/锚点/偏移
2. **优先用 Cocos 官方 API**（`convertToNodeSpaceAR`），但要确认传入的坐标类型正确
3. **事件绑定层级很重要**：TOUCH_START 在按钮上，TOUCH_MOVE/END 在 Canvas 上
4. **场景模板默认值可能不匹配**：Canvas 位置和 UITransform 尺寸需要手动调整
5. **调试坐标问题的最佳方式**：同时打印 `getLocation()` 和 `getUILocation()` 的值对比
