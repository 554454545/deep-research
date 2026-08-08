import type { DataSource, SearchResult } from "./source.js";
import { normalizeUrl, stripTags } from "./source.js";
import { filterRelevant } from "./bing.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * 免费 360 搜索源（so.com）：中文分词好、无反爬验证页（实测 2026-08），
 * 返回真实内容（知乎帖/新闻/调查报告）。备选：百度（反爬严格）、必应国内版（结果降级）。
 */
export function createSo360Source(timeoutMs = 10000): DataSource {
  return {
    name: "so360",
    async search(query, opts) {
      const url = `https://www.so.com/s?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`so360 search failed: HTTP ${res.status}`);
      }
      const html = await res.text();
      return filterRelevant(parseSo360Html(html), query).slice(0, opts?.limit ?? 10);
    },
  };
}

/** 解析 360 搜索结果页（<li class="res-list"> 块） */
export function parseSo360Html(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<li class="res-list"[\s\S]*?<\/li>/g;
  for (const m of html.matchAll(blockRe)) {
    const block = m[0];
    const titleM = block.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/);
    if (!titleM) continue;
    const title = stripTags(titleM[2]);
    if (!title) continue;
    const snippetM = block.match(/class="res-list-summary"[^>]*>([\s\S]*?)<\/span>/);
    const snippet = snippetM
      ? stripTags(snippetM[1])
      : extractFallbackText(block);
    results.push({ title, url: normalizeUrl(titleM[1]), snippet });
  }
  return results;
}

/** 兜底摘要：结果块内去标签后的文本 */
function extractFallbackText(block: string): string {
  const text = block
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? text.slice(0, 160) + "…" : text;
}
