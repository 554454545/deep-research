import { createCorpusSource } from "./corpus.js";
import { createSo360Source } from "./so360.js";
import type { DataSource } from "./source.js";

/**
 * 默认源组合：本地语料库（离线兜底）+ 360 搜索（联网侦察，实测中文质量最好且无反爬）。
 * 免费源实测（2026-08）：必应国内版结果降级为字典页、百度弹安全验证、搜狗 antispider；
 * 升级付费源时在这里替换，流程代码不动。
 */
export function createDefaultSources(): DataSource[] {
  return [createCorpusSource(), createSo360Source()];
}

export type { DataSource, SearchResult } from "./source.js";
