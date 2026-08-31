#!/usr/bin/env node
/**
 * 生成 P2 基线测试的控制台命令：自动取 git commit，免手工拼 URL。
 *
 * 用法：
 *   node tools/playtest-launch.js
 *   node tools/playtest-launch.js --version 0.4.0 --group B --strategy 强追流派
 */
const { execSync } = require('child_process');

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function gitCommit() {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

const version = arg('version', '0.3.0');
const group = arg('group', 'A');
const strategy = arg('strategy', '认真构筑');
const commit = gitCommit();

// 4 流派 × 2 种子 × 2 局 = 16 局
const RUNS = [
    ['奶茶供电流', [1001, 1001, 1002, 1002]],
    ['弹射毒爆流', [2001, 2001, 2002, 2002]],
    ['控制爆破流', [3001, 3001, 3002, 3002]],
    ['串线剪断流', [4001, 4001, 4002, 4002]],
];

const out = [];
out.push('============ 基线测试 · 控制台命令（自动生成）============');
out.push(`commit: ${commit}    版本: ${version}    测试组: ${group}    策略: ${strategy}`);
out.push('');
out.push('【第 1 步】浏览器控制台粘贴一次（持久化到 localStorage，刷新后仍有效）：');
out.push('');
out.push(
    `__TD_BASELINE__.setMeta({balanceVersion:'${version}', buildCommit:'${commit}', ` +
    `playStrategy:'${strategy}', reviveEnabled:false, testGroup:'${group}'})`,
);
out.push('');
out.push('【第 2 步】每局开始前粘贴一行（自动以该种子重开本局，无需刷新页面）：');
out.push('');
let n = 0;
for (const [build, seeds] of RUNS) {
    for (const seed of seeds) {
        n += 1;
        out.push(`__TD_BASELINE__.run(${seed}, '${build}')   // 局${n}`);
    }
}
out.push('');
out.push('【自检】每局开头控制台应打印：[SeededRandom] 本局种子 XXX，发牌与战斗随机可复现');
out.push('【辅助】__TD_BASELINE__.info() 查看当前配置；__TD_BASELINE__.clear() 清除配置');
if (commit === 'unknown') {
    out.push('');
    out.push('⚠ 未能取到 git commit，请手动确认后替换 buildCommit');
}

console.log(out.join('\n'));
