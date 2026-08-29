#!/usr/bin/env node
/**
 * TDs UI 布局几何自检工具
 *
 * 用途：在不启动游戏、不看截图的前提下，静态校验程序化创建的 UI 卡片内部元素
 *      是否发生「越界」或「重叠」，以及文字行数是否够放。
 *
 * 背景：手牌卡与 buff 卡都是纯代码绘制（Graphics + Label），没有 .prefab 可视化编辑，
 *      改一个 y 坐标很容易让相邻元素叠在一起，只能靠肉眼看截图才发现。本脚本把
 *      这类几何约束变成可执行的断言。
 *
 * 关键设计：不做"纯硬编码基线"，而是用正则从源码里**提取实际值**再校验。
 *      这样如果有人改了 SceneInitializer.ts 里的坐标，脚本会读到新值并重新判定，
 *      不会因为基线写死而给出过期的"通过"。基线仅用于提示"这里变过"。
 *
 * 用法：
 *      node tools/check-layout.js            # 全量校验
 *      node tools/check-layout.js --json     # 输出 JSON，便于 CI 或脚本消费
 *      node tools/check-layout.js --watch    # 监听源码变化自动重跑
 *
 * 退出码：0 = 全部通过；1 = 存在 ERROR 级问题；2 = 源码读取/解析失败
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SRC = path.join(ROOT, 'assets', 'scripts', 'core', 'SceneInitializer.ts');

/** 相邻元素允许的最小间隙（px）。小于此值判定为重叠。
 *  取 0.5 是为了容忍浮点误差；真正的贴合设计通常是 1~3px。 */
const MIN_GAP = 0.5;

/** 允许的容差：浮点与取整 */
const EPS = 0.01;

// ─────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────

/** 从源码区间内提取第一个匹配项的数值 */
function pick(src, re, groupIndex = 1) {
    const m = src.match(re);
    if (!m || m[groupIndex] === undefined) return null;
    const v = parseFloat(m[groupIndex]);
    return Number.isFinite(v) ? v : null;
}

/** 提取从 startIdx 起到下一个方法声明为止的源码，避免跨方法误读参数 */
function sliceUntilNextMethod(src, startIdx, maxLen = 6000) {
    const rest = src.slice(startIdx, startIdx + maxLen);
    // 匹配下一个 `    private xxx(` / `    public xxx(` 等方法声明（4 空格缩进）
    const m = rest.match(/\n    (?:private|public|protected)\s+\w+\s*[<(]/);
    return m ? rest.slice(0, m.index) : rest;
}

/** 提取某个节点创建块（从 `const x = new Node('Name')` 起的一段连续源码）
 *  窗口取 2200 字符，并以下一个 `new Node(` 为终止边界：
 *  手牌卡的 Kind 节点位于 Desc 之后约 1500 字符处，原先的 1400 会把它截断；
 *  但不能无限扩大，否则会把后续节点（如 Unusable）的参数误读进来。 */
function extractBlock(src, nodeName) {
    const anchor = `new Node('${nodeName}')`;
    const idx = src.indexOf(anchor);
    if (idx === -1) return null;
    // 终止边界：下一个同层节点的创建处，避免把后续节点（如 Unusable）的参数误读进来
    const nextIdx = src.indexOf('new Node(', idx + anchor.length);
    const end = nextIdx === -1 ? idx + 2200 : Math.min(nextIdx, idx + 2200);
    return src.slice(idx, end);
}

/** 区间对象 */
function span(y, h) {
    return { top: y + h / 2, bottom: y - h / 2, y, h };
}

/**
 * 判断两个元素在水平方向是否有交叠。
 * 背景：buff 卡的图标位于卡片左侧（x=-57），与名称/描述不在同一列，
 *      垂直方向本就该重叠，不能按"上下相邻"规则判定。
 * 做法：给元素带上 x 与 w（缺省视为居中通栏），先做 x 轴相交测试，
 *      只有水平投影有交叠时才检查垂直重叠。
 */
function horizontalOverlap(a, b) {
    // 优先用显式列标记：column 不同的元素视为左右并排，直接判定为不同列。
    // 背景：buff 卡的图标在左列（x=-57），名称/描述是通栏文本。
    //      名称宽度在运行时会因有无图标在 112/150 之间变化，且会右移让位，
    //      单靠 x 投影算不准（通栏文本必然与左列图标相交），故以设计意图为准。
    if (a.column && b.column && a.column !== b.column) return false;

    const ax = a.x ?? 0;
    const bx = b.x ?? 0;
    // 缺省宽度：图标用自身尺寸，文本类用父卡宽度（通栏）
    const aw = a.w ?? a.h ?? 0;
    const bw = b.w ?? b.h ?? 0;
    const aL = ax - aw / 2, aR = ax + aw / 2;
    const bL = bx - bw / 2, bR = bx + bw / 2;
    return aL < bR - EPS && bL < aR - EPS;
}

/** 两个元素是否在水平方向位于不同列（用于提示"并列布局，跳过垂直重叠检查"） */
function isSideBySide(a, b) {
    return !horizontalOverlap(a, b);
}

// ─────────────────────────────────────────────────────────────
// 布局规格：从源码提取
// ─────────────────────────────────────────────────────────────

function readHandCard(src) {
    // 定位 buildHandCardSlot 函数体
    const fnIdx = src.indexOf('private buildHandCardSlot');
    if (fnIdx === -1) return null;
    // 窗口 4200：Kind 节点位于函数内约 2905 字符处，3000 会把它截断。
    // 终止边界取下一个方法声明，避免把后续函数的参数误读进来。
    const body = sliceUntilNextMethod(src, fnIdx);

    const cardW = pick(body, /transform\.setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 1);
    const cardH = pick(body, /transform\.setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 2);
    const iconSize = pick(body, /createCardIcon\(node,\s*(\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/, 1);
    const iconY = pick(body, /createCardIcon\(node,\s*(\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/, 3);

    const nameBlock = extractBlock(body, 'Name');
    const nameW = nameBlock ? pick(nameBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 1) : null;
    const nameH = nameBlock ? pick(nameBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 2) : null;
    const nameY = nameBlock ? pick(nameBlock, /setPosition\(0,\s*(-?\d+(?:\.\d+)?),\s*0\)/, 1) : null;
    const nameFont = nameBlock ? pick(nameBlock, /fontSize = (\d+(?:\.\d+)?)/, 1) : null;
    const nameLine = nameBlock ? pick(nameBlock, /lineHeight = (\d+(?:\.\d+)?)/, 1) : null;

    const descBlock = extractBlock(body, 'Desc');
    const descW = descBlock ? pick(descBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 1) : null;
    const descH = descBlock ? pick(descBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 2) : null;
    const descY = descBlock ? pick(descBlock, /setPosition\(0,\s*(-?\d+(?:\.\d+)?),\s*0\)/, 1) : null;
    const descFont = descBlock ? pick(descBlock, /fontSize = (\d+(?:\.\d+)?)/, 1) : null;
    const descLine = descBlock ? pick(descBlock, /lineHeight = (\d+(?:\.\d+)?)/, 1) : null;

    const kindBlock = extractBlock(body, 'Kind');
    const kindY = kindBlock ? pick(kindBlock, /setPosition\(0,\s*(-?\d+(?:\.\d+)?),\s*0\)/, 1) : null;
    const kindFont = kindBlock ? pick(kindBlock, /fontSize = (\d+(?:\.\d+)?)/, 1) : null;
    // 类型标签（"塔/战术/改造/工具"）未显式设置 contentSize，高度按字号 * 1.3 估算。
    // 注意：这是估算值，仅用于越界/重叠的粗略校验，不作为精确断言。
    const kindH = kindFont ? kindFont * 1.3 : null;
    const kindEstimated = kindFont != null && !/setContentSize/.test(kindBlock || '');

    return {
        id: 'hand-card',
        label: '手牌卡 HandCard',
        card: { w: cardW, h: cardH },
        elements: [
            // 高度按字号估算（源码未显式 setContentSize），标注 estimated 供报告提示
            { name: '类型标签 Kind', y: kindY, h: kindH, estimated: kindEstimated, column: 'text' },
            { name: '图标 Icon', y: iconY, h: iconSize, x: 0, w: iconSize, column: 'text' },
            { name: '名称 Name', y: nameY, h: nameH, w: nameW, column: 'text' },
            { name: '描述 Desc', y: descY, h: descH, w: descW, lineHeight: descLine, fontSize: descFont, column: 'text' },
        ],
        expectRows: 4,
        nameWidth: nameW,
    };
}

function readBuffCard(src) {
    const fnIdx = src.indexOf('private createBuffCard');
    if (fnIdx === -1) return null;
    const body = sliceUntilNextMethod(src, fnIdx);

    const cardW = pick(body, /transform\.setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 1);
    const cardH = pick(body, /transform\.setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 2);
    const iconSize = pick(body, /createCardIcon\(node,\s*(\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/, 1);
    const iconX = pick(body, /createCardIcon\(node,\s*(\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/, 2);
    const iconY = pick(body, /createCardIcon\(node,\s*(\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/, 3);

    const nameBlock = extractBlock(body, 'BuffName');
    const nameW = nameBlock ? pick(nameBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 1) : null;
    const nameH = nameBlock ? pick(nameBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 2) : null;
    const nameY = nameBlock ? pick(nameBlock, /setPosition\(0,\s*(-?\d+(?:\.\d+)?),\s*0\)/, 1) : null;

    const descBlock = extractBlock(body, 'BuffDesc');
    const descW = descBlock ? pick(descBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 1) : null;
    const descH = descBlock ? pick(descBlock, /setContentSize\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/, 2) : null;
    const descY = descBlock ? pick(descBlock, /setPosition\(0,\s*(-?\d+(?:\.\d+)?),\s*0\)/, 1) : null;
    const descLine = descBlock ? pick(descBlock, /lineHeight = (\d+(?:\.\d+)?)/, 1) : null;
    const descFont = descBlock ? pick(descBlock, /fontSize = (\d+(?:\.\d+)?)/, 1) : null;

    return {
        id: 'buff-card',
        label: '波次选卡 BuffCard',
        card: { w: cardW, h: cardH },
        elements: [
            // 图标在卡片左列（x=-57），与名称/描述不同列，垂直方向不参与重叠判定
            { name: '图标 Icon(左列)', y: iconY, h: iconSize, x: iconX, w: iconSize, column: 'left' },
            { name: '名称 BuffName', y: nameY, h: nameH, w: nameW ?? cardW, column: 'text' },
            { name: '描述 BuffDesc', y: descY, h: descH, w: descW, lineHeight: descLine, fontSize: descFont, column: 'text' },
        ],
        expectRows: 4,
    };
}

/** buff 卡三张竖排，间距写死在 cardPositions 里 */
function readBuffSpacing(src) {
    const m = src.match(/const cardPositions = \[new Vec3\(0,\s*(-?\d+),\s*0\),\s*new Vec3\(0,\s*(-?\d+),\s*0\),\s*new Vec3\(0,\s*(-?\d+),\s*0\)\]/);
    if (!m) return null;
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

// ─────────────────────────────────────────────────────────────
// 校验逻辑
// ─────────────────────────────────────────────────────────────

function checkCard(spec) {
    const issues = [];
    const { card, elements } = spec;

    if (!card || card.h == null || card.w == null) {
        return [{ level: 'ERROR', msg: `无法从源码解析 ${spec.label} 的卡片尺寸` }];
    }

    const top = card.h / 2;
    const bottom = -card.h / 2;

    // 1) 元素缺失检查
    const valid = elements.filter(e => e.y != null && e.h != null);
    const missing = elements.filter(e => e.y == null || e.h == null).map(e => e.name);
    if (missing.length) {
        issues.push({ level: 'WARN', msg: `以下元素坐标未能从源码解析，已跳过：${missing.join('、')}` });
    }

    // 2) 越界检查
    for (const e of valid) {
        const s = span(e.y, e.h);
        if (s.top > top + EPS) {
            issues.push({
                level: 'ERROR',
                msg: `${e.name} 顶边 ${s.top.toFixed(1)} 超出卡片顶边 ${top.toFixed(1)}（超出 ${(s.top - top).toFixed(1)}px）`,
            });
        }
        if (s.bottom < bottom - EPS) {
            issues.push({
                level: 'ERROR',
                msg: `${e.name} 底边 ${s.bottom.toFixed(1)} 低于卡片底边 ${bottom.toFixed(1)}（超出 ${(bottom - s.bottom).toFixed(1)}px）`,
            });
        }
    }

    // 3) 相邻重叠检查
    // 只对"同列"元素检查垂直重叠。左右并排的元素（如 buff 卡的左侧图标 vs
    // 通栏文本）垂直方向本就共存，不参与判定。
    //
    // 重要：必须以"配对"为单位跳过，不能把左列元素从排序里剔除。
    //      否则左列图标会把相邻的两个通栏文本（名称、描述）在排序中隔开，
    //      导致这对文本被跳过检查——这正是漏检的成因。
    const sorted = [...valid].sort((a, b) => b.y - a.y);
    let skippedPairs = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        // 逐个检查相邻配对；若配对中任一元素属于不同列，则跳过该配对
        for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i];
            const b = sorted[j];
            if (isSideBySide(a, b)) { skippedPairs++; continue; }
            const gap = (a.y - a.h / 2) - (b.y + b.h / 2);
            // 垂直方向已经分离（b 在 a 下方且不相交）则无需继续与更远的元素比较
            if (gap >= MIN_GAP) break;
            issues.push({
                level: 'ERROR',
                msg: `${a.name} 与 ${b.name} 重叠：间隙 ${gap.toFixed(1)}px（要求 ≥ ${MIN_GAP}px）`,
            });
        }
    }
    if (skippedPairs > 0) {
        issues.push({ level: 'INFO', msg: `${skippedPairs} 组元素为左右并排列，已跳过垂直重叠检查` });
    }

    // 4) 描述区行数检查
    const desc = valid.find(e => e.lineHeight != null);
    if (desc && spec.expectRows) {
        const rows = Math.floor((desc.h + EPS) / desc.lineHeight);
        if (rows < spec.expectRows) {
            issues.push({
                level: 'ERROR',
                msg: `描述区高度 ${desc.h}px / 行高 ${desc.lineHeight} = ${rows} 行，不足要求的 ${spec.expectRows} 行`,
            });
        }
    }

    return issues;
}

/** buff 三卡竖排互不碰撞 */
function checkBuffStack(src, cardH) {
    const pos = readBuffSpacing(src);
    if (!pos || cardH == null) return [];
    const issues = [];
    for (let i = 0; i < pos.length - 1; i++) {
        const aBottom = pos[i] - cardH / 2;
        const bTop = pos[i + 1] + cardH / 2;
        const gap = aBottom - bTop;
        if (gap < MIN_GAP) {
            issues.push({
                level: 'ERROR',
                msg: `buff 卡 ${i + 1} 与卡 ${i + 2} 碰撞：间距 ${(pos[i] - pos[i + 1])}px < 卡高 ${cardH}px（间隙 ${gap.toFixed(1)}px）`,
            });
        }
    }
    return issues;
}

// ─────────────────────────────────────────────────────────────
// 报告
// ─────────────────────────────────────────────────────────────

const C = {
    red: s => `\x1b[31m${s}\x1b[0m`,
    yellow: s => `\x1b[33m${s}\x1b[0m`,
    green: s => `\x1b[32m${s}\x1b[0m`,
    gray: s => `\x1b[90m${s}\x1b[0m`,
    bold: s => `\x1b[1m${s}\x1b[0m`,
};

function printSpec(spec) {
    const { card, elements } = spec;
    console.log(C.bold(`\n▌${spec.label}`));
    if (card && card.h != null) {
        const top = card.h / 2, bottom = -card.h / 2;
        console.log(`  卡片 ${card.w}×${card.h}，y 区间 [${bottom.toFixed(1)}, ${top.toFixed(1)}]`);
        for (const e of elements) {
            if (e.y == null || e.h == null) continue;
            const s = span(e.y, e.h);
            const oob = s.top > top + EPS || s.bottom < bottom - EPS;
            const mark = oob ? C.red(' ⚠越界') : '';
            console.log(`    ${e.name.padEnd(16)} y=${String(e.y).padStart(6)} 高${String(e.h).padStart(4)}  [${s.bottom.toFixed(1).padStart(6)}, ${s.top.toFixed(1).padStart(5)}]${mark}`);
        }
        // 相邻间隙
        const valid = elements.filter(e => e.y != null && e.h != null).sort((a, b) => b.y - a.y);
        // 与校验逻辑保持一致：以"配对"为单位判断，避免左列元素把通栏文本隔开造成漏显示
        let skipped = 0;
        for (let i = 0; i < valid.length - 1; i++) {
            for (let j = i + 1; j < valid.length; j++) {
                const a = valid[i], b = valid[j];
                const gap = (a.y - a.h / 2) - (b.y + b.h / 2);
                if (isSideBySide(a, b)) {
                    skipped++;
                    console.log(`    ${C.gray(`间隙 ${a.name} → ${b.name}: 左右并排，跳过垂直检查`)}`);
                    continue;
                }
                const mark = gap < MIN_GAP ? C.red(` ⚠重叠`) : C.green(' ✓');
                console.log(`    ${C.gray(`间隙 ${a.name} → ${b.name}: ${gap.toFixed(1)}px`)}${mark}`);
                if (gap >= MIN_GAP) break;
            }
        }
        if (skipped > 0) {
            console.log(`    ${C.gray(`（${skipped} 组为左右并排列，不参与垂直重叠判定）`)}`);
        }
        const desc = elements.find(e => e.lineHeight != null);
        if (desc) {
            console.log(`    ${C.gray(`描述区 ${desc.h}px ÷ 行高 ${desc.lineHeight} = ${Math.floor(desc.h / desc.lineHeight)} 行`)}`);
        }
    }
}

function main() {
    const args = process.argv.slice(2);
    const asJson = args.includes('--json');
    const watch = args.includes('--watch');
    // --quiet：只输出结论行，供 pre-commit 使用（避免刷屏）
    const quiet = args.includes('--quiet');
    // --src <path>：校验指定文件，供 pre-commit 校验"暂存区版本"使用。
    // 注意不可与 --watch 同时用（监听的是默认路径）。
    const srcIdx = args.indexOf('--src');
    const SRC = srcIdx !== -1 && args[srcIdx + 1] ? path.resolve(args[srcIdx + 1]) : DEFAULT_SRC;

    if (!fs.existsSync(SRC)) {
        console.error(`找不到源码文件：${SRC}`);
        process.exit(2);
    }

    function run() {
        const src = fs.readFileSync(SRC, 'utf8');
        const specs = [readHandCard(src), readBuffCard(src)].filter(Boolean);
        const allIssues = [];

        for (const spec of specs) {
            const issues = checkCard(spec);
            allIssues.push(...issues.map(i => ({ card: spec.label, ...i })));
        }

        const buffSpec = specs.find(s => s.id === 'buff-card');
        if (buffSpec) {
            const stackIssues = checkBuffStack(src, buffSpec.card.h);
            allIssues.push(...stackIssues.map(i => ({ card: buffSpec.label, ...i })));
        }

        const errors = allIssues.filter(i => i.level === 'ERROR');
        const warns = allIssues.filter(i => i.level === 'WARN');
        const infos = allIssues.filter(i => i.level === 'INFO');

        if (asJson) {
            console.log(JSON.stringify({
                ok: errors.length === 0,
                cards: specs.map(s => ({
                    id: s.id, label: s.label, card: s.card, elements: s.elements,
                })),
                errors, warns,
            }, null, 2));
        } else if (quiet) {
            // --quiet：成功不输出（pre-commit 里由 hook 自己打印"通过"），
            // 失败才输出错误明细，避免正常提交时刷屏几何数据。
            if (errors.length) {
                for (const e of errors) console.error(`   [ERROR] ${e.card}：${e.msg}`);
            }
        } else {
            console.log(C.bold('\n════════ TDs UI 布局几何自检 ════════'));
            console.log(C.gray(`源码：${path.relative(ROOT, SRC)}`));
            if (!quiet) {
                for (const spec of specs) printSpec(spec);
                console.log('');
            }
            if (allIssues.length === 0) {
                console.log(C.green('✅ 全部通过：无越界、无重叠、行数充足'));
            } else {
                if (errors.length) {
                    console.log(C.red(C.bold(`❌ 发现 ${errors.length} 个问题：`)));
                    for (const e of errors) console.log(C.red(`   [ERROR] ${e.card}：${e.msg}`));
                }
                if (warns.length) {
                    console.log(C.yellow(C.bold(`⚠️  ${warns.length} 条提醒：`)));
                    for (const w of warns) console.log(C.yellow(`   [WARN ] ${w.card}：${w.msg}`));
                }
                if (infos.length) {
                    for (const i of infos) console.log(C.gray(`   [INFO ] ${i.card}：${i.msg}`));
                }
            }
            // 估算高度的提示单独列出，避免与真实问题混淆
            if (!asJson) {
                const est = specs.flatMap(s => (s.elements || [])
                    .filter(e => e.estimated)
                    .map(e => `${s.label} 的「${e.name}」高度按字号估算（${e.h?.toFixed(1)}px）`));
                if (est.length) {
                    for (const e of est) console.log(C.gray(`   [INFO ] ${e}，源码未显式 setContentSize，仅作粗略校验`));
                }
            }
            console.log('');
        }

        return errors.length === 0 ? 0 : 1;
    }

    if (watch) {
        console.log(C.gray(`监听中：${path.relative(ROOT, SRC)}（Ctrl+C 退出）`));
        run();
        let timer = null;
        fs.watch(SRC, () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                console.clear();
                run();
            }, 150);
        });
        return;
    }

    const code = run();
    process.exit(code);
}

main();
