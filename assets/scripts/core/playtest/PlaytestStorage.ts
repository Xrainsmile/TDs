export interface StoredPlaytestArtifact {
    runId: string;
    endedAt: string;
    result: string;
    json: string;
    markdown: string;
}

export interface PlaytestExportResult {
    platform: 'wechat' | 'web' | 'memory';
    message: string;
}

const STORAGE_KEY = 'td.playtest.sessions.v1';
const MAX_STORED_RUNS = 20;
let memoryArtifacts: StoredPlaytestArtifact[] = [];

function runtime(): Record<string, any> {
    return globalThis as unknown as Record<string, any>;
}

function readArtifacts(): StoredPlaytestArtifact[] {
    const root = runtime();
    try {
        if (root.wx?.getStorageSync) {
            return root.wx.getStorageSync(STORAGE_KEY) || [];
        }
        if (root.localStorage) {
            const raw = root.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        }
    } catch (error) {
        console.warn('[PlaytestStorage] 读取本地记录失败，改用内存保存', error);
    }
    return memoryArtifacts;
}

function writeArtifacts(artifacts: StoredPlaytestArtifact[]): void {
    const root = runtime();
    memoryArtifacts = artifacts;
    try {
        if (root.wx?.setStorageSync) {
            root.wx.setStorageSync(STORAGE_KEY, artifacts);
            return;
        }
        if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(artifacts));
    } catch (error) {
        console.warn('[PlaytestStorage] 写入本地记录失败，当前记录仍保留在内存', error);
    }
}

export function savePlaytestArtifact(artifact: StoredPlaytestArtifact): void {
    const previous = readArtifacts().filter(item => item.runId !== artifact.runId);
    writeArtifacts([artifact, ...previous].slice(0, MAX_STORED_RUNS));
}

/** 作废指定 runId 的终局记录（复活场景：撤销已落库的 defeat，避免与后续 victory 并存） */
export function discardPlaytestArtifact(runId: string): void {
    const remaining = readArtifacts().filter(item => item.runId !== runId);
    writeArtifacts(remaining);
}

export function listPlaytestArtifacts(): StoredPlaytestArtifact[] {
    return readArtifacts();
}

function downloadText(filename: string, content: string, mime: string): void {
    const root = runtime();
    if (!root.document || !root.Blob || !root.URL) return;
    const blob = new root.Blob([content], { type: mime });
    const url = root.URL.createObjectURL(blob);
    const anchor = root.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    root.document.body.appendChild(anchor);
    anchor.click();
    root.document.body.removeChild(anchor);
    root.URL.revokeObjectURL(url);
}

/** Web 下载 Markdown 与 JSON；微信小游戏复制 Markdown，JSON/Markdown 均已保存在本地存储。 */
export function exportPlaytestArtifact(artifact: StoredPlaytestArtifact): PlaytestExportResult {
    savePlaytestArtifact(artifact);
    const root = runtime();
    if (root.wx?.setClipboardData) {
        root.wx.setClipboardData({
            data: artifact.markdown,
            success: () => root.wx?.showToast?.({ title: '记录已复制', icon: 'success' }),
        });
        return { platform: 'wechat', message: 'Markdown 已复制；JSON 与 Markdown 已保存到小游戏本地存储' };
    }
    if (root.document) {
        const basename = `playtest-${artifact.runId}`;
        downloadText(`${basename}.md`, artifact.markdown, 'text/markdown;charset=utf-8');
        downloadText(`${basename}.json`, artifact.json, 'application/json;charset=utf-8');
        return { platform: 'web', message: 'Markdown 与 JSON 已下载' };
    }
    return { platform: 'memory', message: '当前平台不支持文件导出，记录已保存在内存' };
}
