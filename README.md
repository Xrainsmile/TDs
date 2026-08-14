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
核心运行 (assets/scripts/core/)
├── SceneInitializer.ts          # 场景协调者：初始化、输入、波次、UI、系统调度
├── RuntimeTypes.ts              # 运行时共享类型：TowerRuntime / EnemyRuntime / TowerParams 等
├── GameBalance.ts               # 静态数值：波次、金币、敌人速度、基础常量
├── MapConfig.ts                 # 地图尺寸、路径、建造格布局
├── RoguelikeCards.ts            # 本局全局强化状态 TowerStats
├── systems/
│   ├── TowerParamResolver.ts    # 单塔最终属性解析：星级、词缀、Buff、改造、光环
│   └── ThrustSystem.ts          # 奶茶吸管戳击：索敌、动画、双管连戳、命中判定
├── playtest/
│   ├── PlaytestRecorder.ts      # 试玩事件、波次汇总、流派里程碑与 Markdown 报告
│   └── PlaytestStorage.ts       # Web/微信小游戏本地保存与导出适配
├── cards/
│   ├── CardRegistry.ts          # 五选二/手牌卡配置
│   ├── BuffRegistry.ts          # 波后三选一强化配置
│   ├── TowerModifierRegistry.ts # 本局同类塔改造配置
│   ├── RunBuildState.ts         # 本局构筑状态
│   ├── EffectExecutor.ts        # 配置化效果执行器
│   ├── ConditionEvaluator.ts    # 解锁/互斥/权重条件判断
│   └── WeightCalculator.ts      # 动态权重计算
└── visuals/
    ├── VisualFactory.ts         # Graphics 占位美术节点创建
    └── VisualSkins.ts           # 视觉皮肤配置

UI (assets/scripts/ui/)
└── HUD                          # 顶部信息栏与基础 HUD 引用
```

### 架构拆分记录

`SceneInitializer.ts` 仍是当前原型阶段的场景协调者，但不再继续承载所有细节逻辑。

- 单塔最终属性统一走 `TowerParamResolver.resolve(...)`。
  - 新增星级、词缀、全局 Buff、塔改造、核心供电等数值规则时，优先放在 `TowerParamResolver.ts`。
  - `SceneInitializer.getTowerParams()` 只保留薄包装，方便旧调用点过渡。
- 奶茶吸管的戳击逻辑统一走 `ThrustSystem`。
  - 双管吸管的连戳、分叉视觉角度对齐、命中胶囊判定、戳击 debug 区域都在 `ThrustSystem.ts`。
  - `SceneInitializer` 通过 `thrustSystemContext()` 提供索敌、伤害、特效等回调。
- 运行时结构放在 `RuntimeTypes.ts`。
  - 新系统之间共享 `TowerRuntime`、`EnemyRuntime`、`TowerParams` 时，从这里导入，避免在场景类里重复定义。
- 试玩数据统一走 `PlaytestRecorder`。
  - `SceneInitializer` 只在波次、抽牌、选牌、塔操作、统一伤害入口和结算入口上报事实。
  - 伤害按实际扣血聚合到波次、塔、机制和 BOSS 来源；持续伤害记录生效秒数，不逐帧写事件。
  - Web 使用 `localStorage`，微信小游戏使用 `wx.setStorageSync`；正式发布前可统一关闭入口。
  - 使用方式与数据结构见 `doc/playtest-telemetry.md`。

后续扩展原则：如果某段逻辑已经具备独立主题（例如毒爆、弹道、光环、波后三选一抽取），优先拆到 `assets/scripts/core/systems/` 或对应的 `cards/`、`visuals/` 模块；`SceneInitializer.ts` 只做调度和桥接。

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
- 玩法配置优先放在 `assets/scripts/core/cards/`、`GameBalance.ts`、`MapConfig.ts`
- 视觉创建优先放在 `assets/scripts/core/visuals/`
- 新增 Cocos 脚本文件时同步添加 `.meta` 文件
- 类型检查命令：`/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/bin/tsc --noEmit --skipLibCheck`
