import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { DataSource, SearchResult } from "./source.js";

/**
 * 本地语料库源：检索 corpus/ 目录下的 .md/.txt 文件（全文关键词匹配）。
 * 用途：用户手动投放的资料（保存的网页/文章/访谈记录），零成本离线可用，
 * 也是没有网络时侦察阶段的兜底。
 */
export function createCorpusSource(dir = "corpus"): DataSource {
  let cache: Map<string, string> | null = null;

  async function loadFiles(): Promise<Map<string, string>> {
    if (cache) return cache;
    cache = new Map();
    const files = await findTextFiles(dir);
    for (const f of files) {
      try {
        cache.set(f, await readFile(f, "utf8"));
      } catch {
        // 单个文件读失败跳过
      }
    }
    return cache;
  }

  return {
    name: "corpus",
    async search(query, opts) {
      const files = await loadFiles();
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const results: SearchResult[] = [];
      for (const [file, content] of files) {
        const lower = content.toLowerCase();
        if (terms.every((t) => lower.includes(t))) {
          results.push({
            title: path.basename(file),
            url: file,
            snippet: snippetAround(content, terms[0]),
          });
        }
      }
      return results.slice(0, opts?.limit ?? 10);
    },
  };
}

/** 取首个命中词所在行的上下文片段 */
function snippetAround(content: string, term: string, radius = 80): string {
  const idx = content.toLowerCase().indexOf(term);
  if (idx < 0) return content.slice(0, 160);
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + radius * 2);
  return (start > 0 ? "…" : "") + content.slice(start, end).replace(/\s+/g, " ").trim() + (end < content.length ? "…" : "");
}

/** 递归收集目录下 .md/.txt 文件 */
async function findTextFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // 目录不存在
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findTextFiles(full, depth + 1)));
    else if (/\.(md|txt)$/i.test(e.name)) out.push(full);
  }
  return out;
}
