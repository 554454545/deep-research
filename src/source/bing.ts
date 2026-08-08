import type { DataSource, SearchResult } from "./source.js";
import { normalizeUrl, stripTags } from "./source.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * 免费必应国内版抓取源：fetch 搜索结果页，解析 b_algo 结果块。
 * 无 key 零成本；代价是只拿标题+摘要（无正文）、可能被限流、页面结构升级可能失效。
 * 解析逻辑独立成函数便于用固定样本单测。
 */
export function createBingSource(timeoutMs = 10000): DataSource {
  return {
    name: "bing",
    async search(query, opts) {
      const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${opts?.limit ?? 10}&setlang=zh-hans`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`bing search failed: HTTP ${res.status}`);
      }
      const html = await res.text();
      return filterRelevant(parseBingHtml(html), query).slice(0, opts?.limit ?? 10);
    },
  };
}

/**
 * 相关性过滤：必应对长中文查询分词劣化（拆成单字返回字典/百科页），
 * 用"结果与查询的共有 2 字中文组合"判定，无任何共有组合的视为无关。
 */
export function filterRelevant(results: SearchResult[], query: string): SearchResult[] {
  const qBigrams = bigrams(query);
  if (qBigrams.size === 0) return results; // 无中文词（如纯英文查询）不过滤
  return results.filter((r) => {
    const rBigrams = bigrams(`${r.title} ${r.snippet.slice(0, 150)}`);
    return [...qBigrams].some((b) => rBigrams.has(b));
  });
}

/** 取字符串中全部相邻 2 字中文组合 */
function bigrams(s: string): Set<string> {
  const chars = Array.from(s);
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    const b = chars[i] + chars[i + 1];
    if (/^[\u4e00-\u9fff]/.test(b) && /[\u4e00-\u9fff]$/.test(b)) out.add(b);
  }
  return out;
}

/** 解析必应搜索结果页 HTML（<li class="b_algo"> 块） */
export function parseBingHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<li class="b_algo"[\s\S]*?<\/li>/g;
  for (const m of html.matchAll(blockRe)) {
    const block = m[0];
    const titleM = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/);
    if (!titleM) continue;
    const snippetM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const title = stripTags(titleM[2]);
    if (!title) continue;
    results.push({
      title,
      url: normalizeUrl(titleM[1]),
      snippet: snippetM ? stripTags(snippetM[1]) : "",
    });
  }
  return results;
}
