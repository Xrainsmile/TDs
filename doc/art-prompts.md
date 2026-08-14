# 美术生成 Prompt 集

> 生成工具：**豆包**（2026-08-13 实测无法输出真透明 PNG，仅画"假棋盘格"或白底压平）。
> 因此统一采用 **品红底 `#FF00FF` + 抠图** 管线：生成 → rembg 抠图 → 手动裁切 → 导入 `assets/resources/art/`。
> 本文档是 prompt 的唯一权威来源，改 prompt 先改这里再重新生成。

## Prompt 结构约定

每条 prompt = **风格块 + 对象块 + 技术块**，负面词全局共用：

- **风格块**：chibi 扁平矢量、粗圆深棕描边、平涂双色调、糖果色、点状眼睛——保证 6 张图像一套
- **对象块**：按 `TOWER_REGISTRY` 真实配色写死 hex 值（吸管 `#EBCDA0` / 充电宝 `#FFB43C` / 供电特效黄 `#FFEB50` + 青 `#78DCFF`）
- **技术块**：品红纯底、512×512、10% padding、无文字无水印

### 负面 Prompt（所有图共用）

```
photorealistic, 3d render, octane, gradient, glossy, metallic reflection, detailed texture, drop shadow, background scenery, multiple objects, collage, sprite sheet, text, letters, watermark, frame, border, cropped, blurry, thin sketch lines, rough lines, noise, dark tone
```

---

## 奶茶吸管 × 充电宝流派（6 张）

| # | 文件 | 内容 | 接入规格 |
|---|---|---|---|
| 1 | `art/towers/straw_idle.png` | 吸管站立 | 锚点 (0.5,0.5)，宽 ~56 |
| 2 | `art/towers/powerbank_idle.png` | 充电宝站立（普通态） | 锚点 (0.5,0.5)，宽 ~56 |
| 3 | `art/attacks/straw_thrust.png` | 吸管戳击 | 锚点 (0,0.5)，宽=90，水平朝右 |
| 4 | `art/towers/powerbank_powered.png` | 充电宝供电态 | 与 #2 同裁切框整图替换 |
| 5 | `art/towers/straw_powered.png` | 吸管被供电态 | 与 #1 同裁切框整图替换 |
| 6 | `art/fx/core_power_ring.png` | 电流圈（叠加层） | 锚点 (0.5,0.5)，76×76，**必须正方形** |

> 充电宝是 support 塔不攻击（`visualEffectId: 'none'`），所以没有攻击视觉图；
> 充电宝→吸管的闪电线是每帧重绘的 Graphics 折线，保留程序绘制，不做贴图。

### 图 1：吸管站立 `straw_idle`

```
a cute thick bubble tea straw character standing upright, angled cut tip at the top, cream beige body #EBCDA0, one visible brown tapioca pearl inside the tube, small round dark base under it, chibi flat vector game asset, single object, centered, front view, thick rounded dark-brown outline (uniform weight), flat color fill, two-tone shading only (one light + one shadow tone), high saturation candy colors, simple cute face with two small dot eyes on the upper body, no gradient, no texture, no material reflection, no cast shadow, clean bold silhouette that stays readable when scaled down to 48 pixels, isolated on pure magenta background (#FF00FF), full body fully inside frame with 10% padding, no cropping, no text, no watermark, no logo, no border, no frame, no UI elements, no ground plane, 512x512 square
```

### 图 2：充电宝站立（普通态）`powerbank_idle`

> 普通态 LED 必须是**暗的**（dim gray）——给供电态留对比。

```
a cute chubby power bank character standing upright, rounded rectangle orange body #FFB43C, four small dim gray battery LED dots on the front, a small yellow lightning bolt icon in the center, a short loose cable tucked at its side, chibi flat vector game asset, single object, centered, front view, thick rounded dark-brown outline (uniform weight), flat color fill, two-tone shading only (one light + one shadow tone), high saturation candy colors, simple cute face with two small dot eyes, no gradient, no texture, no material reflection, no cast shadow, clean bold silhouette that stays readable when scaled down to 48 pixels, isolated on pure magenta background (#FF00FF), full body fully inside frame with 10% padding, no cropping, no text, no watermark, no logo, no border, no frame, no UI elements, no ground plane, 512x512 square
```

### 图 3：吸管戳击 `straw_thrust`

> 几何硬约束：水平朝右、根部贴左缘、尖端贴右缘、垂直居中（锚点 (0,0.5)，接入宽=range 90）。
> **不画脸**——它是攻击部件不是角色，靠配色与珍珠元素和站立图认亲。

```
a cute thick bubble tea straw drawn as a straight horizontal tube pointing to the RIGHT, root end exactly at the left edge of the canvas, angled cut tip exactly at the right edge, cream beige body #EBCDA0 with a milk-tea brown band near the tip, one small tapioca pearl visible inside, tube thickness about 18 percent of its length, no hand, no character holding it, chibi flat vector game asset, single object, thick rounded dark-brown outline (uniform weight), flat color fill, two-tone shading only, high saturation candy colors, no face, no gradient, no texture, no cast shadow, clean bold silhouette, isolated on pure magenta background (#FF00FF), the tube spans the full width of the frame touching left and right edges, vertically centered, no cropping of the tube itself, no text, no watermark, 512x512 square
```

### 图 4：充电宝供电态 `powerbank_powered`（基于图 2 图生图编辑）

> **不要重新文生图**——用图 2 做图生图/局部编辑，保持姿态剪影完全一致，只加电元素。
> 重新生成会导致供电前后"换了个人"，运行时切换穿帮。

```
edit this image: keep the exact same chubby orange power bank character, same pose, same proportions, same outline style. Changes: the four battery LED dots now glow bright green, the yellow lightning bolt icon glows brightly with a small halo, 2 to 3 small electric spark arcs in yellow #FFEB50 and cyan #78DCFF crackle around the body edges, body color slightly brighter and more saturated. Everything else unchanged, pure magenta background (#FF00FF) unchanged
```

### 图 5：吸管被供电态 `straw_powered`（基于图 1 图生图编辑）

```
edit this image: keep the exact same bubble tea straw character, same pose, same proportions, same outline style. Changes: the tapioca pearl inside now glows warm orange, the angled tip glows yellow #FFEB50, 2 to 3 thin electric arc lines in cyan #78DCFF wrap around the tube body, a faint warm glow at the base. Everything else unchanged, pure magenta background (#FF00FF) unchanged
```

### 图 6：电流圈 `core_power_ring`（叠加层，独立文生图）

> 叠加在被供电吸管身上的特效层（替换程序圈），运行时由 `updateAuras` 控制显隐。
> 中心只留品红底、不画任何内容——抠图时中心随背景一起去掉，形成镂空。

```
a circular electric energy ring game effect, viewed top-down, perfectly centered, radially symmetric, ring made of crackling electric arcs alternating yellow #FFEB50 and cyan #78DCFF, 4 short lightning zigzag segments evenly spaced along the circle, ring thickness about 8 percent of the circle diameter, completely EMPTY center showing only the magenta background, no object inside, no character, no face, chibi flat vector style matching a cute casual game, thick rounded dark outline on the arcs, flat color fill, no gradient, no glow bleed beyond the ring, isolated on pure magenta background (#FF00FF), ring outer diameter about 90 percent of the frame, no text, no watermark, 512x512 square
```

---

## 生成顺序与一致性

1. **图 1 → 图 2**：同一风格块连出，能固定 seed 就固定
2. **图 4 / 图 5**：由图 2 / 图 1 图生图编辑（姿态一致性的唯一可靠手段）
3. **图 3、图 6**：独立文生图（无姿态继承需求）

## 抠图（品红底方案）

```bash
pip3 install "rembg[cli]"
# 批量
rembg p -m birefnet-general ./raw ./cut
# 单张 + 边缘精修
rembg i -a -ae 10 raw/straw_idle.png cut/straw_idle.png
```

- 图 4/5 的辉光电弧若被 rembg 误削，改用 ImageMagick 四角 floodfill（保护主体周围的浅色辉光）：

```bash
magick in.png -alpha set -fuzz 10% -fill none \
  -draw "alpha 0,0 floodfill" -draw "alpha %[fx:w-1],0 floodfill" \
  -draw "alpha 0,%[fx:h-1] floodfill" -draw "alpha %[fx:w-1],%[fx:h-1] floodfill" \
  out.png
```

- 图 6 抠完**检查中心是否镂空**：rembg 一般会把中心品红一并去掉；若残留品红块，对中心补一次 floodfill。

## 裁切规则（手动裁图的不变量）

接入代码 `attachSprite` 是"宽度撑满目标值、高度按原图宽高比自适应"，**裁成长方形可以正常工作**，但必须满足：

| 图 | 不变量 |
|---|---|
| `straw_thrust` | 根部顶左缘、尖端顶右缘、管体垂直居中（歪了攻击时偏上/偏下） |
| `straw_idle` / `powerbank_idle` | 角色水平居中，左右透明边距大致对称 |
| 普通态 ↔ 供电态（1↔5、2↔4） | **必须共用同一裁切框**——运行时整图替换，框不同会跳位跳大小。补救：以普通态为准给供电态补透明边，不要重裁普通态 |
| `core_power_ring` | 必须保持**正方形**且圆环居中，否则 76×76 接入后变椭圆/偏心。裁歪了补回正方形：`magick core_power_ring.png -background none -gravity center -extent 512x512 fixed.png` |

- 渲染尺寸换算：游戏内尺寸 = 目标宽 × (图高/图宽)。例：戳击图裁成 512×100，宽接入 90 → 厚度 17.6px（设计意图 16）。偏差在 `VISUAL_SKINS` 调 `scale`，不用返工裁图。
- Cocos 导入 spriteFrame 默认自动 trim 透明边，手动裁切与引擎同向，省贴图内存。

## 导出尺寸（控显存，重要）

豆包实际可能出 **2048×2048**（忽略 prompt 里的 512 指令，或选了高清档）。**源图与游戏资产要分两层**：

- **母版**：保留高清（2048）当作源，存 `raw/` 或本地，不进包。后续做卡牌图标、图鉴特写、分享图、改图重生成都以此为底。
- **导入游戏的资产**：放入 `assets/resources/art/` 前，统一导出一份 **~512 方图**（裁成长方形则按裁后宽高比对应缩放，如 512×100 → 宽 512、高 100）。
  - 512 是显示宽 56px 的 ~9 倍，2x/3x 屏都清晰；显存从 2048 的 ~16MB/张 降到 ~1MB/张，6 张不再威胁低配安卓内存。
  - 不要压成 56×56：retina 屏会糊、且丢失复用价值。文件像素对布局零影响，显示尺寸由 `attachSprite` 的 `targetWidth` 决定。
- 不要手改文件 DPI：DPI 只影响打印，屏幕只看像素数，2048@72dpi 就是 2048×2048。

## 验收清单（抠图后、导入前，在深色底上 2 倍放大）

- [ ] 在看图工具里把图**缩放到 56px 预览**：吸管和充电宝 3 米外能分清（这是**预览检查显示效果，非要求改文件尺寸**）
- [ ] 图 4 vs 2、图 5 vs 1 并排：姿态零变化，只有电元素差异
- [ ] 图 3：根部/尖端精确顶到左右缘（差几个像素会导致戳击时根部悬空）
- [ ] 图 6：中心真空镂空，套在吸管站立图上不遮脸；画布正方形、圆环居中
- [ ] 抠图边缘无品红残留紫边、无白边（叠深色棋盘背景检查）
- [ ] 6 张并排：描边粗细、饱和度像一套

## 代码接入对照（图到位后改这些）

```typescript
// VisualSkins.ts —— VISUAL_SKINS 注册
bubble_tea_straw_thrust: { kind: 'sprite', asset: 'art/attacks/straw_thrust' },
'fx.core_power':          { kind: 'sprite', asset: 'art/fx/core_power_ring' },
```

还需三处 sprite 分支（攻击视觉同款回退逻辑，缓存未命中回退 Graphics 占位）：

1. `SceneInitializer.createTower` —— 站立图（`straw_idle` / `powerbank_idle`），加 `towerSkin` 概念
2. `VisualFactory.createCorePowerRing` —— 电流圈换贴图
3. `updateAuras` —— `corePowered` 变化时整图替换 spriteFrame（普通态 ↔ 供电态）

---

## 卡牌图标（UI，风格继承）

肉鸽卡牌的卡面图标，风格与上方角色图**完全一致**（chibi flat vector、粗圆深棕描边、平涂双色、糖果色、点眼睛）；技术块同样走 **品红底 `#FF00FF` + 512×512 + 10% padding**，抠图后当透明 spriteFrame 放进卡牌 icon 位。负面词沿用上方「负面 Prompt」全局共用。

| 文件 | 内容 | icon id | 接入规格 |
|---|---|---|---|
| `art/cards/core_power.png` | 核心供电（充电宝→吸管输电） | `mod_cp` | 卡牌 icon 位，宽由卡片 UI 定（建议 ~96~120 设计像素），透明 spriteFrame 居中 |
| `art/cards/double_straw.png` | 双管吸管（两根并排） | `mod_ds` | 同上 |
| `art/cards/overload_double_tap.png` | 过载双击（供电吸管 + 黄青电环 + 双暴击火花） | `odt` | 同上 |

### 图 7：核心供电 `core_power`（mod_cp）

> 概念：充电宝（左）给奶茶吸管（右）输电——亮绿 LED 充电宝 + 黄青闪电连线 + 吸管身上电流圈。配色锁死：充电宝 `#FFB43C`、吸管 `#EBCDA0`、供电特效 `#FFEB50`/`#78DCFF`。

```
a small chubby power bank character on the LEFT (rounded rectangle orange body #FFB43C, four glowing green battery LED dots, a yellow lightning bolt icon in the center) sending a crackling electric bolt to a cute bubble tea straw character on the RIGHT (cream beige body #EBCDA0 with one tapioca pearl inside, small dot eyes), a glowing lightning arc in yellow #FFEB50 and cyan #78DCFF connecting them, the straw wears a small electric energy ring (yellow #FFEB50 and cyan #78DCFF arcs) around its body, chibi flat vector game asset icon, two objects, centered, front view, thick rounded dark-brown outline (uniform weight), flat color fill, two-tone shading only (one light + one shadow tone), high saturation candy colors, clean bold silhouette that stays readable when scaled down to 64 pixels, isolated on pure magenta background (#FF00FF), both objects fully inside frame with 10% padding, no overlap, no cropping, no text, no watermark, 512x512 square
```

### 图 8：双管吸管 `double_straw`（mod_ds）

> 概念：两根奶茶吸管并排成"双管"。配色锁死 `#EBCDA0`。两根可略大小/倾斜差异做出"孪生对"感，但必须并排不重叠。

```
two cute thick bubble tea straw characters standing side by side as a twin pair, both cream beige body #EBCDA0, one visible brown tapioca pearl inside each tube, small round dot eyes on upper body, slightly different size and tilt to read as a pair, chibi flat vector game asset icon, two objects, centered, front view, thick rounded dark-brown outline (uniform weight), flat color fill, two-tone shading only (one light + one shadow tone), high saturation candy colors, clean bold silhouette that stays readable when scaled down to 64 pixels, isolated on pure magenta background (#FF00FF), pair centered with 10% padding, no overlap, no cropping, no text, no watermark, 512x512 square
```

### 图 9：过载双击 `overload_double_tap`（odt）

> 概念：被核心供电的吸管 + 黄青电环 + 两次暴击火花（用**视觉星爆**表示"双击暴击"，**禁止出现文字/数字**，负面词已含 text）。电环须正方形居中（同图 6 规则）。

```
a cute bubble tea straw character (cream beige body #EBCDA0, one tapioca pearl inside glowing warm orange, small dot eyes) wearing a glowing electric energy ring (yellow #FFEB50 and cyan #78DCFF arcs) around its body, TWO small star-burst spark flashes in yellow #FFEB50 near its angled tip indicating a double critical hit, no text, no numbers, chibi flat vector game asset icon, single object centered, front view, thick rounded dark-brown outline (uniform weight), flat color fill, two-tone shading only (one light + one shadow tone), high saturation candy colors, clean bold silhouette that stays readable when scaled down to 64 pixels, isolated on pure magenta background (#FF00FF), object fully inside frame with 10% padding, no cropping, no watermark, 512x512 square
```

### 卡牌图标裁切与接入不变量

- 统一**正方形裁切、主体居中**，便于卡片 UI 等比显示；电流圈/电环中心留品红，抠图后随背景去掉形成镂空（同图 6）。
- 核心供电：两对象水平并列、间距均匀、不重叠。
- 过载双击：电环同图 6 须正方形居中；双火花纯视觉星爆，不得出现任何文字或数字。
- 抠图同角色图管线（`rembg p -m birefnet-general`），辉光误削用 ImageMagick 四角 floodfill 补救。

动效零件补充：电流圈拆层与闪电线段
图 6 是单张快速接入版。如果要做更灵活的运行时动效，建议额外生成以下零件：程序负责旋转、闪烁、缩放、拉伸和抖动，美术只提供清晰可读的电元素素材。

文件	内容	接入方式
art/fx/core_power_ring_base.png	电流圈基础环	慢速旋转
art/fx/core_power_ring_spark.png	零散电火花	反向旋转/闪烁
art/fx/core_power_ring_glow.png	柔光外圈	呼吸缩放，可选
art/fx/core_power_bolt_segment.png	横向闪电线段	拉伸/旋转连接充电宝和吸管


图 6a：电流圈基础环 core_power_ring_base
```
a clean circular electric energy ring base, viewed top-down, perfectly centered and radially balanced, made of 3 to 4 smooth broken arc segments alternating cyan #78DCFF and yellow #FFEB50, ring thickness about 7 percent of circle diameter, completely EMPTY center showing only pure magenta background, no object inside, no character, chibi flat vector game effect asset, thick rounded dark-brown outline on each electric arc, flat color fill, no gradient, no soft glow, no texture, no drop shadow, isolated on pure magenta background (#FF00FF), ring outer diameter about 88 percent of frame, no text, no watermark, no border, 512x512 square
```

图 6b：电流圈火花 core_power_ring_spark
```
small scattered electric sparks arranged around an invisible circle, viewed top-down, 6 to 8 short zigzag spark marks in cyan #78DCFF and yellow #FFEB50, sparks evenly distributed near the outer ring area, completely EMPTY center showing only pure magenta background, no complete circle, no object inside, no character, chibi flat vector game effect asset, thick rounded dark-brown outline on each spark, flat color fill, no gradient, no soft glow, no texture, no drop shadow, isolated on pure magenta background (#FF00FF), all sparks inside frame with 12 percent padding, no text, no watermark, no border, 512x512 square
```

图 6c：电流圈柔光 core_power_ring_glow
这张可选。豆包如果老是画成一整块发光圆盘，可以先跳过，程序继续画透明呼吸圈。
```
a simple soft-looking circular aura ring for an electric power effect, viewed top-down, perfectly centered, pale cyan #78DCFF outer aura with warm yellow #FFEB50 small highlights, very simple flat vector glow shape, completely EMPTY center showing only pure magenta background, no object inside, no character, no hard full disk, no filled center, no background scenery, no texture, no shadow, isolated on pure magenta background (#FF00FF), ring outer diameter about 92 percent of frame, no text, no watermark, no border, 512x512 square
```

图 6d：闪电线段 core_power_bolt_segment
重点：不要画“完整充电宝连到吸管”的固定图。只画横向线段，程序按距离拉伸、旋转、抖动。
```
a horizontal electric lightning bolt segment pointing from LEFT to RIGHT, designed as a reusable game VFX line segment, bright cyan #78DCFF outer bolt with yellow #FFEB50 highlights and a thin white hot core, jagged zigzag shape with 5 to 7 bends, starts near the left edge and ends near the right edge, vertically centered, chibi flat vector game effect asset, thick rounded dark-brown outline around the bolt, flat color fill, no gradient, no texture, no drop shadow, no characters, no power bank, no straw, isolated on pure magenta background (#FF00FF), bolt spans about 90 percent of canvas width with 5 percent horizontal padding, no text, no watermark, no border, 512x128 horizontal canvas
```
再补两条验收规则：
core_power_ring_* 必须正方形、居中、中心镂空。
core_power_bolt_segment 必须保持横向长条，不要裁成正方形；缩到 8px 高仍能看出闪电折线。