# TDs - 家庭物品塔防 Demo

基于 **Cocos Creator 3.8.8** 开发的竖屏肉鸽塔防小游戏。当前目标是先验证“随机发牌、顺势构筑、流派成型”的核心乐趣；日常开发以 PC Web 预览为主，微信开发者工具用于最终的小程序适配和真机验证。

## 当前状态

- 单局 7 波，第 7 波为 BOSS 战。
- 金币抽取 5 张手牌，每轮最多使用 2 张；手牌包含塔、起子、改造卡和战术卡。
- 波次结束后进行一次三选一强化，候选会根据场上阵容和已有构筑动态解锁、加权。
- 塔可以放置、移动、交换、同类合并升级，也可以付费拆除。
- 已实现 Web 与微信小游戏共用的试玩记录器，可导出 Markdown 和 JSON。
- 奶茶供电流已接入首批正式 PNG，其余内容仍以 Graphics 占位表现为主。

## 核心循环

1. 花费金币抽取 5 张牌，从中使用最多 2 张完成布防或改造。
2. 敌人沿固定路径推进；击杀、波次奖励和风险牌共同提供经济。
3. 清波后从生存、成型、成长等方向中三选一。
4. 根据实际来牌顺势构筑，在第 7 波击败 BOSS。

抽卡价格采用平滑成长曲线：`30 x3 -> 35 x3 -> 40 x3 -> 45 x3 -> 50 -> 55 -> 60 -> 65 -> 70 -> 75`，之后封顶 75。

## 已实现流派

| 流派 | 基础组件 | 关键质变 |
|---|---|---|
| 奶茶供电流 | 奶茶吸管 + 充电宝 + 核心供电 | 双管吸管 + 过载双击：被供电吸管的第二戳必定暴击 |
| 弹射毒爆流 | 橡皮筋 + 杀虫喷雾 + 毒爆 | 毒液残留或浓缩毒爆，放大连锁清场能力 |
| 控制爆破流 | 减速塔 + 牙刷 + 锅铲 | 碎裂爆破：刷洗减速目标后由锅铲引爆 |
| 针线裁剪流 | 缝衣针 + 彩色线轴 + 剪刀 | 利落裁口：剪断缝合链并集中造成群体伤害 |

各组件都能独立工作，完整组合提供行为质变。试玩记录器会自动识别每套流派的“出现方向、基础成立、完成质变”波次。

## 塔与工具

| 物品 | 定位 |
|---|---|
| 奶茶吸管 | 贴身高速单体戳击 |
| 充电宝 | 范围攻速光环与奶茶流供电核心 |
| 杀虫喷雾 | 优先攻击尚未中毒的敌人，提供持续伤害 |
| 橡皮筋 | 多目标弹射，可承载淬毒与分裂弹道 |
| 减速塔 | 优先控制尚未减速的敌人 |
| 牙刷 | 近距离扇形横扫，为控制爆破建立破绽 |
| 锅铲 | 面向敌群密集处的范围重击 |
| 缝衣针 | 直线穿透多个敌人并建立缝合链 |
| 剪刀 | 近距离剪击，优先攻击缝合目标 |
| 打蛋器 | 自身周围持续旋转范围伤害 |
| 起子 | 激活灰色塔位，不占用塔位 |

## 开发环境

| 工具 | 版本 | 用途 |
|---|---|---|
| Cocos Creator | 3.8.8 | 场景、逻辑、Web/微信小游戏构建 |
| PC 浏览器 | Chrome 或同类浏览器 | 日常快速预览与试玩数据导出 |
| 微信开发者工具 | 当前稳定版 | 小程序包体、真机、平台 API 与提审验证 |

## 快速开始

### Cocos Creator 预览

1. 使用 Cocos Creator 3.8.8 打开项目目录。
2. 打开 `assets/scenes/Battle.scene`。
3. 点击运行按钮，在浏览器中开始游戏。

`Battle.scene` 已配置运行入口，不需要手动给 Canvas 添加组件。

### PC Web 构建预览

在 Cocos Creator 的“项目 -> 构建发布”中选择 **Web Desktop** 构建。构建完成后启动本地静态服务器：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory build/web-desktop
```

然后访问 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)。`build/` 是本地产物，不提交到 Git。

### 微信小游戏构建

可从 Cocos Creator 构建面板选择 **微信小游戏**，也可执行：

```bash
npm run build:wechat
```

生成后再用微信开发者工具导入构建目录。日常玩法调试无需始终打开微信开发者工具。

## 项目架构

```text
assets/
├── art-bundle/                         # 游戏运行时美术分包
├── scenes/Battle.scene                 # 当前战斗场景
└── scripts/core/
    ├── SceneInitializer.ts             # 场景协调：初始化、输入、波次、UI、系统桥接
    ├── RuntimeTypes.ts                 # Tower/Enemy/Bullet 等运行时共享类型
    ├── GameBalance.ts                  # 金币、波次、敌人等静态数值
    ├── MapConfig.ts                    # 地图、路径和塔位配置
    ├── RoguelikeCards.ts               # 本局全局强化状态 TowerStats
    ├── systems/
    │   ├── TowerParamResolver.ts       # 星级、Buff、改造、光环后的最终塔属性
    │   └── ThrustSystem.ts             # 奶茶吸管索敌、戳击、双击和命中
    ├── cards/
    │   ├── CardRegistry.ts             # 五选二手牌配置
    │   ├── BuffRegistry.ts             # 波后三选一强化配置
    │   ├── TowerModifierRegistry.ts    # 同类塔改造配置
    │   ├── RunBuildState.ts            # 本局构筑状态
    │   ├── EffectExecutor.ts           # 配置化效果执行
    │   ├── ConditionEvaluator.ts       # 前置、互斥和目标条件
    │   └── WeightCalculator.ts         # 动态发牌权重
    ├── playtest/
    │   ├── PlaytestRecorder.ts         # 波次、操作、流派和伤害归因聚合
    │   └── PlaytestStorage.ts          # Web/微信存储与导出适配
    └── visuals/
        ├── VisualFactory.ts            # Graphics/Sprite 视觉节点创建
        └── VisualSkins.ts              # 塔、卡牌和特效皮肤注册

art/source/                              # 原始大图，不进入游戏包
doc/                                     # 策划、测试、架构与美术管线文档
```

### 架构边界

`SceneInitializer.ts` 仍是原型阶段的场景协调者，但新的独立机制不应继续直接堆入其中。

- 单塔最终数值统一由 `TowerParamResolver.resolve(...)` 解析。
- 奶茶吸管的攻击时序和命中统一由 `ThrustSystem` 负责。
- 跨系统运行时类型统一放在 `RuntimeTypes.ts`。
- 卡牌资格、权重和效果优先配置在 `cards/`。
- 视觉节点创建与资源切换优先放在 `visuals/`。
- 已形成独立主题的毒爆、弹道、光环等逻辑，后续继续拆入 `systems/`。

## 试玩记录

胜利或失败结算时可点击“导出记录”：

- Web：下载 Markdown 报告和 JSON 原始记录。
- 微信小游戏：复制 Markdown，并将 Markdown/JSON 保存到本地存储。
- 自动记录波次压力事实、抽牌与选牌、构筑里程碑、塔操作、有效伤害、机制贡献和 BOSS 伤害来源。
- 人工只需补充主观压力、纠结度修正、爽点和局末评分。

Web 控制台还可使用：

```js
__TD_PLAYTEST__.latest()
__TD_PLAYTEST__.list()
__TD_PLAYTEST__.exportLatest()
```

完整说明见 [试玩记录器](doc/playtest-telemetry.md) 和 [试玩记录表与评分标准](doc/playtest-record-template.md)。

## 美术资源约定

- `art/source/`：保留 2048x2048 等原始生成图，供裁切和返工，不进入游戏包。
- `assets/art-bundle/`：经过裁切、缩放和压缩的运行时资源，由 Cocos 作为分包构建。
- `VisualSkins.ts`：资源注册入口；未加载成功时自动回退到 Graphics 占位视觉。
- 当前坚持“管线早验证、批量美术晚投入”，优先完成流派与数值验证。

详见 [美术管线](doc/art-pipeline.md) 和 [美术 Prompt 集](doc/art-prompts.md)。

## 验证

类型检查：

```bash
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/bin/tsc --noEmit --skipLibCheck
```

涉及场景、资源或构建配置的改动，还应至少完成一次 Web Desktop 构建并在浏览器中试玩。

## 开发约定

- 当前 Demo 开发分支：`minimal-playable-demo`。
- 提交信息格式：`<type>: <描述>`。
- `.codebuddy/`、`library/`、`temp/`、`local/` 和 `build/` 不提交。
- 新增 Cocos 脚本或资源时同步提交对应 `.meta` 文件。
- 数值优先放入 `GameBalance.ts`、`TowerParamResolver.ts` 或对应卡牌配置，避免新增散落常量。

## 相关文档

- [需求与历史实现记录](doc/requirements.md)
- [扩展指南](doc/extension-guide.md)
- [试玩数据说明](doc/playtest-telemetry.md)
- [试玩评分标准](doc/playtest-record-template.md)
- [美术资源管线](doc/art-pipeline.md)
- [美术生成 Prompt](doc/art-prompts.md)
- [竞品与策略笔记](doc/strategy-competitive.md)
