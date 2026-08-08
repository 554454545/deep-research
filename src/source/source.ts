/** 一条搜索结果（标题/链接/摘要） */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** 最多返回条数 */
  limit?: number;
}

/**
 * 数据源抽象：研究侦察阶段的信息来源。
 * 实现可插拔：免费必应抓取（默认）、本地语料库、未来付费 API——
 * 升级付费源只新增实现并在 createDefaultSources 里切换，流程代码不动。
 */
export interface DataSource {
  readonly name: string;
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

/** 去 HTML 标签 + 解码常见实体 */
export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** 补全协议相对链接 */
export function normalizeUrl(href: string): string {
  if (href.startsWith("//")) return "https:" + href;
  return href;
}
