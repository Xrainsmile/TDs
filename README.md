# TDs — 塔防游戏

基于 **Cocos Creator 3.8.8** 开发的微信小游戏塔防项目。

## 开发环境

| 工具 | 版本 | 用途 |
|---|---|---|
| Cocos Creator | 3.8.8 | 场景编辑、游戏逻辑、构建微信小游戏 |
| 微信开发者工具 | 最新版 | 预览、真机调试、上传发版 |

## 快速开始

### 1. 打开项目

Cocos Creator 3.8.8 打开 `/Users/rick/TD`

### 2. 打开 Battle 场景

双击 `assets/scenes/Battle.scene`

### 3. 添加 SceneInitializer 组件

1. 选中场景中的 **Canvas** 节点
2. 在 Inspector 面板点击 **添加组件**
3. 搜索并添加 `SceneInitializer`

### 4. 运行

点击运行按钮。SceneInitializer 会自动创建所有系统节点、组件和引用。

> **无需美术资源**：demo 使用 Graphics 组件运行时绘制形状（圆形敌人、方形塔等）。

## 项目架构

```
通用系统 (assets/scripts/systems/)
├── GameStateManager    # 游戏状态总管理器（单例）
├── CurrencySystem      # 货币（金币）系统
├── DamageSystem        # 伤害结算系统
├── EnemyController     # 敌人控制器（生成/回收/查询）
├── TowerController     # 塔控制器（放置/升级/出售）
├── ProjectileController# 子弹控制器（对象池/发射/命中）
├── WaveManager         # 波次管理器
├── PathManager         # 敌人移动路径
├── GridManager         # 网格地图（塔放置位）
└── InputManager        # 玩家输入处理

实体 (assets/scripts/entities/)
├── Enemy               # 敌人实体（移动/生命/减速）
├── Tower               # 塔实体（攻击/升级/出售）
└── Projectile          # 子弹实体（追踪/命中）

关卡数据 (assets/data/levels/)
├── level_01.json       # 第一关 · 草原小径（4波）
├── level_02.json       # 第二关 · 蜿蜒峡谷（5波）
└── level_03.json       # 第三关 · 迷宫要塞（6波）

UI (assets/scripts/ui/)
├── UIManager           # UI 总管理（面板切换）
├── HUD                 # 顶部信息栏
└── TowerMenu           # 建塔/升级菜单

工具 (assets/scripts/utils/)
├── ObjectPool          # 通用对象池
└── PrefabFactory       # 运行时节点工厂（Graphics 绘制）

配置 (assets/data/)
├── towers.json          # 塔属性
├── enemies.json         # 敌人属性
└── levels/             # 关卡数据
```

## 游戏设计

### 三种塔

| 塔 | 费用 | 特点 |
|---|---|---|
| 箭塔 | 50 | 高射速、单体伤害 |
| 炮塔 | 100 | 低射速、高伤害、溅射 |
| 魔法塔 | 80 | 中等射速、减速效果 |

### 四种敌人

| 敌人 | 生命 | 速度 | 特点 |
|---|---|---|---|
| 普通兵 | 100 | 80 | 绿色圆形 |
| 快速兵 | 60 | 160 | 黄色三角 |
| 坦克 | 400 | 40 | 灰色方形 |
| BOSS | 1000 | 50 | 红色六角 |

### 三个关卡

| 关卡 | 路径 | 建造位 | 波次数 | 初始金币 | 初始生命 |
|---|---|---|---|---|---|
| 草原小径 | 8点折线 | 22 | 4 | 200 | 20 |
| 蜿蜒峡谷 | 10点蜿蜒 | 24 | 5 | 250 | 18 |
| 迷宫要塞 | 14点迷宫 | 28 | 6 | 300 | 15 |

## 开发约定

- 主分支：`main`，使用 SSH 推送
- 提交信息格式：`<type>: <描述>`
- `.codebuddy/`、`library/`、`temp/`、`local/`、`build/` 不提交
- 配置数据统一放在 `assets/data/` 下（JSON 格式）
- 运行时资源放在 `assets/resources/` 下（可动态加载）
