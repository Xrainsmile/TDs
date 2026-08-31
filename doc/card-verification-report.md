# 卡牌上报记录（Card Verification Report）

来源：描述=`CardRegistry.ts`；运行时数值=改造卡 `TowerModifierRegistry.ts` + 战术/风险卡 `SceneInitializer.effectContext.custom`；战斗表现=遥测 `card_used`+机制触发计数（见 `playtest-telemetry.md`）。
填写：实际效果/视觉反馈/遥测记录/结论 用 `☐`。

## 塔卡（spawnTower）
| 卡牌 | 进池条件 | 目标 | 预期效果 | 实际☐ | 视觉☐ | 遥测☐ | 结论☐ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 奶茶吸管 `card_tower_bubble_tea_straw` | 无 | 空格/升级 | 放置/升级奶茶吸管塔 | | | | |
| 打蛋器 `card_tower_whisk` | 无 | 空格 | 放置/升级打蛋器塔（圆周旋斩） | | | | |
| 锅铲 `card_tower_spatula` | 无；有减速塔/牙刷权重×1.25 | 空格 | 放置/升级锅铲塔（最密点爆发） | | | | |
| 筷子 `card_tower_chopsticks` | 无；有剪刀×1.25 | 空格 | 放置/升级筷子塔（直线穿透） | | | | |
| 剪刀 `card_tower_scissors` | 无；有筷子×1.35，筷子带线轴×1.5 | 空格 | 放置/升级剪刀塔（优先剪串联） | | | | |
| 减速塔 `card_tower_slow` | 无；有锅铲/牙刷×1.25 | 空格 | 放置/升级减速塔 | | | | |
| 杀虫喷雾 `card_tower_poison` | 无；有橡皮筋×1.35 | 空格 | 放置/升级杀虫喷雾塔 | | | | |
| 牙刷 `card_tower_toothbrush` | 无；有减速塔/锅铲×1.25 | 空格 | 放置/升级牙刷塔（横扫） | | | | |
| 充电宝 `card_tower_powerbank` | 无；有奶茶吸管×1.4 | 空格 | 放置/升级充电宝塔（+25%攻速光环） | | | | |
| 橡皮筋 `card_tower_rubberband` | 无；有毒塔×1.35 | 空格 | 放置/升级橡皮筋塔（弹射2次） | | | | |

## 工具卡
| 卡牌 | 进池条件 | 目标 | 预期效果 | 实际☐ | 视觉☐ | 遥测☐ | 结论☐ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 锤子 `card_tool_hammer` | 需有灰格；无灰格退池；连续2轮无锤子第3轮必出 | 灰格 | 解锁1个灰格 | | | | |

## 改造卡（addModifier，本局同类塔共享）
| 卡牌 | 进池条件 | 目标 | 预期效果（运行时数值） | 实际☐ | 视觉☐ | 遥测☐ | 结论☐ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 分裂弹道 `card_mod_split` | 有任意塔；minWave1 | 子弹/弹射塔 | 终结弹向2敌分裂，50%伤害（F2） | | | | |
| 双管吸管 `card_mod_double_straw` | 有奶茶吸管且波≥2 | 奶茶吸管 | 每轮戳2次(间隔0.10s)，每次70%伤，间隔+20% | | | | |
| 淬毒橡皮筋 `card_mod_venom_bounce` | 有橡皮筋+毒塔且波≥2 | 橡皮筋 | 命中/弹射/分裂施加中毒5/s·4s（F1） | | | | |
| 毒爆 `card_mod_poison_burst` | 有毒塔+橡皮筋且波≥3 | 杀虫喷雾 | 中毒死亡爆炸18伤、半径70（F1） | | | | |
| 核心供电 `card_mod_core_power` | 有充电宝+奶茶吸管且波≥2 | 充电宝 | 范围内奶茶吸管+35%攻速、25%暴击、2×暴击（F1） | | | | |
| 彩色线轴 `card_mod_thread_spool` | 有筷子且波≥2 | 筷子 | 串联最多4目标/4s，剪断群伤0.8×，最多3链（F1） | | | | |
| 过热线圈 `card_mod_overheat` | 无（minWave2，max2） | 任意塔 | 攻速+40%、伤害−15% | | | | |
| 加重弹头 `card_mod_heavy_head` | 无（minWave2，max2） | 任意塔 | 伤害+35%、攻速−20% | | | | |
| 加长枪管 `card_mod_long_barrel` | 无（minWave2，max2） | 任意远程塔 | 射程+30%、伤害+10% | | | | |
| 加宽口径 `card_mod_wide_caliber` | 无（minWave2，max2） | 范围/横扫塔 | 范围+35%、横扫角度+25°（F3） | | | | |
| 穿刺弹头 `card_mod_pierce_tip` | 无（minWave3，max2） | 任意塔 | 额外命中1目标 | | | | |
| 回收齿轮 `card_mod_salvage_gear` | 无（minWave1，max3） | 任意塔 | 击杀返还2金币 | | | | |

## 战术/风险卡（custom）
| 卡牌 | 进池条件 | 目标 | 预期效果（运行时数值） | 实际☐ | 视觉☐ | 遥测☐ | 结论☐ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 全场冰冻 `card_tac_freeze` | minWave3，max5 | 战场(inBattle) | 全场冻结2s | | | | |
| 胶带 `card_tac_tape` | minWave1，max5 | 战场落点 | 减速区半径80、持续8s、移速60%（F1） | | | | |
| 赌徒骰子 `card_risk_gambler_dice` | minWave2 | 即时 | 随机2塔+1星，1座未升星塔−1星(拆) | | | | |
| 透支供电 `card_risk_overdraft_power` | minWave3 | 即时(inBattle) | 本波+80%伤；波末−1星；随后−30%伤 | | | | |
| 时间借贷 `card_risk_time_loan` | minWave1 | 即时 | 立即+150金；随后2波收益归零 | | | | |

## 三层一致性审计
**描述=运行时数值**
- ✅ 双管吸管/过热线圈/加重弹头/加长枪管/穿刺弹头、全场冰冻/赌徒骰子/透支供电/时间借贷/锤子：完全一致。
- ❌ F2 分裂弹道：`changes={}`，"2目标/50%伤害"硬编码于 `SPLIT_COUNT`/`SPLIT_DMG_MUL`，改数值需动代码。建议提到配置。
- ⚠ F1 描述缺数值：毒爆、核心供电、彩色线轴、淬毒橡皮筋、胶带 运行时有明确数值但卡面未写。建议补卡面或确认 tooltip 承载。
- ⚠ F3 加宽口径：卡面"范围+35%"，运行时额外 `+25°角度`（注册表有，卡面无）。

**运行时数值=战斗表现（遥测可核对性）**
- 可核对：`card_used{id,target,decisionSeconds}` + 机制计数（分裂`split_projectile`/毒爆`poison_burst`/串联`skewer_chain`/剪断`skewer_cut`/破绽`brush_weakspot`/控制爆破`control_burst`）。
- ⚠ F4 遥测不记生效数值（仅id+耗时），验证"数值=表现"只能靠机制计数反推。建议补 `modifier_applied{id,towerId,keyValues}` 事件。

## 试玩填写
1. 实际效果：对照上表核对运行时数值是否体现。
2. 视觉反馈：攻速/范围光圈/暴击数字/冰冻减速区/串联线是否肉眼可见（注意 F1 卡面无提示的数值）。
3. 遥测记录：导出 Markdown 核对 `card_used` 与机制计数是否对得上。
4. 结论：通过/失败/需调整，关联 F1–F4。
