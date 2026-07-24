# TDs 塔防游戏 - 需求文档

> 仓库：https://github.com/Xrainsmile/TDs  
> 引擎：Cocos Creator 3.8.8  
> 目标平台：微信小游戏  

---

## 1. 项目定位

开发一款塔防微信小游戏，后续演化为**肉鸽塔防**（Roguelike Tower Defense）。

- **当前阶段**：MVP 最小可玩闭环
- **演进方向**：Build System 流派构筑（改变塔行为而非增加塔数量）

---

## 2. 技术路线

| 项 | 选择 | 原因 |
|---|---|---|
| 引擎 | Cocos Creator 3.8.8 | 已有 Entity/Controller/System/Event 基础设施 |
| 平台 | 微信小游戏 | 微信开发者工具 CLI 预览/上传 |
| 仓库 | https://github.com/Xrainsmile/TDs | SSH 推送，主分支 main |
| 不切换 | 继续 Cocos | 避免重踩渲染/生命周期/输入/对象管理的问题 |

---

## 3. 架构设计

### 3.1 通用系统（systems/）

| 系统 | 职责 |
|---|---|
| GameStateManager | 游戏状态总管理器（单例），状态/生命/波次/事件分发 |
| CurrencySystem | 货币系统，金币增减/消费检查 |
| DamageSystem | 伤害结算，单体/溅射/DOT 触发/Buff 快捷方法 |
| BuffSystem | 统一管理敌人身上的 Buff（燃烧/中毒/冻结/减速/流血/眩晕/诅咒/标记） |
| EnemyController | 敌人生成/回收（对象池）/查询（范围内）/统计 |
| TowerController | 塔放置/升级/出售/配置管理 |
| ProjectileController | 子弹发射/回收（对象池）/命中/属性配置 |
| WaveManager | 波次调度，按时序生成敌人 |
| PathManager | 敌人移动路径存储与查询 |
| CoordinateService | 统一坐标转换（屏幕→世界→格子） |

### 3.2 实体（entities/）

| 实体 | 职责 |
|---|---|
| Enemy | 移动（查询 BuffSystem 速度倍率）/血量/死亡通知 |
| Tower | 攻击范围内敌人/发射子弹/升级/出售 |
| Projectile | 追踪飞行/命中检测/伤害结算 |

### 3.3 工具（utils/）

| 工具 | 职责 |
|---|---|
| ObjectPool | 通用对象池，支持 Prefab 和 Node 模板 |
| PrefabFactory | 运行时用 Graphics 绘制形状（无需美术资源） |

### 3.4 设计原则

- **Entity 精简**：Enemy 只负责移动/血量/死亡，不处理 Buff（由 BuffSystem 管）
- **System 集中**：伤害/经济/波次各自独立，通过事件通信
- **Controller 桥接**：连接 System 和 Entity，不处理核心逻辑
- **CoordinateService 统一**：所有交互（放塔/点击/技能）走统一坐标转换

---

## 4. BuffSystem 设计（肉鸽基础）

### 4.1 Buff 类型

| Buff | 分类 | 效果 | 叠加 | 刷新 |
|---|---|---|---|---|
| BURN 燃烧 | DOT | 持续伤害 5/tick，间隔 0.5s | 最多 3 层 | 刷新持续时间 |
| POISON 中毒 | DOT | 持续伤害 3/tick，间隔 1s | 最多 5 层 | 不可刷新 |
| FREEZE 冻结 | CC | 移速 = 0，持续 1.5s | 1 层 | 刷新持续时间 |
| SLOW 减速 | CC | 移速 × 0.5，持续 2s | 1 层 | 刷新持续时间 |
| BLEED 流血 | DOT | 持续伤害 4/tick，间隔 0.5s | 最多 3 层 | 不可刷新 |
| STUN 眩晕 | CC | 移速 = 0，持续 1s | 1 层 | 不可刷新 |
| CURSE 诅咒 | Special | 死亡时爆炸 | 1 层 | 不可刷新 |
| MARK 标记 | Debuff | 受到伤害 × 1.5，持续 3s | 1 层 | 刷新持续时间 |

### 4.2 解耦效果

```
攻击者 → DamageSystem.applyBurn/applyPoison/applyFreeze
              ↓
         BuffSystem.applyBuff()
              ↓
         Enemy 查询 getMoveSpeedMultiplier / getDamageMultiplier
```

**新增 Buff 时只需**：1) 注册配置 2) DamageSystem 加快捷方法，**无需改 Enemy**。

---

## 5. MVP 最小可玩闭环（已完成）

### 5.1 用户路径

```
点击"开始波次"
    ↓
倒计时 3 秒（3 → 2 → 1）
    ↓
建造点出现 + 敌人开始生成
    ↓
从左侧拖拽塔按钮 → 放到建造点（扣 300 金币）
    ↓
塔自动攻击 → 子弹飞向敌人 → 伤害结算 → 敌人死亡消失
    ↓
漏怪 → 扣基地生命 → 归 0 游戏结束
```

### 5.2 场景结构

```
Canvas
├── GameLayer
│   ├── Path (直线 -400→400，y=0，起点绿圈终点城堡)
│   ├── TowerSlot × 3 (固定建造点 (-150,-64) (0,-64) (150,-64))
│   ├── EnemyLayer
│   ├── TowerLayer
│   └── ProjectileLayer
└── UILayer
    ├── HUD (Gold/Lives/Wave)
    ├── TowerBar (左侧塔栏，拖拽源)
    ├── CountdownLabel
    └── StartWaveButton
```

### 5.3 已实现功能

| 功能 | 状态 | 说明 |
|---|---|---|
| 波次系统 | ✅ | 3 波，W1=10普通1s间隔, W2=10普通0.8s, W3=5快速+2坦克 |
| 漏怪机制 | ✅ | 普通兵 -1，BOSS -5，基地 20 生命，归 0 游戏结束 |
| 金币奖励 | ✅ | 普通+10, 快速+15, 坦克+30, BOSS+100 |
| 拖拽放塔 | ✅ | 左侧塔栏拖拽 → 建造点放置 |
| 首塔免费 | ✅ | 第一个塔不扣金币 |
| 伤害结算 | ✅ | 箭塔伤害 15，攻击范围 140，攻击间隔 0.8s |
| 路径可视化 | ✅ | 起点绿圈，终点城堡（城垛+城门） |
| 倒计时 | ✅ | 3 秒倒计时后敌人生成 |
| 基地生命 | ✅ | HUD 显示，漏怪扣减 |

### 5.4 数值配置

| 项 | 值 |
|---|---|
| 初始金币 | 1000（够放 3 个塔） |
| 初始生命 | 20 |
| 塔花费 | 300（首塔免费） |
| 箭塔属性 | 攻击 15, 范围 140, 间隔 0.8s |
| 敌人 HP | 普通 10, 快速 8, 坦克 30, BOSS 100 |
| 建造点 | 3 个固定位置 |

---

## 6. Build System 流派构筑（后续方向）

### 6.1 核心思路

**不改变塔种类，改变塔行为。**

塔种类保持不变（箭塔/炮塔/魔法塔），通过 modifier 改变行为形成流派。

### 6.2 流派示例

| 塔 | 基础 | 强化（Modifier） | 最终流派 |
|---|---|---|---|
| 箭塔 | 单体攻击 | +穿透 +暴击 +毒伤 +分裂箭 | **毒箭流** |
| 箭塔 | 单体攻击 | +燃烧 +流血 +标记 | **燃烧流血流** |
| 魔法塔 | 减速攻击 | +冻结 +眩晕 +范围 | **冰冻控制流** |
| 炮塔 | 溅射攻击 | +诅咒 +标记 +暴击 | **诅咒爆炸流** |

### 6.3 技术实现基础

已有 BuffSystem 支持，后续只需：

1. 定义 Modifier 数据结构（影响 Projectile.buffType/buffStacks）
2. 波次结算时给玩家三选一 Modifier 卡片
3. 选择后修改塔的 attack 行为（改变 buffType/buffStacks）

---

## 7. 当前项目文件结构

```
TD/
├── assets/
│   ├── scripts/
│   │   ├── core/
│   │   │   ├── Constants.ts          # 枚举（GameState/TowerType/EnemyType）
│   │   │   ├── EventNames.ts         # 事件名常量
│   │   │   ├── CoordinateService.ts  # 坐标转换服务
│   │   │   └── SceneInitializer.ts  # 场景初始化（MVP）
│   │   ├── systems/
│   │   │   ├── GameStateManager.ts  # 游戏状态总管理器
│   │   │   ├── CurrencySystem.ts    # 货币系统
│   │   │   ├── DamageSystem.ts      # 伤害结算
│   │   │   ├── EnemyController.ts   # 敌人控制器
│   │   │   ├── TowerController.ts   # 塔控制器
│   │   │   ├── ProjectileController.ts # 子弹控制器
│   │   │   ├── WaveManager.ts       # 波次管理
│   │   │   ├── PathManager.ts       # 路径管理
│   │   │   └── buffs/
│   │   │       ├── BuffTypes.ts     # Buff 类型定义
│   │   │       └── BuffSystem.ts    # Buff 系统核心
│   │   ├── entities/
│   │   │   ├── Enemy.ts             # 敌人实体
│   │   │   ├── Tower.ts             # 塔实体
│   │   │   └── Projectile.ts        # 子弹实体
│   │   └── utils/
│   │       ├── ObjectPool.ts        # 对象池
│   │       └── PrefabFactory.ts     # 运行时图形工厂
│   ├── scenes/
│   │   └── Battle.scene             # 战斗场景
│   ├── data/
│   │   └── levels/                  # 关卡数据（MVP 暂用内置波次）
│   └── resources/                   # 运行时资源
├── doc/
│   └── requirements.md              # 本文档
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## 8. 开发约定

- 主分支：`main`，SSH 推送 `git@github.com:Xrainsmile/TDs.git`
- 提交信息：`<type>: <描述>`（feat/fix/refactor/tweak）
- 不提交：`.codebuddy/`、`library/`、`temp/`、`local/`、`build/`
- 调试方式：浏览器 F12 → Console 查看日志
- Cocos API 注意：`Layers.Enum.UI_2D`、`Button`（非 UIButton）、`ResolutionPolicy` 用数字（SHOW_ALL=3）

---

## 9. 下一步计划（建议优先级）

| 优先级 | 功能 | 说明 |
|---|---|---|
| P0 | 波次间 modifier 选择 | 三选一卡片，改变塔行为 |
| P1 | 多塔类型 | 炮塔（溅射）/魔法塔（减速） |
| P2 | 网格建造 | 引入 GridManager 自由放置 |
| P3 | 多关卡 | 恢复 LevelManager + 关卡 JSON |
| P4 | 经济平衡 | 递增敌人 HP/金币奖励/波次间隔 |
| P5 | 微信小游戏构建 | 构建 wechatgame 目录并用 CLI 预览 |

> **构建备注（方向）**：游戏已固定为**竖屏**，不会随手机重力感应旋转。
> - 运行时：`SceneInitializer.start()` 调用 `view.setDesignResolutionSize(640, 960, 3)` 将画布设为竖屏。
> - 微信端方向（Cocos 项目设置层面）：仓库根目录 `build-templates/wechatgame/game.json` 设置 `"deviceOrientation": "portrait"`。Cocos 构建结束时会把该文件拷贝并覆盖到 `build/wechatgame/game.json`，从而固定竖屏（`"auto"` 才会随设备旋转，已避免）。
> - 若需重新构建，确保 `build-templates/wechatgame/game.json` 随仓库提交；修改方向只需改该文件，无需改代码。
