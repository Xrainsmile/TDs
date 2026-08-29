# UI 布局几何自检

程序化创建的 UI 卡片（Graphics + Label）没有 `.prefab` 可视化编辑，改动一个 `y` 坐标很容易让相邻元素叠在一起。肉眼只能靠截图发现，且往往是"改了 A 卡、B 卡悄悄错位"。

`tools/check-layout.js` 把这类几何约束变成可执行断言：**读源码 → 提取实际坐标 → 校验越界/重叠/行数**，无需启动游戏。

## 用法

```bash
npm run check:layout          # 全量校验
npm run check:layout:watch    # 监听源码，保存即自动重跑
node tools/check-layout.js --json   # JSON 输出，便于 CI 消费
```

退出码：`0` 通过，`1` 存在 ERROR，`2` 源码读取失败。可直接接 CI。

## 检查项

| 检查 | 判定 | 级别 |
|------|------|------|
| 越界 | 元素顶/底边超出卡片边界 | ERROR |
| 重叠 | 同列相邻元素垂直间隙 < 0.5px | ERROR |
| 行数 | 描述区高度 ÷ 行高 < 要求行数 | ERROR |
| 堆叠碰撞 | buff 卡三张竖排互相碰撞 | ERROR |
| 坐标未解析 | 元素坐标提取失败 | WARN |

## 关键设计：从源码提取，而非硬编码基线

脚本用正则从 `SceneInitializer.ts` **实时解析** `setContentSize` / `setPosition` / `createCardIcon` / `fontSize` / `lineHeight` 的实际值再校验。

这样改了源码坐标，脚本读到的是新值并重新判定，不会因为基线写死而输出过期的"通过"。

两个解析边界需要留意：

1. `sliceUntilNextMethod()` 把读取范围限制在单个方法内，避免跨方法误读参数。
2. `extractBlock()` 把范围限制到下一个 `new Node(` 之前，避免读到后续节点。

## 列（column）机制

buff 卡的图标在左侧（`x=-57`），名称/描述是通栏文本，二者垂直方向本就共存，不能按"上下相邻"判定重叠。

因此元素带 `column` 标记，`column` 不同的配对直接跳过垂直检查。**注意必须以"配对"为单位跳过，不能把左列元素从排序中剔除**——否则左列图标会把相邻的两个通栏文本（名称、描述）在排序里隔开，导致这对文本被误跳过，造成漏检。

## 新增一张卡片

在 `tools/check-layout.js` 里加一个 `readXxxCard(src)`，仿照 `readBuffCard`：

```js
function readXxxCard(src) {
    const fnIdx = src.indexOf('private createXxxCard');
    if (fnIdx === -1) return null;
    const body = sliceUntilNextMethod(src, fnIdx);

    const cardW = pick(body, /transform\.setContentSize\((\d+),\s*(\d+)\)/, 1);
    const cardH = pick(body, /transform\.setContentSize\((\d+),\s*(\d+)\)/, 2);
    // ... 用 extractBlock(body, '节点名') 提取各子元素

    return {
        id: 'xxx-card',
        label: '某某卡 XxxCard',
        card: { w: cardW, h: cardH },
        elements: [
            { name: '名称 XxxName', y: nameY, h: nameH, column: 'text' },
            { name: '描述 XxxDesc', y: descY, h: descH, lineHeight: descLine, column: 'text' },
        ],
        expectRows: 4,
    };
}
```

然后加进 `run()` 里的 `specs` 数组即可。

## Git pre-commit 自动拦截

已配置提交前自动校验：改动 `SceneInitializer.ts` 时自动跑自检，有问题直接拦截提交。

### 启用（每台机器执行一次）

hook 文件已提交到 `.githooks/`，但 `core.hooksPath` 是本地配置，克隆后需手动启用一次：

```bash
git config core.hooksPath .githooks
```

### 行为

| 场景 | 行为 |
|------|------|
| 提交未触及 `SceneInitializer.ts` | 直接放行，不跑校验（fast-path） |
| 触及且校验通过 | 放行，打印通过提示 |
| 触及且发现重叠/越界/行数不足 | **拦截提交**，退出码 1 |

### 校验的是暂存区，不是工作区

这点很关键。hook 用 `git show :<file>` 导出**暂存区版本**再校验，而不是读工作区文件。

否则会出现"工作区已改好、但暂存的是旧版"被误放行，或反过来被误拦截。实际效果：

```text
暂存区=好(-14.5)、工作区=坏(-99)  → 放行 ✅（入库的是好版本）
暂存区=坏(-5)、工作区=好(-14.5)   → 拦截 ✅（坏的差点入库）
```

### 绕过

```bash
git commit --no-verify
```

仅在紧急情况下使用，绕过的问题不会消失，下次提交仍会拦。

### 与全局 hooks 的关系

你的全局 `core.hooksPath=~/.git-hooks` 里有个转发器，会优先执行仓库本地的 `.git/hooks/pre-commit`。本项目改用仓库级配置指向 `.githooks/`，**不修改全局配置**，因此不影响其他仓库。

- 类型标签 `Kind` 未显式 `setContentSize`，高度按 `字号 × 1.3` 估算，标注 `estimated`，仅作粗略校验。
- 名称宽度在运行时会因有无图标在 112/150 间变化，脚本取创建时的静态值。
- 只校验垂直方向几何，不校验横向溢出（横向由 `Label.Overflow.SHRINK` 兜底）。

## 验证脚本本身

改完脚本务必注入 bug 反向验证，否则可能出现"永远通过"的假绿灯：

```bash
cp assets/scripts/core/SceneInitializer.ts /tmp/SI.bak
sed -i '' 's/descNode.setPosition(0, -14.5, 0);/descNode.setPosition(0, -5, 0);/' assets/scripts/core/SceneInitializer.ts
node tools/check-layout.js   # 应报 ERROR 且退出码 1
cp /tmp/SI.bak assets/scripts/core/SceneInitializer.ts
```
# test Sat Aug 29 23:15:56 CST 2026
