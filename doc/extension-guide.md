# 系统扩展约定：新增塔 / 新增敌人

本文档说明如何在不破坏已有战斗的前提下，给游戏新增一种塔或一种敌人。

> **核心原则**：所有塔/敌人的属性、外观、行为都集中在 `SceneInitializer.ts` 顶部的两个注册表中。新增类型只需往注册表追加一个配置对象，**不需要修改任何战斗逻辑代码**。

---

## 一、新增一种塔

### 步骤

1. 打开 `assets/scripts/core/SceneInitializer.ts`
2. 找到 `TOWER_REGISTRY` 数组（搜索 `TOWER_REGISTRY`）
3. 在数组末尾追加一个 `TowerDef` 对象
4. （可选）如果你想加新的瞬间效果逻辑，写在 `applyInstant` 函数里
5. 完成。按钮、外观、拖拽、攻击、子弹全部自动接入

### 示例：新增"毒塔"（发射毒子弹，命中造成持续伤害简化版）

在 `TOWER_REGISTRY` 数组末尾加：

```typescript
{
    id: 'poison',
    name: '毒塔',
    cost: 200,
    range: 180,
    interval: 1.0,
    damage: 5,
    attackKind: 'bullet',
    color: new Color(100, 200, 50, 255),    // 绿色
    rangeColor: new Color(100, 200, 50, 60),
    buttonPos: new Vec3(-400, 0, 0),         // 新按钮位置（别和已有的重叠）
},
```

加完后：
- 左侧 `(−400, 0)` 会自动出现一个绿色塔按钮，价格 200
- 拖到建造点后自动放塔，攻击范围内敌人，发射绿色子弹，命中扣 5 血
- **不需要改任何其他代码**

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一标识，不要和已有的重复 |
| `name` | string | 中文名，日志显示用 |
| `cost` | number | 花费金币 |
| `range` | number | 攻击范围（像素） |
| `interval` | number | 攻击间隔（秒） |
| `damage` | number | 子弹命中扣血量（bullet 和 instant 类型都会扣） |
| `attackKind` | `'bullet'` \| `'instant'` | bullet=发射子弹命中扣血；instant=瞬间效果（如减速） |
| `color` | Color | 塔主体颜色（按钮、塔身、子弹都用这个色） |
| `rangeColor` | Color | 范围圈颜色 |
| `buttonPos` | Vec3 | 拖拽按钮的屏幕位置（别和已有的重叠） |
| `applyInstant` | (enemy) => void | 仅 `instant` 类型需要：直接修改敌人状态 |
| `onBulletHit` | (enemy) => void | 子弹命中时额外效果（如施加 buff），在扣血之后调用 |

### 两种攻击模式

- **`bullet`（子弹型）**：塔会发射一颗子弹飞向敌人，命中后扣 `damage` 点血。攻击塔属于此类。
- **`instant`（瞬间型）**：不发射子弹扣血，而是直接改敌人状态。必须在 `applyInstant` 里写逻辑。减速塔属于此类（它写了 `enemy.slowMultiplier = 0.7; enemy.slowTimer = 2.0`）。

> 注意：instant 类型也会发射一颗视觉子弹（用塔颜色），命中时也会扣 `damage` 血，并触发 `onBulletHit`（如果定义了的话）。

### 进阶示例：毒塔（攻击附带毒性 buff，每秒掉血）

利用 `onBulletHit` 钩子 + 通用 buff 字典，实现"命中施加持续伤害"效果：

```typescript
{
    id: 'poison',
    name: '毒塔',
    cost: 180, range: 180, interval: 0.8, damage: 10,
    attackKind: 'bullet',
    color: new Color(100, 200, 50, 255),
    rangeColor: new Color(100, 200, 50, 60),
    buttonPos: new Vec3(-400, 0, 0),
    // 命中时施加毒 buff：每秒掉 8 血，持续 5 秒
    onBulletHit: (enemy) => {
        const existing = enemy.buffs['poison'];
        if (existing) {
            existing.timer = 5.0;      // 刷新持续时间
            existing.dps = Math.max(existing.dps, 8);
        } else {
            enemy.buffs['poison'] = { timer: 5.0, dps: 8 };
        }
    },
},
```

**buff 机制说明**：每个敌人的 `buffs` 字典存 `{ timer: 剩余秒数, dps: 每秒掉血量 }`。`update` 中有通用逻辑自动处理掉血和倒计时，新增 buff 只需往字典写一个 key，不用改任何逻辑。

---

## 二、新增一种敌人

### 步骤

1. 打开 `assets/scripts/core/SceneInitializer.ts`
2. 找到 `ENEMY_REGISTRY` 数组（搜索 `ENEMY_REGISTRY`）
3. 在数组末尾追加一个 `EnemyDef` 对象
4. （可选）如果敌人有特殊行为，写 `onUpdate`；如果有特殊外观，写 `drawExtra`
5. 在波次配置 `WAVES` 中用这个新 `id`
6. 完成。生成、移动、绘制全部自动接入

### 示例：新增"快速兵"（速度快 50%，血量少 30%）

**第一步**：在 `ENEMY_REGISTRY` 数组末尾加：

```typescript
{
    id: 'fast',
    name: '快速兵',
    speedMultiplier: 1.5,    // 比普通兵快 50%
    hpMultiplier: 0.7,      // 血量少 30%
    color: new Color(255, 200, 50, 255),  // 橙色
    radius: 12,             // 稍小一点
},
```

**第二步**：在波次配置里用 `'fast'`：

```typescript
{ time: 5.0, type: 'fast', hp: 40 },
```

加完后：
- 第 5 秒会生成一只橙色小敌人，速度比普通快 50%，血量是 40×0.7=28
- **不需要改任何其他代码**

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一标识，波次配置里的 `type` 填这个 |
| `name` | string | 中文名 |
| `speedMultiplier` | number | 速度倍率（1=普通，1.5=快50%，0.9=慢10%） |
| `hpMultiplier` | number | 血量倍率（1=普通，0.8=血少20%） |
| `color` | Color | 敌人主体颜色 |
| `radius` | number | 敌人半径（影响绘制大小和碰撞） |
| `onUpdate` | (enemy, dt, allEnemies) => void | 可选：每帧特殊行为（如治疗光环） |
| `drawExtra` | (gfx, def) => void | 可选：画完主体圆后的额外绘制（如光环） |

### 特殊行为示例：治疗光环

现有的 `healer`（治疗兵）就是一个完整范例，它用了 `onUpdate` 和 `drawExtra`：

- `onUpdate`：每 3 秒治疗范围内友军
- `drawExtra`：画治疗光环范围圈

新增有特殊行为的敌人时，照着 `healer` 的写法改即可。

---

## 三、安全检查清单

每次新增后，对照这个清单确认不会破坏已有战斗：

- [ ] 新塔/敌人的 `id` 没有和已有的重复
- [ ] 新塔的 `buttonPos` 没有和已有塔按钮重叠
- [ ] 新敌人的 `type` 在 `WAVES` 配置里拼写正确（和 `id` 完全一致）
- [ ] 没有修改 `update()`、`spawnEnemy()`、`fireBullet()`、`placeTower()` 等战斗逻辑函数
- [ ] 只在 `TOWER_REGISTRY` 或 `ENEMY_REGISTRY` 里加了配置

**只要满足以上条件，已有战斗一定不受影响。**

---

## 四、注册表位置速查

| 要改什么 | 搜索关键词 | 位置 |
|---|---|---|
| 新增塔 | `TOWER_REGISTRY` | `SceneInitializer.ts` 类属性区 |
| 新增敌人 | `ENEMY_REGISTRY` | `SceneInitializer.ts` 类属性区 |
| 波次配置 | `WAVES` | `SceneInitializer.ts` 类属性区 |
| 全局数值（金币/子弹速度/路径） | `INITIAL_GOLD` / `BULLET_SPEED` / `PATH_START` | `SceneInitializer.ts` 类属性区 |
