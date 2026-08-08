import type { DataSource, SearchResult } from "./source.js";
import { normalizeUrl, stripTags } from "./source.js";
import { filterRelevant } from "./bing.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * 免费百度源：中文检索质量远好于必应国内版（后者 2026 年已降级为字典/百科结果）。
 * 风险：频繁请求可能弹安全验证——检测到验证页抛错，由调用方容错记录。
 * 解析独立成函数便于用固定样本单测。
 */
export function createBaiduSource(timeoutMs = 10000): DataSource {
  return {
    name: "baidu",
    async search(query, opts) {
      const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${opts?.limit ?? 10}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`baidu search failed: HTTP ${res.status}`);
      }
      const html = await res.text();
      if (/安全验证|百度安全/.test(html) && !/<h3/.test(html)) {
        throw new Error("baidu 触发安全验证页");
      }
      return filterRelevant(parseBaiduHtml(html), query).slice(0, opts?.limit ?? 10);
    },
  };
}

/** 解析百度搜索结果页：h3 标题块 + 块后文本摘要 */
export function parseBaiduHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const h3Re = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/g;
  for (const m of html.matchAll(h3Re)) {
    const [full, href, titleHtml] = m;
    const title = stripTags(titleHtml);
    if (!title) continue;
    const after = html.slice(m.index + full.length, m.index + full.length + 2500);
    const nextH3 = after.search(/<h3/);
    const block = nextH3 > 0 ? after.slice(0, nextH3) : after;
    results.push({ title, url: normalizeUrl(href), snippet: extractSnippet(block) });
  }
  return results;
}

/** 取结果块文本：去脚本/样式/标签后压缩空白，截前 160 字 */
function extractSnippet(block: string): string {
  const text = block
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? text.slice(0, 160) + "…" : text;
}
