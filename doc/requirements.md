# TDs 塔防游戏 - 需求文档

> 仓库：https://github.com/Xrainsmile/TDs  
> 引擎：Cocos Creator 3.8.8  
> 目标平台：微信小游戏  

---

## 1. 项目定位

开发一款塔防微信小游戏，后续演化为**肉鸽塔防**（Roguelike Tower Defense）。

- **当前阶段**：MVP 最小可玩闭环已完成（分支 `minimal-playable-demo`：随机召唤建塔 + 7 波 + 三选一 Buff 卡 + 波次中/末发币）
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

> **当前实际运行状态**：分支 `minimal-playable-demo` 的运行入口是 `core/SceneInitializer.ts` 单体，仅依赖 `GameBalance / MapConfig / EffectManager / HUD / RoguelikeCards`。下方 `systems/`、`entities/`、`level/`、`data/` 为早期 7 系统架构的**遗留代码**，运行路径未引用，后续合并完整架构时再清理。

### 3.1 通用系统（systems/，遗留）

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

## 5. MVP 最小可玩闭环（分支 minimal-playable-demo，已完成）

> 当前实际运行入口是 `core/SceneInitializer.ts` 单体（仅依赖 GameBalance/MapConfig/EffectManager/HUD/RoguelikeCards）。`systems/`、`entities/`、`level/`、`data/` 为旧 7 系统架构遗留，运行路径未引用。

### 5.1 用户路径

```
关卡开始 5 秒倒计时（5 → 1）
    ↓
点击底部「10金币召唤」按钮 → 随机在空塔位建一座塔（每次扣 10 金币）
    ↓
（可选）长按已建塔拖动 → 移动 / 与另一塔交换 / 合并
    ↓
波次自动开始 → 敌人沿 6×8 网格折线地图生成前进
    ↓
塔自动攻击 → 子弹/即时效果命中 → 伤害结算 → 敌人死亡消失
    ↓
波次进行到一半 → 一次性 +10 金币；波次清空 → +30 金币 + 弹出三选一 Buff 卡
    ↓
选卡（期间禁止召唤/移动/交换/合并）→ 直接开下一波（无波次间倒计时）
    ↓
漏怪 → 基地生命 -1 → 归 0 游戏结束；清完 7 波 → 胜利
```

### 5.2 场景结构

```
Canvas
├── BattleRoot (6×8 网格地图，整体等比缩放)
│   ├── Path (蛇形折线 16 格，起点绿圈 → 终点城堡)
│   ├── BuildSlots (绿色塔位，含 2 个拐角，共 32 个)
│   ├── EnemyLayer / TowerLayer / ProjectileLayer
└── UILayer
    ├── HUD (Gold / Base / Status / Wave)
    ├── 底部按钮坞（攻击/减速/毒 三塔按钮 + 「10金币召唤」随机按钮）
    ├── 金币常驻显示（按钮上方 "gold N"）
    ├── 暂停按钮（右上）
    └── 三选一 Buff 卡（波次间）
```

### 5.3 已实现功能

| 功能 | 状态 | 说明 |
|---|---|---|
| 地图 | ✅ | 6×8 网格（GRID_COLS=6, GRID_ROWS=8），蛇形折线 16 格路径，32 个绿色塔位，局部坐标由 `gridToLocal()` 计算，随 BattleRoot 整体缩放 |
| 波次系统 | ✅ | 7 波，敌人 HP 递增（W1=45 / W2=130 / W3=160+治疗 / W4=240+治疗+精英 / W5=340+治疗 / W6=460+治疗+精英 / W7=600+治疗+精英+BOSS），普通兵为主、W3 起穿插治疗兵、W4 起加精英、W7 终波加 BOSS |
| 召唤建塔 | ✅ | 底部「10金币召唤」按钮随机建塔（每次扣 10 金币，非拖拽）；也可从底部三塔按钮拖拽到塔位放置（按塔自身 cost 扣费） |
| 开局保证输出塔 | ✅ | 前两次召唤都没出输出塔时，第 3 次只在攻击塔/毒塔中随机 |
| 移动/交换/合并 | ✅ | 长按已建塔拖动；交换与合并为落点分支逻辑（战斗期间也允许） |
| 金币经济 | ✅ | 初始 30；每波进行到一半 +10；每波清空 +30（WAVE_BONUSES）；击杀不给币 |
| 漏怪机制 | ✅ | 每个漏怪 -1，基地 6 生命（ALLY_MAX_HP=6），归 0 游戏结束 |
| 波次间三选一 | ✅ | 清波后弹出 Buff 卡三选一（RoguelikeCards），选卡期间禁止召唤/移动/交换/合并 |
| 选卡即开下一波 | ✅ | 已删除波次间 30s 倒计时，选完卡直接开下一波 |
| 关卡开局倒计时 | ✅ | 5 秒（LEVEL_START_COUNTDOWN），原 30s 已缩短 |
| 死亡统一清理 | ✅ | 子弹/溅射/Buff 致死只减血，每帧 `cleanupDeadEnemies()` 倒序统一移除（修溅射 buff 导致敌人残留的 bug） |
| 调试网格 | 🔧 可开关 | `SHOW_GRID`（SceneInitializer.ts 顶部，当前 false）；地图调试框 `drawMapDebugFrame` 仍保留 |
| 路径可视化 | ✅ | 起点绿圈，终点城堡（城垛+城门） |

### 5.4 数值配置

| 项 | 值 |
|---|---|
| 初始金币 | 30 |
| 初始生命（基地） | 6（漏怪 -1/个） |
| 召唤花费 | 10（底部「10金币召唤」按钮，随机塔） |
| 塔花费（拖拽放置） | 攻击塔 100 / 减速塔 120 / 毒塔 140 |
| 塔攻击（含 ×1.2 加成取整） | 攻击塔 dmg≈24, 范围120, 间隔0.56s；减速塔 dmg0 即时减速, 范围200；毒塔 dmg≈12, 范围144, 间隔0.8s |
| 敌人 HP | W1=45, W2=130, W3=160(普通)/200(治疗), W4=240（均普通兵，HP 为 def.hp × 注册表 hpMultiplier） |
| 波次数 | 4 |
| 波次金币 | 中 +10，末 +30 |
| 建造点 | 6×8 网格内 16 个可用绿色塔位（紧邻路径的前 16 个，道路格已排除） |

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
| ✅ 已完成 | 波次间 modifier 三选一 | RoguelikeCards 已实现，选卡期间禁操作（见 5.3） |
| ✅ 已完成 | 网格建造 | 6×8 网格 32 塔位（见 5.2/5.4），无需 GridManager 接入 |
| P1 | 多塔类型扩展 | 当前 3 塔（攻击/减速/毒）已含溅射(攻击塔)、减速、中毒，考虑更多主动技能/流派 |
| P2 | 多关卡 | 恢复 LevelManager + 关卡 JSON（当前仅单关 7 波） |
| P3 | 经济/难度平衡 | 依据实测调整敌人 HP 曲线、金币产出、塔花费 |
| P4 | 微信小游戏构建 | 构建 wechatgame 目录并用 CLI 预览（见下方构建备注） |
| P5 | 遗留架构清理 | 合并时清理 `systems/entities/level/data` 旧 7 系统，统一到 SceneInitializer 路线 |

> **构建备注（方向）**：游戏已固定为**竖屏**，不会随手机重力感应旋转。
> - 运行时：`SceneInitializer.start()` 调用 `view.setDesignResolutionSize(640, 960, 3)` 将画布设为竖屏。
> - 微信端方向（Cocos 项目设置层面）：仓库根目录 `build-templates/wechatgame/game.json` 设置 `"deviceOrientation": "portrait"`。Cocos 构建结束时会把该文件拷贝并覆盖到 `build/wechatgame/game.json`，从而固定竖屏（`"auto"` 才会随设备旋转，已避免）。
> - 若需重新构建，确保 `build-templates/wechatgame/game.json` 随仓库提交；修改方向只需改该文件，无需改代码。
