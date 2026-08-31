/**
 * utils/SeededRandom.ts — 全局种子随机数（mulberry32）
 *
 * 用途：试玩复现。种子由启动参数 seed=<非负整数> 注入，每局开局重置，
 * 使同一 seed 下抽卡、暴击、敌群变体等随机结果序列一致。
 *
 * 约定：
 * - 所有影响战斗 / 发牌的随机必须走本模块，禁止直接调用 Math.random()。
 * - PlaytestRecorder 的 runId 必须继续用 Math.random()，否则复现局 runId 冲突。
 * - 未设置种子时（缺省或 seed 非法）回退 Math.random()，行为与改动前一致。
 */

export class SeededRandom {
    private state = 0;
    private seedValue = 0;
    private hasSeed = false;

    /** 是否已注入有效种子 */
    get seeded(): boolean {
        return this.hasSeed;
    }

    /** 当前种子（未注入时为 null），用于遥测记录 */
    get seed(): number | null {
        return this.hasSeed ? this.seedValue : null;
    }

    /** 注入种子并重置序列。非有限数 / 负数视为无效，清空种子回退随机。 */
    setSeed(seed: number): void {
        if (!Number.isFinite(seed) || seed < 0) {
            this.clearSeed();
            return;
        }
        this.seedValue = Math.floor(seed) >>> 0;
        this.state = this.seedValue;
        this.hasSeed = true;
    }

    /** 清空种子，回退 Math.random() */
    clearSeed(): void {
        this.hasSeed = false;
        this.seedValue = 0;
        this.state = 0;
    }

    /** [0, 1) 随机数 */
    random(): number {
        if (!this.hasSeed) return Math.random();
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** [0, maxExclusive) 整数 */
    int(maxExclusive: number): number {
        return Math.floor(this.random() * maxExclusive);
    }

    /** 概率为 p 的布尔判定 */
    chance(p: number): boolean {
        return this.random() < p;
    }

    /** 从数组随机取一个元素 */
    pick<T>(arr: T[]): T {
        return arr[this.int(arr.length)];
    }

    /** 原地洗牌（Fisher-Yates） */
    shuffle<T>(arr: T[]): void {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.int(i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
}

/** 全局唯一实例：游戏内所有战斗 / 发牌随机统一走它 */
export const rng = new SeededRandom();
