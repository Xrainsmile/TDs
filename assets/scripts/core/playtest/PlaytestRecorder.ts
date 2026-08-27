import {
    exportPlaytestArtifact,
    listPlaytestArtifacts,
    PlaytestExportResult,
    savePlaytestArtifact,
    StoredPlaytestArtifact,
} from './PlaytestStorage';
import type { DamageAttribution } from '../RuntimeTypes';

export interface PlaytestTowerSnapshot {
    id: string;
    name: string;
    count: number;
    stars: number[];
}

export interface PlaytestSnapshot {
    gold: number;
    baseHp: number;
    towers: PlaytestTowerSnapshot[];
    buffIds: string[];
    modifiers: Record<string, Record<string, number>>;
}

interface TimedRecord {
    atMs: number;
    wave: number;
}

interface DrawRecord extends TimedRecord {
    index: number;
    cost: number;
    goldAfter: number;
    cards: { id: string; name: string; kind: string; towerId?: string }[];
    used: { id: string; name: string; kind: string; target: string; decisionSeconds: number }[];
}

interface BuffRecord extends TimedRecord {
    choices: { id: string; name: string; role: string }[];
    selectedId?: string;
    selectedName?: string;
    decisionSeconds?: number;
    estimatedHesitation?: number;
}

interface WaveRecord {
    wave: number;
    startedAtMs: number;
    durationSeconds: number;
    baseHpStart: number;
    baseHpEnd: number;
    goldStart: number;
    goldEnd: number;
    maxEnemyProgress: number;
    leaks: number;
    kills: number;
    towersEnd: PlaytestTowerSnapshot[];
}

interface MilestoneRecord extends TimedRecord {
    buildId: string;
    buildName: string;
    stage: 'direction' | 'basic' | 'transform';
}

interface BossRecord {
    spawnedAtMs: number;
    defeatedAtMs?: number;
    maxHp: number;
    result?: 'defeated' | 'escaped' | 'run_ended';
    checkpoints: { remainingRatio: number; atSeconds: number }[];
}

interface DamageSourceSummary extends DamageAttribution {
    damage: number;
    bossDamage: number;
    hits: number;
    kills: number;
    critHits: number;
    overloadHits: number;
    activeSeconds: number;
}

interface DamageMechanismSummary {
    id: string;
    name: string;
    triggers: number;
    triggerTargets: number;
    damageHits: number;
    activeSeconds: number;
    damage: number;
    bossDamage: number;
}

interface TowerActivitySummary {
    id: string;
    name: string;
    attacks: number;
    hits: number;
    damage: number;
    bossDamage: number;
    kills: number;
    activeSeconds: number;
}

interface WaveDamageSummary {
    wave: number;
    total: number;
    bossTotal: number;
    sources: Record<string, {
        sourceName: string;
        mechanismName: string;
        damage: number;
        bossDamage: number;
    }>;
}

export type PlaytestGroup = 'A' | 'B' | 'C';
export type PlayStrategy = '认真构筑' | '乱选' | '强追流派' | '自动试玩';

export interface PlaytestMetadata {
    balanceVersion: string;
    testGroup: PlaytestGroup;
    playStrategy: PlayStrategy;
    buildCommit: string;
}

interface PlaytestSession {
    schemaVersion: 4;
    runId: string;
    platform: string;
    startedAt: string;
    metadata: PlaytestMetadata;
    endedAt?: string;
    result?: 'victory' | 'defeat' | 'abandoned';
    finalWave?: number;
    runVariant?: { id: string; name: string };
    waves: WaveRecord[];
    draws: DrawRecord[];
    buffs: BuffRecord[];
    milestones: MilestoneRecord[];
    boss?: BossRecord;
    damage: {
        total: number;
        bossTotal: number;
        sources: Record<string, DamageSourceSummary>;
        mechanisms: Record<string, DamageMechanismSummary>;
        towers: Record<string, TowerActivitySummary>;
        waves: Record<string, WaveDamageSummary>;
    };
    finalSnapshot?: PlaytestSnapshot;
    events: { type: string; atMs: number; wave: number; data?: Record<string, unknown> }[];
    manualFeedback: {
        testMode: string;
        intendedBuild: string;
        validationQuestion: string;
        highlights: { event: string; type: string; funScore: string; reason: string }[];
        choiceMeaning: string;
        buildIdentity: string;
        growthExpectation: string;
        riskReward: string;
        failureReadability: string;
        replayDesire: string;
        immediateReplay: string;
        nextChange: string;
        notes: string;
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

function platformName(): string {
    const root = globalThis as unknown as Record<string, any>;
    if (root.wx) return 'wechat';
    if (root.document) return 'web';
    return 'unknown';
}

function hesitation(seconds: number): number {
    if (seconds < 2) return 0;
    if (seconds < 5) return 1;
    if (seconds < 10) return 2;
    return 3;
}

function towerText(towers: PlaytestTowerSnapshot[]): string {
    return towers.length === 0
        ? '无'
        : towers.map(t => `${t.name}x${t.count}（${t.stars.join('/') || '-'}星）`).join('、');
}

function roleText(role: string): string {
    if (role === 'role:survival') return '生存';
    if (role === 'role:build') return '成型';
    if (role === 'role:greed') return '成长';
    return '通用';
}

export class PlaytestRecorder {
    private session: PlaytestSession;
    private startedAtMs = Date.now();
    private activeWave: WaveRecord | null = null;
    private openDraw: DrawRecord | null = null;
    private openBuff: BuffRecord | null = null;
    private finalizedArtifact: StoredPlaytestArtifact | null = null;
    private milestoneKeys = new Set<string>();

    constructor() {
        this.session = this.createSession(this.defaultMetadata());
        this.installDebugBridge();
    }

    beginRun(metadata: Partial<PlaytestMetadata> = {}): void {
        if (!this.session.result && this.session.events.length > 1) {
            this.finalize('abandoned', this.session.finalWave ?? 0, this.session.finalSnapshot);
        }
        this.startedAtMs = Date.now();
        this.activeWave = null;
        this.openDraw = null;
        this.openBuff = null;
        this.finalizedArtifact = null;
        this.milestoneKeys.clear();
        this.session = this.createSession(this.normalizeMetadata(metadata));
        this.event('run_started', 0, { ...this.session.metadata });
        this.persistDraft();
        this.installDebugBridge();
    }

    startWave(wave: number, snapshot: PlaytestSnapshot): void {
        this.openDraw = null;
        this.activeWave = {
            wave,
            startedAtMs: this.elapsedMs(),
            durationSeconds: 0,
            baseHpStart: snapshot.baseHp,
            baseHpEnd: snapshot.baseHp,
            goldStart: snapshot.gold,
            goldEnd: snapshot.gold,
            maxEnemyProgress: 0,
            leaks: 0,
            kills: 0,
            towersEnd: snapshot.towers,
        };
        this.event('wave_started', wave, { gold: snapshot.gold, baseHp: snapshot.baseHp });
    }

    observeEnemyProgress(progress: number): void {
        if (!this.activeWave) return;
        this.activeWave.maxEnemyProgress = Math.max(this.activeWave.maxEnemyProgress, Math.max(0, Math.min(1, progress)));
    }

    recordKill(enemyType: string | number): void {
        if (this.activeWave) this.activeWave.kills++;
        this.event('enemy_killed', this.currentWave(), { enemyType });
    }

    recordLeak(enemyType: string | number, baseHp: number): void {
        if (this.activeWave) this.activeWave.leaks++;
        this.event('enemy_leaked', this.currentWave(), { enemyType, baseHp });
    }

    endWave(snapshot: PlaytestSnapshot): void {
        if (!this.activeWave) return;
        this.activeWave.durationSeconds = (this.elapsedMs() - this.activeWave.startedAtMs) / 1000;
        this.activeWave.baseHpEnd = snapshot.baseHp;
        this.activeWave.goldEnd = snapshot.gold;
        this.activeWave.towersEnd = snapshot.towers;
        this.session.waves.push(this.activeWave);
        this.session.finalWave = this.activeWave.wave;
        this.event('wave_ended', this.activeWave.wave, {
            maxEnemyProgress: this.activeWave.maxEnemyProgress,
            gold: snapshot.gold,
            baseHp: snapshot.baseHp,
        });
        this.activeWave = null;
        this.persistDraft();
    }

    offerBuff(wave: number, choices: { id: string; name: string; role: string }[]): void {
        this.openBuff = { atMs: this.elapsedMs(), wave, choices };
        this.session.buffs.push(this.openBuff);
        this.event('buff_offered', wave, { choices: choices.map(c => c.id) });
        this.persistDraft();
    }

    selectBuff(id: string, name: string): void {
        if (!this.openBuff) return;
        const seconds = (this.elapsedMs() - this.openBuff.atMs) / 1000;
        this.openBuff.selectedId = id;
        this.openBuff.selectedName = name;
        this.openBuff.decisionSeconds = seconds;
        this.openBuff.estimatedHesitation = hesitation(seconds);
        this.event('buff_selected', this.openBuff.wave, {
            id, decisionSeconds: seconds, estimatedHesitation: this.openBuff.estimatedHesitation,
        });
        this.openBuff = null;
        this.persistDraft();
    }

    recordDraw(
        wave: number,
        cost: number,
        goldAfter: number,
        cards: { id: string; name: string; kind: string; towerId?: string }[],
    ): void {
        this.openDraw = {
            atMs: this.elapsedMs(), wave, index: this.session.draws.length + 1,
            cost, goldAfter, cards, used: [],
        };
        this.session.draws.push(this.openDraw);
        this.event('cards_drawn', wave, { cost, goldAfter, cards: cards.map(c => c.id) });
        this.persistDraft();
    }

    recordCardUsed(card: { id: string; name: string; kind: string }, target: string): void {
        if (!this.openDraw) return;
        const seconds = (this.elapsedMs() - this.openDraw.atMs) / 1000;
        this.openDraw.used.push({ ...card, target, decisionSeconds: seconds });
        this.event('card_used', this.openDraw.wave, { id: card.id, target, decisionSeconds: seconds });
        this.persistDraft();
    }

    recordOperation(type: string, data: Record<string, unknown> = {}): void {
        this.event(`operation_${type}`, this.currentWave(), data);
        this.persistDraft();
    }

    recordRunVariant(id: string, name: string): void {
        this.session.runVariant = { id, name };
        this.event('run_variant', 0, { id, name });
    }

    recordTowerAttack(towerId: string, towerName: string): void {
        const tower = this.ensureTowerActivity(towerId, towerName);
        tower.attacks++;
    }

    recordMechanismTrigger(id: string, name: string, targetCount = 0): void {
        const mechanism = this.ensureMechanism(id, name);
        mechanism.triggers++;
        mechanism.triggerTargets += Math.max(0, targetCount);
    }

    recordDamage(
        source: DamageAttribution,
        effectiveDamage: number,
        isBoss: boolean,
        killed: boolean,
        bossHpRatioAfter?: number,
        activeSeconds = 0,
    ): void {
        if (!Number.isFinite(effectiveDamage) || effectiveDamage <= 0) return;
        const key = `${source.sourceType}:${source.sourceId}:${source.mechanismId}`;
        let summary = this.session.damage.sources[key];
        if (!summary) {
            summary = this.session.damage.sources[key] = {
                ...source,
                damage: 0,
                bossDamage: 0,
                hits: 0,
                kills: 0,
                critHits: 0,
                overloadHits: 0,
                activeSeconds: 0,
            };
        }
        summary.damage += effectiveDamage;
        if (activeSeconds > 0) summary.activeSeconds += activeSeconds;
        else summary.hits++;
        if (isBoss) summary.bossDamage += effectiveDamage;
        if (killed) summary.kills++;
        if (source.isCrit) summary.critHits++;
        if (source.isOverload) summary.overloadHits++;

        this.session.damage.total += effectiveDamage;
        if (isBoss) this.session.damage.bossTotal += effectiveDamage;
        const mechanism = this.ensureMechanism(source.mechanismId, source.mechanismName);
        mechanism.damage += effectiveDamage;
        if (activeSeconds > 0) mechanism.activeSeconds += activeSeconds;
        else mechanism.damageHits++;
        if (isBoss) mechanism.bossDamage += effectiveDamage;

        if (source.towerId) {
            const tower = this.ensureTowerActivity(source.towerId, source.towerName ?? source.sourceName);
            if (activeSeconds > 0) tower.activeSeconds += activeSeconds;
            else tower.hits++;
            tower.damage += effectiveDamage;
            if (isBoss) tower.bossDamage += effectiveDamage;
            if (killed) tower.kills++;
        }

        const waveKey = String(this.currentWave());
        const waveDamage = this.session.damage.waves[waveKey] ?? (this.session.damage.waves[waveKey] = {
            wave: this.currentWave(), total: 0, bossTotal: 0, sources: {},
        });
        waveDamage.total += effectiveDamage;
        if (isBoss) waveDamage.bossTotal += effectiveDamage;
        const waveSource = waveDamage.sources[key] ?? (waveDamage.sources[key] = {
            sourceName: source.sourceName,
            mechanismName: source.mechanismName,
            damage: 0,
            bossDamage: 0,
        });
        waveSource.damage += effectiveDamage;
        if (isBoss) waveSource.bossDamage += effectiveDamage;

        if (isBoss && this.session.boss && bossHpRatioAfter !== undefined) {
            for (const ratio of [0.75, 0.5, 0.25]) {
                if (bossHpRatioAfter > ratio) continue;
                if (this.session.boss.checkpoints.some(item => item.remainingRatio === ratio)) continue;
                this.session.boss.checkpoints.push({
                    remainingRatio: ratio,
                    atSeconds: (this.elapsedMs() - this.session.boss.spawnedAtMs) / 1000,
                });
            }
        }
    }

    closeDraw(): void {
        if (!this.openDraw) return;
        this.event('draw_closed', this.openDraw.wave, { usedCount: this.openDraw.used.length });
        this.openDraw = null;
    }

    recordMilestone(wave: number, buildId: string, buildName: string, stage: MilestoneRecord['stage']): void {
        const key = `${buildId}:${stage}`;
        if (this.milestoneKeys.has(key)) return;
        this.milestoneKeys.add(key);
        this.session.milestones.push({ atMs: this.elapsedMs(), wave, buildId, buildName, stage });
        this.event('build_milestone', wave, { buildId, stage });
        this.persistDraft();
    }

    bossSpawned(maxHp: number): void {
        if (this.session.boss) return;
        this.session.boss = { spawnedAtMs: this.elapsedMs(), maxHp, checkpoints: [] };
        this.event('boss_spawned', this.currentWave(), { maxHp });
    }

    bossDefeated(): void {
        if (!this.session.boss) return;
        this.session.boss.defeatedAtMs = this.elapsedMs();
        this.session.boss.result = 'defeated';
        this.event('boss_defeated', this.currentWave(), {
            durationSeconds: (this.session.boss.defeatedAtMs - this.session.boss.spawnedAtMs) / 1000,
        });
    }

    bossEscaped(): void {
        if (this.session.boss) this.session.boss.result = 'escaped';
        this.event('boss_escaped', this.currentWave());
    }

    finalize(result: 'victory' | 'defeat' | 'abandoned', finalWave: number, snapshot?: PlaytestSnapshot): StoredPlaytestArtifact {
        if (this.finalizedArtifact) return this.finalizedArtifact;
        this.closeDraw();
        this.session.result = result;
        this.session.endedAt = nowIso();
        this.session.finalWave = finalWave;
        this.session.finalSnapshot = snapshot;
        if (this.session.boss && !this.session.boss.result) this.session.boss.result = 'run_ended';
        this.event('run_ended', finalWave, { result });
        const json = JSON.stringify(this.session, null, 2);
        const markdown = this.toMarkdown();
        this.finalizedArtifact = {
            runId: this.session.runId,
            endedAt: this.session.endedAt,
            result,
            json,
            markdown,
        };
        savePlaytestArtifact(this.finalizedArtifact);
        this.installDebugBridge();
        console.log(`[Playtest] ${result}，记录已保存: ${this.session.runId}`);
        return this.finalizedArtifact;
    }

    exportLatest(): PlaytestExportResult {
        if (!this.finalizedArtifact) {
            return { platform: platformName() === 'wechat' ? 'wechat' : 'memory', message: '本局尚未结束，暂无结算报告' };
        }
        return exportPlaytestArtifact(this.finalizedArtifact);
    }

    private defaultMetadata(): PlaytestMetadata {
        return {
            balanceVersion: 'unversioned',
            testGroup: 'A',
            playStrategy: '认真构筑',
            buildCommit: 'unknown',
        };
    }

    private normalizeMetadata(metadata: Partial<PlaytestMetadata>): PlaytestMetadata {
        const defaults = this.defaultMetadata();
        const balanceVersion = metadata.balanceVersion?.trim() ?? '';
        const buildCommit = metadata.buildCommit?.trim() ?? '';
        const testGroup = metadata.testGroup;
        const playStrategy = metadata.playStrategy;
        const validGroup = testGroup === 'A' || testGroup === 'B' || testGroup === 'C';
        const validStrategy = playStrategy === '认真构筑' || playStrategy === '乱选' || playStrategy === '强追流派' || playStrategy === '自动试玩';
        const validCommit = /^[0-9a-f]{7,40}$/i.test(buildCommit);

        if (!balanceVersion) {
            console.warn('[PlaytestMetadata] 缺少 balanceVersion，已使用 unversioned / Missing balanceVersion; using unversioned.');
        }
        if (!validGroup) {
            console.warn('[PlaytestMetadata] testGroup 必须是 A、B 或 C，已使用 A / testGroup must be A, B, or C; using A.');
        }
        if (!validStrategy) {
            console.warn('[PlaytestMetadata] playStrategy 非法，已使用“认真构筑” / Invalid playStrategy; using default.');
        }
        if (!validCommit) {
            console.warn('[PlaytestMetadata] buildCommit 应为 7-40 位 Git 哈希，已使用 unknown / buildCommit should be a 7-40 character Git hash; using unknown.');
        }

        return {
            balanceVersion: balanceVersion || defaults.balanceVersion,
            testGroup: testGroup === 'A' || testGroup === 'B' || testGroup === 'C' ? testGroup : defaults.testGroup,
            playStrategy: playStrategy === '认真构筑' || playStrategy === '乱选' || playStrategy === '强追流派' || playStrategy === '自动试玩'
                ? playStrategy
                : defaults.playStrategy,
            buildCommit: validCommit ? buildCommit : defaults.buildCommit,
        };
    }

    private createSession(metadata: PlaytestMetadata): PlaytestSession {
        const stamp = Date.now();
        return {
            schemaVersion: 4,
            runId: `${stamp}-${(`0000${Math.floor(Math.random() * 10000)}`).slice(-4)}`,
            platform: platformName(),
            startedAt: nowIso(),
            metadata,
            waves: [], draws: [], buffs: [], milestones: [], events: [],
            damage: { total: 0, bossTotal: 0, sources: {}, mechanisms: {}, towers: {}, waves: {} },
            manualFeedback: {
                testMode: '', intendedBuild: '', validationQuestion: '', highlights: [],
                choiceMeaning: '', buildIdentity: '', growthExpectation: '', riskReward: '',
                failureReadability: '', replayDesire: '', immediateReplay: '', nextChange: '', notes: '',
            },
        };
    }

    private elapsedMs(): number {
        return Date.now() - this.startedAtMs;
    }

    private currentWave(): number {
        return this.activeWave?.wave ?? this.session.finalWave ?? 0;
    }

    private ensureMechanism(id: string, name: string): DamageMechanismSummary {
        return this.session.damage.mechanisms[id] ?? (this.session.damage.mechanisms[id] = {
            id, name, triggers: 0, triggerTargets: 0, damageHits: 0, activeSeconds: 0, damage: 0, bossDamage: 0,
        });
    }

    private ensureTowerActivity(id: string, name: string): TowerActivitySummary {
        return this.session.damage.towers[id] ?? (this.session.damage.towers[id] = {
            id, name, attacks: 0, hits: 0, damage: 0, bossDamage: 0, kills: 0, activeSeconds: 0,
        });
    }

    private event(type: string, wave = this.currentWave(), data?: Record<string, unknown>): void {
        this.session.events.push({ type, atMs: this.elapsedMs(), wave, data });
    }

    private persistDraft(): void {
        const json = JSON.stringify(this.session, null, 2);
        savePlaytestArtifact({
            runId: this.session.runId,
            endedAt: this.session.endedAt ?? '',
            result: this.session.result ?? 'in_progress',
            json,
            markdown: this.toMarkdown(),
        });
    }

    private installDebugBridge(): void {
        const root = globalThis as unknown as Record<string, any>;
        root.__TD_PLAYTEST__ = {
            latest: () => this.finalizedArtifact ?? listPlaytestArtifacts()[0] ?? null,
            list: () => listPlaytestArtifacts(),
            exportLatest: () => this.exportLatest(),
        };
    }

    private toMarkdown(): string {
        const s = this.session;
        const selectedBuffs = s.buffs.filter(b => b.selectedId);
        const avgDecision = selectedBuffs.length
            ? selectedBuffs.reduce((sum, b) => sum + (b.decisionSeconds ?? 0), 0) / selectedBuffs.length
            : 0;
        const avgHesitation = selectedBuffs.length
            ? selectedBuffs.reduce((sum, b) => sum + (b.estimatedHesitation ?? 0), 0) / selectedBuffs.length
            : 0;
        const zeroHesitation = selectedBuffs.filter(b => b.estimatedHesitation === 0).length;
        const bossDuration = s.boss?.defeatedAtMs
            ? (s.boss.defeatedAtMs - s.boss.spawnedAtMs) / 1000
            : null;
        const lines: string[] = [
            '# Demo 自动试玩记录', '',
            `- 局 ID：${s.runId}`,
            `- 平台：${s.platform}`,
            `- 敌群变体：${s.runVariant?.name ?? '标准纵队'}`,
            `- 开始时间：${s.startedAt}`,
            `- 平衡版本：${s.metadata.balanceVersion}`,
            `- 测试组：${s.metadata.testGroup}`,
            `- 游玩策略：${s.metadata.playStrategy}`,
            `- Git Commit：${s.metadata.buildCommit}`,
            `- 结果：${s.result ?? '进行中'}`,
            `- 最终波次：${s.finalWave ?? '-'}`,
            `- 总抽牌次数：${s.draws.length}`,
            `- 波后强化平均决策时间：${avgDecision.toFixed(2)} 秒`,
            `- 估算平均纠结度：${avgHesitation.toFixed(2)}`,
            `- 估算纠结度为 0 的次数：${zeroHesitation}`,
            `- BOSS 战斗时长：${bossDuration === null ? '-' : `${bossDuration.toFixed(2)} 秒`}`,
            `- 关键操作数：${s.events.filter(event => event.type.startsWith('operation_') || event.type === 'card_used').length}`,
            '',
            '> 决策时间只能估算纠结度；走神、阅读和误触需要在人工反馈中修正。', '',
            '## 构筑里程碑', '',
        ];

        if (s.milestones.length === 0) lines.push('- 未自动识别');
        for (const item of s.milestones) {
            const stage = item.stage === 'direction' ? '出现方向' : item.stage === 'basic' ? '基础成立' : '完成质变';
            lines.push(`- 第${item.wave}波：${item.buildName} ${stage}`);
        }

        lines.push('', '## 每波事实记录', '');
        const openingDraws = s.draws.filter(draw => draw.wave === 0);
        if (openingDraws.length) {
            lines.push('### 开局布防', '');
            for (const draw of openingDraws) {
                lines.push(
                    `- 抽牌 #${draw.index}（花费${draw.cost}，抽后金币${draw.goldAfter}）：${draw.cards.map(c => c.name).join(' / ')}`,
                    `- 使用：${draw.used.length ? draw.used.map(u => `${u.name} -> ${u.target}`).join('；') : '无'}`,
                );
            }
            lines.push('');
        }
        for (const wave of s.waves) {
            lines.push(
                `### 波次 ${wave.wave}`, '',
                `- 时长：${wave.durationSeconds.toFixed(2)} 秒`,
                `- 敌人最远推进：${Math.round(wave.maxEnemyProgress * 100)}%`,
                `- 基地生命：${wave.baseHpStart} -> ${wave.baseHpEnd}`,
                `- 金币：${wave.goldStart} -> ${wave.goldEnd}`,
                `- 击杀 / 漏怪：${wave.kills} / ${wave.leaks}`,
                `- 波末阵容：${towerText(wave.towersEnd)}`,
                `- 人工补充压力（1-5）：`,
                `- 人工补充期待与感受：`, '',
            );
            const buff = s.buffs.find(b => b.wave === wave.wave);
            if (buff) {
                lines.push(
                    `- 三选一：${buff.choices.map(c => `${c.name}［${roleText(c.role)}］`).join(' / ')}`,
                    `- 最终选择：${buff.selectedName ?? '未选择'}`,
                    `- 决策时间 / 估算纠结度：${(buff.decisionSeconds ?? 0).toFixed(2)} 秒 / ${buff.estimatedHesitation ?? '-'}`,
                    `- 人工修正纠结度（0-3）：`,
                    `- 人工补充选择理由：生存 / 成型 / 成长 / 转型 / 通用 / 其他：`, '',
                );
            }
            const draws = s.draws.filter(d => d.wave === wave.wave);
            for (const draw of draws) {
                lines.push(
                    `- 抽牌 #${draw.index}（花费${draw.cost}，抽后金币${draw.goldAfter}）：${draw.cards.map(c => c.name).join(' / ')}`,
                    `- 使用：${draw.used.length ? draw.used.map(u => `${u.name} -> ${u.target}`).join('；') : '无'}`,
                );
            }
            if (draws.length) lines.push('');
        }

        const totalCombatSeconds = s.waves.reduce((sum, wave) => sum + wave.durationSeconds, 0);
        const damageSources: DamageSourceSummary[] = Object.keys(s.damage.sources)
            .map(key => s.damage.sources[key])
            .sort((a, b) => b.damage - a.damage);
        const towerActivity: TowerActivitySummary[] = Object.keys(s.damage.towers)
            .map(key => s.damage.towers[key])
            .sort((a, b) => b.damage - a.damage);
        const mechanisms: DamageMechanismSummary[] = Object.keys(s.damage.mechanisms)
            .map(key => s.damage.mechanisms[key])
            .filter(item => item.damage > 0 || item.triggers > 0)
            .sort((a, b) => b.damage - a.damage);
        const damagePercent = (amount: number, total: number) => total > 0 ? `${(amount / total * 100).toFixed(1)}%` : '-';

        lines.push(
            '## 伤害归因', '',
            `- 有效总伤害：${s.damage.total.toFixed(1)}`,
            `- BOSS 有效伤害：${s.damage.bossTotal.toFixed(1)}`,
            `- 战斗波次总时长：${totalCombatSeconds.toFixed(2)} 秒`, '',
            '| 来源 | 机制 | 有效伤害 | 占比 | BOSS伤害 | 命中/持续 | 击杀 | 暴击/过载 |',
            '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
        );
        if (damageSources.length === 0) {
            lines.push('| 暂无 | - | 0 | - | 0 | 0 | 0 | 0/0 |');
        } else {
            for (const source of damageSources) {
                const activity = source.activeSeconds > 0 ? `${source.activeSeconds.toFixed(1)}目标秒` : String(source.hits);
                lines.push(`| ${source.sourceName} | ${source.mechanismName} | ${source.damage.toFixed(1)} | ${damagePercent(source.damage, s.damage.total)} | ${source.bossDamage.toFixed(1)} | ${activity} | ${source.kills} | ${source.critHits}/${source.overloadHits} |`);
            }
        }

        lines.push('', '### 塔效率', '',
            '| 塔 | 攻击次数 | 直接命中/目标秒 | 有效伤害 | 每次攻击伤害 | BOSS伤害 | 击杀 |',
            '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
        if (towerActivity.length === 0) {
            lines.push('| 暂无 | 0 | 0 | 0 | 0 | 0 | 0 |');
        } else {
            for (const tower of towerActivity) {
                const perAttack = tower.attacks > 0 ? tower.damage / tower.attacks : 0;
                const activity = tower.activeSeconds > 0 ? `${tower.hits}/${tower.activeSeconds.toFixed(1)}目标秒` : String(tower.hits);
                lines.push(`| ${tower.name} | ${tower.attacks} | ${activity} | ${tower.damage.toFixed(1)} | ${perAttack.toFixed(1)} | ${tower.bossDamage.toFixed(1)} | ${tower.kills} |`);
            }
        }

        lines.push('', '### 机制统计', '',
            '| 机制 | 触发次数 | 触发覆盖目标 | 命中/持续 | 有效伤害 | BOSS伤害 |',
            '| --- | ---: | ---: | ---: | ---: | ---: |');
        if (mechanisms.length === 0) {
            lines.push('| 暂无 | 0 | 0 | 0 | 0 | 0 |');
        } else {
            for (const mechanism of mechanisms) {
                const activity = mechanism.activeSeconds > 0 ? `${mechanism.activeSeconds.toFixed(1)}目标秒` : String(mechanism.damageHits);
                lines.push(`| ${mechanism.name} | ${mechanism.triggers || '-'} | ${mechanism.triggerTargets || '-'} | ${activity} | ${mechanism.damage.toFixed(1)} | ${mechanism.bossDamage.toFixed(1)} |`);
            }
        }

        const waveDamage = Object.keys(s.damage.waves)
            .map(key => s.damage.waves[key])
            .sort((a, b) => a.wave - b.wave);
        lines.push('', '### 每波伤害来源', '',
            '| 波次 | 有效伤害 | BOSS伤害 | 主要来源 |',
            '| ---: | ---: | ---: | --- |');
        for (const wave of waveDamage) {
            const topSources = Object.keys(wave.sources)
                .map(key => wave.sources[key])
                .sort((a, b) => b.damage - a.damage)
                .slice(0, 3)
                .map(source => `${source.sourceName}/${source.mechanismName} ${source.damage.toFixed(0)}`)
                .join('；');
            lines.push(`| ${wave.wave} | ${wave.total.toFixed(1)} | ${wave.bossTotal.toFixed(1)} | ${topSources || '-'} |`);
        }

        const bossSources = damageSources.filter(source => source.bossDamage > 0).sort((a, b) => b.bossDamage - a.bossDamage);
        lines.push('', '### BOSS 伤害来源', '');
        if (bossSources.length === 0) {
            lines.push('- 暂无 BOSS 伤害记录');
        } else {
            for (const source of bossSources) {
                lines.push(`- ${source.sourceName} / ${source.mechanismName}：${source.bossDamage.toFixed(1)}（${damagePercent(source.bossDamage, s.damage.bossTotal)}）`);
            }
        }
        if (s.boss?.checkpoints.length) {
            lines.push(`- 血线时间：${s.boss.checkpoints
                .sort((a, b) => b.remainingRatio - a.remainingRatio)
                .map(item => `${Math.round(item.remainingRatio * 100)}% @ ${item.atSeconds.toFixed(2)}秒`)
                .join('；')}`);
        }
        lines.push('');

        const final = s.finalSnapshot;
        lines.push(
            '## 局末事实', '',
            `- 最终金币：${final?.gold ?? '-'}`,
            `- 最终基地生命：${final?.baseHp ?? '-'}`,
            `- 最终阵容：${final ? towerText(final.towers) : '-'}`,
            `- 已选强化：${final?.buffIds.join('、') || '无'}`,
            '',
            '## 人工爽点补充', '',
            '```text',
            '发生波次：',
            '爽点类型：获取爽 / 成型爽 / 战斗爽 / 逆转爽',
            '发生了什么：',
            '我是否理解触发原因：',
            '画面与战斗结果：',
            '爽度（0-10）：',
            '持续兴趣（1-5）：',
            '为什么：',
            '```', '',
            '## 局末人工评分', '',
            '| 指标 | 评分（1-5） | 说明 |',
            '| --- | --- | --- |',
            '| 选择意义 |  |  |',
            '| 构筑身份 |  |  |',
            '| 成长期待 |  |  |',
            '| 风险回报 |  |  |',
            '| 失败归因 |  |  |',
            '| 再开意愿 |  |  |',
            '',
            '- 好玩度总分：',
            '- 是否想立即再开一局：',
            '- 下一局最想改变什么：',
            '- 其他备注：',
        );
        return lines.join('\n');
    }
}
