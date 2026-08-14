# CLAUDE.md

## 项目背景

这是一个 Cocos Creator 3.8.8 塔防小游戏原型。当前阶段以玩法验证为主，但已经开始从 `SceneInitializer.ts` 中拆出稳定系统，避免场景类继续膨胀。

## 当前架构边界

- `assets/scripts/core/SceneInitializer.ts`
  - 只作为场景协调者：初始化、输入、波次、UI、系统调度、旧逻辑桥接。
  - 不再优先承载新的战斗细节或复杂数值规则。

- `assets/scripts/core/RuntimeTypes.ts`
  - 运行时共享类型。
  - `TowerRuntime`、`EnemyRuntime`、`TowerParams`、`ThrustState`、`PierceShot` 等类型从这里导入。

- `assets/scripts/core/systems/TowerParamResolver.ts`
  - 单塔最终属性解析入口。
  - 星级、词缀、全局 Buff、塔改造、核心供电、奶茶/锅铲等特殊数值规则优先放这里。

- `assets/scripts/core/systems/ThrustSystem.ts`
  - 奶茶吸管戳击系统。
  - 负责戳击启动、动画推进、双管连戳、命中判定、分叉视觉角度对齐、debug 判定区绘制。
  - 通过 `ThrustSystemContext` 从场景获取索敌、伤害、特效等能力。

- `assets/scripts/core/cards/`
  - 卡牌、Buff、改造卡、条件、权重、效果执行器。
  - 五选二手牌看 `CardRegistry.ts`。
  - 波后三选一看 `BuffRegistry.ts`。
  - 本局同类塔改造看 `TowerModifierRegistry.ts`。

- `assets/scripts/core/visuals/`
  - Graphics 占位视觉和皮肤配置。
  - 攻击表现节点优先在 `VisualFactory.ts` 创建。

## 开发约定

- 新增战斗机制时，先判断能否放进独立 system，而不是继续塞进 `SceneInitializer.ts`。
- 新增数值规则时，优先放进 `TowerParamResolver.ts` 或对应配置表。
- 新增卡牌效果时，优先用 `EffectExecutor.ts` 已有 effect 类型；确实特殊再走 `custom`。
- 新增视觉节点时，优先放进 `VisualFactory.ts`，运行逻辑只驱动 transform、显隐和时序。
- 新增 Cocos 脚本或目录时，需要同步创建 `.meta`。

## 验证

常用类型检查：

```bash
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/bin/tsc --noEmit --skipLibCheck
```
