import { createBilibiliSource } from "./bilibili.js";
import { createCorpusSource } from "./corpus.js";
import { createSo360Source } from "./so360.js";
import type { DataSource } from "./source.js";

/**
 * 默认源组合：本地语料库（离线兜底）+ B站视频搜索含评论区（wbi 直连，零依赖）+ 360 搜索（中文质量好）。
 * 免费源实测（2026-08）：必应国内版结果降级为字典页、百度弹安全验证、搜狗 antispider；
 * 升级付费源时在这里替换，流程代码不动。B站源直连免登录免浏览器，任何环境可用。
 */
export function createDefaultSources(): DataSource[] {
  return [createCorpusSource(), createBilibiliSource(), createSo360Source()];
}

export type { DataSource, SearchResult } from "./source.js";
