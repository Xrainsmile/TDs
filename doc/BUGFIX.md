# 塔防小游戏 BUGFIX 汇总

> 汇总自项目立项（2026-07-22）至今每日工作记忆中遇到的各类 bug，含**现象 / 根因 / 修复 / 位置**。
> 目的：沉淀踩过的坑，避免后续重复。

---

## 一、敌人 / 战斗

### 1. 敌人卡在路上不消失（毒 buff 致死）
- **现象**：溅射 buff 杀死的敌人卡在路上不消失。
- **根因**：buff 掉血致死段漏了 `removeFromParent()`。`destroy()` 是延迟销毁，不先 `removeFromParent()` 节点仍挂在场景树继续渲染。毒塔带溅射 buff 时：溅射施毒 → 敌带毒走 → 毒 buff 缓慢致死 → 走 buff 击杀段 → 漏 `removeFromParent()` → 卡路上。
- **修复**：所有击杀路径统一为 `playDeath + removeFromParent + destroy + splice + gold + log`。补 buff 击杀段与溅射击杀段的 `removeFromParent()` / `playDeath()`。
- **位置**：`SceneInitializer.ts` 主弹/自爆/溅射/ buff 四段击杀逻辑（约 1647 / 1715 / 1803 等行）。

### 2. 敌人卡在路径折点不动（掉帧横跳）
- **现象**：波次中敌人卡在路径折点不动、波次无法完成；日志常伴随 `requestAnimationFrame handler took 293ms` 掉帧。
- **根因**：旧敌人移动用**固定 5px** 判定「到达 waypoint 才推进 pathIdx」。掉帧时单帧步长 >5px（如 dt≈0.29s 时约 17px），敌人会在折点两侧反复横跳、永远进不了 5px 圈 → pathIdx 不前进 → 卡死。
- **修复**：到达判定改为「到当前 waypoint 距离 ≤ 本帧步长 step=speed*dt 即到达」，吸附到该点并 `pathIdx++`；掉帧时逐帧吸附前进、不横跳。
- **位置**：`SceneInitializer.ts` 敌人移动分支。
- **教训**：折线寻路的「到达阈值」必须与单帧最大步长挂钩，不能用固定像素值，否则掉帧必卡。

### 3. 溅射 buff 导致敌人不消失 / 残留（嵌套 splice 错乱）
- **现象**：选了 Roguelike 溅射卡后，部分敌人永久不消失、波次无法完成。
- **根因**：`triggerSplash()` 在**子弹命中循环内部**被调用，它遍历 `this.enemies` 并对 `hp<=0` 的敌人直接 `destroy + splice`。这对外层正以 `for j` 遍历 enemies 的子弹命中循环造成**嵌套 splice 数组错乱**——误删无辜敌人、漏删该死的，溅射触发时尤为明显。
- **修复（根治）**：所有致死路径（子弹命中 / 溅射 / buff 掉血）改为**只减血**；死亡移除统一集中到每帧新增的 `cleanupDeadEnemies()`（倒序遍历，`hp<=0` 才 `playDeath + removeFromParent + destroy + splice`，保留中毒死亡传染）。`cleanupDeadEnemies()` 放在 `update` 末尾、所有逻辑之后；**波次完成检测与中间奖励也一并移到 `update` 末尾、cleanup 之后**，确保本帧死亡已移除再判定。
- **位置**：`SceneInitializer.ts` `cleanupDeadEnemies()` + `update()`。

### 4. 命中特效使 BOSS 越打越大（累积放大）
- **现象**：高频命中下 BOSS 被反复放大、越打越大。
- **根因**：`EffectManager.playHit` 的 tween 回弹基准取了 `enemyNode.scale`（会累积放大），每次命中都在已放大基础上再放大。
- **修复**：回弹基准改用固定 `(1,1,1)`；白圈 14→10、放大 1.3→1.12。
- **位置**：`EffectManager.ts` `playHit`。
- **教训**：特效 tween 的回弹基准绝不能取被作用节点的 `scale`，必须用固定基准。

### 5. 毒 buff 视觉与逻辑不同步
- **现象**：毒挂的时间玩家以为只有 1 秒（实际逻辑 6 秒）。
- **根因**：`playPoison` 视觉特效只播 1 秒就销毁（`delay 0.8 + to 0.2`），逻辑 buff timer 却是 6 秒；自爆施毒段甚至无视觉。
- **修复**：`playPoison(enemyNode, duration=6)` 接收 duration；每次调用前清除已有毒圈避免叠加；外圈 tween `delay = duration - 0.2`。自爆施毒段补 `playPoison(e.node, 6.0)`。
- **位置**：`EffectManager.ts` `playPoison` + `SceneInitializer.ts` `onBulletHit` / 自爆段。

---

## 二、波次 / 倒计时

### 6. 波次间倒计时 undefined（缺 getter）
- **现象**：波次间无倒计时、GO 圆环不显示；日志 `波次间倒计时 undefined 秒`。
- **根因**：`SceneInitializer.ts` 用 `this.WAVE_COUNTDOWN`，但类里只给 `LEVEL_START_COUNTDOWN` 写了 `get` 访问器，`WAVE_COUNTDOWN` 没有 → `this.WAVE_COUNTDOWN` 为 undefined → `startCountdown(undefined,…)` 使 total/value 为 NaN，圆弧不绘制且永不结束。关卡开头用 `this.LEVEL_START_COUNTDOWN`（有 getter）故正常，所以只有波次间坏。
- **修复**：补 `private get WAVE_COUNTDOWN() { return WAVE_COUNTDOWN; }`。
- **教训**：新增从 `GameBalance` 引入的常量若以 `this.XXX` 方式访问，必须配套写一个 `get XXX()` 访问器；否则静默 undefined。统一走 getter 或直接使用模块级常量，不要混用。

### 7. restart 后残留敌人 / 子弹 / 拖拽状态
- **现象**：战斗中点「重新开始」，残留敌人或子弹，或拖拽状态卡死。
- **根因**：`restart()` 漏复位多项（`enemies`/`bullets` 完全没清；长按调度未取消；拖拽态、选卡态、waveTotalCount 漏归零）。
- **修复**：补全复位——`enemies`/`bullets` 遍历 `removeFromParent + destroy` 再清空；`unschedule(onLongPressMove)`；`isDragging/ghostNode/canPlace/targetSlot/moveFromSlot/dragMode/dragTowerDef/pendingTower` 复位；`currentBuffChoices=[]`/`selectedBuffIndex=-1`；`waveTotalCount=0`。
- **位置**：`SceneInitializer.ts` `restart()`。
- **注意**：`currentBuffChoices` 类型为 `BuffOption[]`（非空数组），不要赋 null 以免 TS 报错。

---

## 三、手牌（抽卡）系统

### 8. 卡牌放置后塔不显示（二次扣费）
- **现象**：抽卡后拖动塔卡到棋盘格子，松手后塔不出现。
- **根因**：`handleCardDrop` 调 `placeTower(slot, def)` 用默认 `cost=def.cost`（攻击100/减速120/毒140）；抽卡已扣 30 金，初始 30 抽一次后 gold=0，`placeTower` 内 `gold < cost` 直接 return，塔从未建出。
- **修复**：`handleCardDrop` 改为 `placeTower(slot, def, 0)`——卡牌放置不再二次扣费（抽卡费即入场价）。锤子卡 `useHammer` 本就不扣费。
- **位置**：`SceneInitializer.ts` `handleCardDrop`。

### 9. 用卡阶段为模态，无法移塔/合并、结束选牌按钮失效
- **现象**：手牌阶段无法移塔 / 交换 / 合并（BOSS 锁定一星塔时无法完成合并应对）；且「结束选牌」按钮其实也死了。
- **根因**：`TOUCH_START` 中 `if (this.cardMode) { ...; return; }` 整段拦截，命中手牌后直接 return，后续棋盘塔判定（含结束按钮分支前的中途 return）全部不执行。
- **修复**：cardMode 块改为**非模态**——① 点中底部按钮 → `finishCardSelection()` 并 return；② 命中手牌 → 开始拖牌并 return；③ 其余区域继续往下走棋盘塔判定（长按移塔/合并/交换）。TOUCH_MOVE/END 仍以 `cardMode && dragCardIndex>=0` 区分卡拖拽与塔拖拽，自然互斥。
- **位置**：`SceneInitializer.ts` `TOUCH_START` / `TOUCH_MOVE` / `TOUCH_END`。

### 10. 手牌阶段状态提示被每帧冲刷
- **现象**：手牌阶段用第一张后提示「已用1张，再拖1张」，但 `update()` 每帧又写「剩余敌人: N」把它冲刷掉，玩家几乎看不到手牌状态。
- **根因**：`update()` 状态栏优先级未把手牌阶段纳入高优先级，被波次战斗分支覆盖。
- **修复**：`update()` 状态栏改为**优先级链**：BOSS锁定 > 波后三选一 > 手牌阶段（固定显示「选牌中：已用 X/2，剩余N张｜点击底部按钮可结束」）> 用户暂停 > 波次战斗 > 普通待机。`handleCardDrop` 成功用牌后不再写临时文本（交由 update 每帧统一显示）。
- **位置**：`SceneInitializer.ts` `update()`。

### 11. 用一张手牌后剩余手牌全部消失（auto-finish 过早）
- **现象**：抽卡后出现 5 张手牌，用掉 1 张后剩余 4 张跟着消失。
- **根因**：旧逻辑在「剩余手牌全部当前不可用」时（`!hasUsableCardRemaining()`）自动 `finishCardSelection()`，且该判断在 `handleCardDrop` 用牌后及 `refreshHandCardUsability` 每次刷新都会触发。棋盘接近满（无开放格 / 无可升级同型塔 / 无灰格）时，用掉 1 张即被判「全不可用」→ 整手被清空。
- **修复**：
  - `refreshHandCardUsability` 移除「全不可用即自动结束」，仅做置灰显示。
  - `handleCardDrop` 自动结束仅保留用满上限（`usedCardCount >= 2`）。
  - `showHandCards` 仅在**发牌那一刻**整手都不可用时才自动结束（避免死手牌），用牌过程中不再清场。
- **位置**：`SceneInitializer.ts` `refreshHandCardUsability` / `handleCardDrop` / `showHandCards`。
- **注意**：此行为与此前「所有剩余不可用自动结束」需求相反，当日反馈为 bug 后推翻。

### 12. 取消卡牌拖拽后状态残留
- **现象**：`TOUCH_CANCEL` 只恢复旧塔拖动状态，未清卡牌幽灵视觉/拖拽索引，导致卡拖拽取消后状态残留。
- **根因**：`TOUCH_CANCEL` 漏清 `cardGhost.active` / `dragCardIndex` / `isDragging` / 卡牌幽灵视觉。
- **修复**：新增 `cancelCardDrag()` 统一执行 `cardGhost.active=false + dragCardIndex=-1 + isDragging=false`，统一在以下场景调用：TOUCH_CANCEL、victory、gameOver、restart（stopCountdown 后）、showBuffSelection（三选一入口）、finishCardSelection 复用。
- **位置**：`SceneInitializer.ts` `cancelCardDrag()`。

### 13. 胜利 / 失败未清手牌 + 结算弹窗下仍可交互
- **现象**：结算弹窗出现后，手牌残留在棋盘上，且 Canvas 仍响应抽牌 / 拖牌 / 棋盘操作。
- **根因**：`victory()` / `gameOver()` 只调 `cancelCardDrag()`，未清 `handCardNodes`/`handCards`/`cardMode`/`usedCardCount`；弹窗期间 Canvas 触摸未拦截。
- **修复**：新增 `resetCardSystem()` 统一执行 `clearHandCards()` + 清空 + `cancelCardDrag()` + `refreshSpendButton()`；`restart()`/`victory()`/`gameOver()` 三处均调用。`TOUCH_START` 最开头加 `if (this.isGameOver) return;`，弹窗期间 Canvas 不再响应任何交互（弹窗按钮自身用 `propagationStopped` 独立处理）。
- **位置**：`SceneInitializer.ts` `resetCardSystem()` + `TOUCH_START`。

### 14. 抽卡按钮可用性判定不全
- **现象**：`refreshSpendButton` 抽卡按钮亮起只判 `gold >= DRAW_COST`，忽略手牌 / 三选一 / 结束 / 暂停状态，可能误亮导致无效点击。
- **修复**：抽卡态 `enabled` 需同时满足 5 条件：①`gold >= DRAW_COST` ②`handCards.length === 0` ③`!isBuffSelecting` ④`!isGameOver` ⑤`!isUserPaused`；`cardMode` 态恒亮显示「结束选牌」。
- **位置**：`SceneInitializer.ts` `refreshSpendButton`。

### 16. 抽卡后手牌卡牌不可见（微信端 Graphics 需在 active 节点上绘制）
- **现象**：点「30金抽卡」后，状态栏显示「剩余5张」、可拖动出幽灵，但底部静态卡牌**始终不渲染**（多次重改用「预建卡槽复用」「运行时动态 new Node」均无效）。
- **根因（微信小游戏特有）**：Cocos Graphics 在 **inactive 节点**上绘制的几何不会提交渲染。手牌槽创建时 `active=false` 且从不绘制，绘制推迟到 `applyHandCardData`（仍先于 `node.active=true`）→ 几何未提交 → 卡牌不可见。而波后三选一 Buff 卡在 `createBuffCard` 中**创建即绘制（active 状态）**、之后只切 `active`，所以一直正常。
- **修复**：
  - `buildHandCardSlot` 创建时先 `node.active = true` → 画占位图形（提交几何）→ 再 `node.active = false` 隐藏；
  - `showHandCards` 循环改为**先 `node.active = true`，再 `applyHandCardData` 绘制**，完全对齐 Buff 卡模式。
- **位置**：`SceneInitializer.ts` `buildHandCardSlot` / `showHandCards`。
- **原则（务必遵守）**：微信端任何动态/复用 Graphics 节点，**绘制命令必须在节点 active 状态下执行**；若需默认隐藏，先 active 画一遍占位再隐藏，后续重绘也要先 active。

### 17. 抽卡后手牌为空（handCards=0，候选池被互斥条件空真排除）
- **现象**：点「30金抽卡」后底部无任何卡牌；日志 `[showHandCards] handCards=0`。注意：状态栏可能仍显示「剩余5张」等文字（文字来自 `handCards.length` 计数，与节点渲染无关），但真正生成并渲染的卡牌数量为 0。
- **根因**：`cards/ConditionEvaluator.ts` 的 `triggersExclude()` 实现为 `return evaluateAll(def.excludeConditions, snap);`。`evaluateAll` 对**空数组空真返回 true**（"全部 0 个条件都满足"=真）；而 `buildHandCards()` 的过滤是 `if (triggersExclude(c, snap)) return false;`——于是**全部 `excludeConditions: []` 的卡（当前 13 张全中）都被误判为"互斥、应排除"**，候选池直接为空 → `handCards=0` → 什么卡都不生成。
- **修复**：`triggersExclude` 改为"任意一条成立即排除"语义：`def.excludeConditions.some(c => evaluateCondition(c, snap))`。空列表返回 `false`（不互斥），命中任意一条返回 `true`。`meetsUnlock` 仍用 `evaluateAll(unlockConditions)`（空列表=无前置=通过，语义正确，不动）。
- **位置**：`cards/ConditionEvaluator.ts` `triggersExclude`；`SceneInitializer.ts` `buildHandCards` 过滤。
- **关联修复（同批下发清单，避免此类回归）**：
  - 开局 `currentWave=0` 但卡牌 `minWave≥1` → `buildHandCards` 过滤统一用 `evaluationWave = Math.max(1, this.currentWave)` 并写回 `snap.currentWave`，避免开局全卡被波次条件排除；
  - `drawCards` 改为「先 `buildHandCards` → 牌池为空则取消抽卡且不扣金币 → 否则再扣 30 金」，避免牌池配置异常时白白扣金进入空手牌。
- **关键调试教训**：**"XX 不显示"类问题，先确认对象在 state 里有没有生成**（`handCards.length` / 节点数组长度），再决定查数据层（生成/过滤）还是渲染层（setScale/UIOpacity/Graphics active）。同一症状（卡牌不显示）上次是渲染层（#16 Graphics active 节点），这次是数据层（候选池空），**不能因为上次同层就默认这次也同层**。本项目 `showHandCards` 自带 `[showHandCards] handCards=N` 日志即分水岭，定位时第一时间看这行：为 0 必是数据层，>0 才查渲染。

---

## 四、Roguelike 三选一（buff 卡）

### 15. 三选一补位绕过互斥 / 前置 / 场景条件
- **现象**：加入真实分支卡（互斥卡、终结卡、专属卡）后，互斥卡 / 无效专属卡可能被盲补回牌池。
- **根因**：`buildBuffPool` 原有「兜底补位」直接 `ROGUELIKE_BUFFS.find(b => !pool.find(...))`，绕过了 `requires`/`excludes`/`minWave`/`maxStacks` 与场景条件（如毒塔专属 splash/bleed、减速塔专属 slow）。
- **修复**：
  - 抽取 `isBuffSceneEligible(buff)`（毒塔专属 / 减速塔专属）为独立函数；
  - `isBuffEligible` 涵盖全部前置（minWave/requires/excludes/maxStacks）+ 场景条件；
  - 补位循环同样走 `isBuffEligible` 全量资格判断，牌池不足 3 张时安全降级（优先有效通用卡），绝不绕过任何前置/互斥；
  - `showBuffSelection` 抽选 / 显示按 `choiceCount = Math.min(3, pool.length)`，不访问不存在的第三张卡，并用 `card.active=false` 隐藏未使用的卡片位。
- **位置**：`SceneInitializer.ts` `isBuffEligible` / `isBuffSceneEligible` / `buildBuffPool` / `showBuffSelection`。

---

## 五、BOSS / 敌人特殊行为

### 16. BOSS 锁定提示被每帧冲刷 + 环无秒数
- **现象**：`lockTower` 写一次提示后，`update()` 每帧回落到「剩余敌人」冲刷掉；红色锁定环无秒数，玩家难理解塔为何被摧毁 / 停火 / 降级。
- **根因**：状态栏优先级未纳入 BOSS 锁定；锁定环无倒计时文字。
- **修复**：`update()` 的 `bossLockedTower` 分支每帧调 `refreshBossLockStatus()` 写入「BOSS 锁定防御塔！N 秒后 {应对}」；`updateBossLock` 每帧也调 + `updateLockTimerLabel()`；`setTowerLockVisual` 环上加重子节点 Label「LockTimer」显示 `Math.ceil(bossLockTimer)`；合并成功（`upgradeTower` 内 `bossLockedTower === targetTower`）立即 `clearBossLock()`。
- **位置**：`SceneInitializer.ts` `refreshBossLockStatus` / `updateBossLock` / `setTowerLockVisual` / `upgradeTower`。

### 17. BOSS 锁定销毁塔后访问已销毁节点
- **现象**：合并模式未应对应被摧毁的塔，随后 `clearBossLock()` 仍尝试 `setTowerLockVisual(已销毁塔)` → 访问已销毁节点。
- **根因**：销毁流程先 `destroyLockedTower`，后 `clearBossLock` 恢复锁定视觉，未校验节点有效性。
- **修复**：`clearBossLock` 检查 `locked.node && locked.node.isValid` 才恢复视觉；`setTowerLockVisual` 入口也加 `if (!tower.node || !tower.node.isValid) return;` 双保险。
- **位置**：`SceneInitializer.ts` `clearBossLock` / `setTowerLockVisual`。

### 18. BOSS 锁定目标总是取数组第一座
- **现象**：合并失败时锁定的塔总是 `towers[0]`，缺乏随机性。
- **根因**：`findMergeableOneStar` / `triggerBossSkill` 直接取数组首元素（可合并一星塔、一星塔、二星塔分支均如此）。
- **修复**：先构造候选数组再随机选取——优先随机选真正可合并的一星塔；无则随机选一星塔；全二星则随机选二星塔。`findMergeableOneStar` 返回候选中随机一座。同一次锁定未结算前（`bossLockedTower` 非空）不生成新目标。
- **位置**：`SceneInitializer.ts` `findMergeableOneStar` / `triggerBossSkill`。

---

## 六、交互 / 视觉一致性

### 19. 长按移动塔失效（抖动阈值误取消）
- **现象**：长按还是不能移动塔，回退成点击弹菜单；需要支持长按后挪动、取消点击交互。
- **根因**：`TOUCH_MOVE` 加「长按待定阶段手指移动 >18px 就取消长按」，但 18px 是在**缩放前的设计坐标**里算的，手指自然抖动即超阈值、长按几乎瞬间被取消 → 永不直接触发拖拽。
- **修复**：删除 `TOUCH_MOVE` 中的长按抖动取消块；长按计时器（0.4s）在手指按下期间必然触发 `onLongPressMove` → `startMoveTower`；删除 `showTowerMenu` 与塔点击菜单命中块（短按无反应）。
- **位置**：`SceneInitializer.ts` `TOUCH_MOVE` / `onLongPressMove`。

### 20. 开局金币显示两处不一致
- **现象**：开局 HUD 顶部 `Gold: 30`，但底部「10金币召唤」按钮上方的常驻金币标签显示 `gold 0`；顶部 status 引导文案写「拖拽底部塔按钮到绿色格子」，与实际机制矛盾。
- **根因**：`goldAboveButtonLabel` 在 `createSpendButton`（早于金币初始化）创建时用了当时的 `this.gold`（初始 0）；引导文案是旧拖拽建塔时代残留。
- **修复**：`updateGoldLabel()` 统一更新 HUD 顶部 `goldLabel` 与按钮上方 `goldAboveButtonLabel`（同为 30）；status 文案改为「点击底部「30金抽卡」按钮随机建塔」。
- **位置**：`SceneInitializer.ts` `updateGoldLabel` / `setupScene`。

### 21. 术语不统一（锄头 / 锤子混用）
- **现象**：代码与提示同时出现「锄头」「锤子」，玩家困惑。
- **修复**：用户面文案统一为「锄头」（如「该格被封锁，需用锄头撬开」）；代码标识符（`kind:'hammer'` / `hammerCount` / `useHammer`）保持不变。
- **位置**：`SceneInitializer.ts` 提示文案与注释。

### 22. 封闭格位置随地图排序漂移
- **现象**：原规则把塔位数组末尾 6 格设为封闭格，地图排序或塔位数量变化后封闭位置随之改变。
- **根因**：封闭格用 `slotPositions.length - LOCKED_SLOT_COUNT` 动态推算，绑定数组位置而非语义坐标。
- **修复**：`MapConfig.ts` 新增 `LOCKED_BUILD_CELLS: GridCell[]`（显式网格坐标）+ `LOCKED_BUILD_CELL_KEYS` 集合；`SceneInitializer.ts` 用并行 `slotCells` 数组按坐标匹配 `lockedSlots`，不再依赖数组末尾。
- **位置**：`MapConfig.ts` `LOCKED_BUILD_CELLS` / `SceneInitializer.ts` `slotCells` / `lockedSlots`。

---

## 七、构建 / 环境坑（非代码缺陷，但反复踩）

### A. 旧构建未重新编译（首要怀疑）
- **现象**：用户在微信开发者工具跑的是**旧构建**，Cocos Creator 改 .ts 后未重新构建 / 未刷新 `build/wechatgame` → 跑旧逻辑，日志行为与本分支代码不符。
- **应对**：遇到「日志行为与本分支代码不符」的反馈，**第一反应是让用户重新构建验证**，不要急着改代码；重构建后仍能复现才真正排查。

### B. 复用代码必须一起提交
- **现象**：`RoguelikeCards.ts` 曾因旧编译错误被故意 untracked，但它被 `SceneInitializer.ts` import → 新 clone 找不到模块而编译失败，仓库不自洽。
- **应对**：被其他代码 import 的文件必须一起提交，不要因「旧的编译错误」理由排除。

### C. 本地未装 typescript
- **现象**：`tsc --noEmit` 无法在终端运行，`splitCount` 等编译错误只能靠 Cocos 编辑器编译 / lint 验收。
- **应对**：验收以 Cocos 编辑器编译 / lint 为准；改完跑 lint 工具（0 错误）再交付。

---

## 八、修复 CheckList（后续改动自检）

1. 新增从 `GameBalance`/`MapConfig` import 的常量若以 `this.XXX` 访问 → **必须配套 getter**。
2. 敌人折线移动「到达阈值」用 `step=speed*dt`，**禁用固定像素**。
3. 任何致死路径：只减血，死亡移除**集中到 `cleanupDeadEnemies()`**，禁止在遍历 `enemies` 的循环内 `splice`。
4. `destroy()` 前先 `removeFromParent()`，否则节点残留渲染。
5. 特效 tween 回弹基准用**固定值**，勿取被作用节点 `scale`。
6. 状态栏改动后确认 `update()` 优先级链覆盖你的新状态，避免被每帧冲刷。
7. `restart()` / `victory()` / `gameOver()` 必须完整复位 `enemies`/`bullets`/拖拽/选卡/波次计数态。
8. 手牌相关：用牌后**不要**因「剩余全不可用」清整手；自动结束仅在发牌死手牌或达到使用上限时。
9. 卡牌放置 / 升级 / 锤子 **不二次扣费**（抽卡费即入场价）。
10. 触摸路由改动后确认 `TOUCH_START/MOVE/END/CANCEL` 各状态在卡拖拽与塔拖拽间互斥且清理完整。
11. 「空列表应视为不触发」的判断**绝不能用 evaluateAll/全部-&&**（空真返回 true），用 `some`/`none`/`||`；互斥条件用 `some`（任意一条成立即排除），前置条件用 `evaluateAll`（全部满足才通过）——调用处语义必须与函数一致（exclude→some、unlock→evaluateAll）。
12. 「XX 不显示」类问题：**先确认对象在 state 里有没有生成**（数组长度 / 节点数），再决定查数据层还是渲染层；不要因为上次同类 bug 在同层就默认这次也同层。本项目 `[showHandCards] handCards=N` 日志是分水岭。
