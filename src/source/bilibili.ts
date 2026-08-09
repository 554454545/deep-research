import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import type { DataSource, SearchResult } from "./source.js";

const execFileAsync = promisify(execFile);

/**
 * 解析 bili search --type video --json 的输出（纯函数，可单测）。
 * 输出结构：{ ok, data: [{ bvid, title, author, description, ... }] }
 */
export function parseBiliVideoSearch(stdout: string): SearchResult[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const data =
      parsed && typeof parsed === "object" && "data" in parsed
        ? (parsed as { data: unknown }).data
        : parsed;
    const items = Array.isArray(data) ? data : [];
    return items
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && !!v.bvid)
      .map((v) => ({
        title: String(v.title ?? "").replace(/<[^>]+>/g, "").trim(),
        url: `https://www.bilibili.com/video/${String(v.bvid)}`,
        snippet: String(v.description ?? "").slice(0, 200),
      }));
  } catch {
    return [];
  }
}

/** 定位 bili 命令路径：优先 agent-reach venv，其次系统 PATH */
export function findBiliPath(): string | null {
  const candidates = [path.join(os.homedir(), ".agent-reach-venv", "bin", "bili")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** 定位 opencli 命令路径（B站评论备用拉取通道，需 Chrome 扩展） */
export function findOpencliPath(): string | null {
  const candidates = [path.join(os.homedir(), ".npm-global", "bin", "opencli")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** B站 wbi 签名混淆表（公开算法，防爬签名） */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

/** 由 img_key+sub_key 生成 mixin key（纯函数，可单测） */
export function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((n) => orig[n] ?? "").join("").slice(0, 32);
}

/** 解析 B站评论 API 响应（纯函数，可单测）：{author, text}[] */
export function parseWbiReplies(payload: unknown, limit = 8): Array<{ author: string; text: string }> {
  const replies =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: { replies?: unknown } }).data?.replies;
  if (!Array.isArray(replies)) return [];
  return replies
    .filter(
      (r): r is Record<string, unknown> =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as { member?: { uname?: unknown } }).member?.uname === "string" &&
        typeof (r as { content?: { message?: unknown } }).content?.message === "string"
    )
    .slice(0, limit)
    .map((r) => ({
      author: (r.member as { uname: string }).uname,
      text: ((r.content as { message: string }).message as string).slice(0, 300),
    }));
}

/** 解析 B站搜索 API 响应（纯函数，可单测）：SearchResult[] */
export function parseWbiSearch(payload: unknown, limit = 5): SearchResult[] {
  const result =
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: { result?: unknown } }).data?.result;
  if (!Array.isArray(result)) return [];
  return result
    .filter(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && typeof v.bvid === "string"
    )
    .slice(0, limit)
    .map((v) => ({
      title: String(v.title ?? "").replace(/<[^>]+>/g, "").trim(),
      url: `https://www.bilibili.com/video/${String(v.bvid)}`,
      snippet: String(v.description ?? "").slice(0, 200),
    }));
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

/** wbi 签名辅助：nav 拿签名密钥（img_key+sub_key → mixin key） */
async function getWbiMixinKey(fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn("https://api.bilibili.com/x/web-interface/nav", {
    headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" },
  });
  if (!res.ok) throw new Error(`B站 nav 接口 ${res.status}`);
  const nav = (await res.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } };
  const wbiImg = nav.data?.wbi_img;
  const imgKey = (wbiImg?.img_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const subKey = (wbiImg?.sub_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  if (!imgKey || !subKey) throw new Error("B站 nav 未返回 wbi 密钥");
  return getMixinKey(imgKey + subKey);
}

/** wbi 签名辅助：参数排序 + wts + md5，生成带签名的完整 URL */
function signedUrl(base: string, params: Record<string, string | number>, mixinKey: string): string {
  const full: Record<string, string | number> = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(full)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(full[k]))}`)
    .join("&");
  const wRid = createHash("md5").update(query + mixinKey).digest("hex");
  return `${base}?${query}&w_rid=${wRid}`;
}

/** wbi 签名 GET（统一 UA/Referer） */
async function wbiGet(url: string, fetchFn: typeof fetch): Promise<Record<string, unknown>> {
  const res = await fetchFn(url, { headers: { "User-Agent": UA, Referer: "https://www.bilibili.com/" } });
  if (!res.ok) throw new Error(`B站接口 ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * wbi 签名直连 B站搜索 API（免登录、免浏览器，任何环境可用）。
 * 失败抛错（由调用方降级到 bili-cli 或无结果）。
 */
export async function fetchWbiSearch(
  keyword: string,
  limit = 5,
  fetchFn: typeof fetch = fetch
): Promise<SearchResult[]> {
  const mixinKey = await getWbiMixinKey(fetchFn);
  const url = signedUrl(
    "https://api.bilibili.com/x/web-interface/search/type",
    { search_type: "video", keyword, page: 1, page_size: 20 },
    mixinKey
  );
  const data = await wbiGet(url, fetchFn);
  return parseWbiSearch(data, limit);
}

/**
 * wbi 签名直连 B站评论 API（免登录、免浏览器，任何环境可用）：
 * nav 拿签名密钥 → view 拿 aid → reply 拉评论（公开算法，防爬签名）。
 * 失败抛错（由调用方降级到 opencli 或无评论）。
 */
export async function fetchWbiComments(
  bvid: string,
  limit = 8,
  fetchFn: typeof fetch = fetch
): Promise<Array<{ author: string; text: string }>> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
  const getJson = async (url: string): Promise<Record<string, unknown>> => {
    const res = await fetchFn(url, { headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/" } });
    if (!res.ok) throw new Error(`B站接口 ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };

  // 1. 签名密钥（img_key + sub_key）
  const nav = await getJson("https://api.bilibili.com/x/web-interface/nav");
  const wbiImg = (nav as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } }).data?.wbi_img;
  const imgKey = (wbiImg?.img_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const subKey = (wbiImg?.sub_url ?? "").split("/").pop()?.split(".")[0] ?? "";
  const mixinKey = getMixinKey(imgKey + subKey);

  // 2. BV → aid
  const view = await getJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  const aid = (view as { data?: { aid?: number } }).data?.aid;
  if (!aid) throw new Error("BV 转 aid 失败");

  // 3. 签名参数（key 排序 + wts + md5）
  const params: Record<string, string | number> = { type: 1, oid: aid, sort: 2, pn: 1, ps: 20, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join("&");
  const wRid = createHash("md5").update(query + mixinKey).digest("hex");

  // 4. 拉评论
  const data = await getJson(`https://api.bilibili.com/x/v2/reply?${query}&w_rid=${wRid}`);
  return parseWbiReplies(data, limit);
}

/** 解析 opencli bilibili comments -f json 输出，取前 N 条评论（纯函数，可单测） */
export function parseBiliComments(stdout: string, limit = 10): Array<{ author: string; text: string }> {
  try {
    const items = JSON.parse(stdout);
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (c): c is Record<string, unknown> =>
          typeof c === "object" && c !== null && typeof c.author === "string" && typeof c.text === "string"
      )
      .slice(0, limit)
      .map((c) => ({ author: c.author as string, text: (c.text as string).slice(0, 300) }));
  } catch {
    return [];
  }
}

/**
 * B站视频搜索源：wbi 签名直连 B站搜索 + 评论 API（免登录、免浏览器，任何环境零依赖可用）。
 * bili-cli / opencli 仅作降级通道：直连被风控时才启用；两者都不可用时静默降级为纯视频结果。
 */
export function createBilibiliSource(
  biliPath: string | null = findBiliPath(),
  opencliPath: string | null = findOpencliPath()
): DataSource {
  return {
    name: "bilibili",
    async search(query, opts) {
      // 1. wbi 直连搜索（零依赖主通道）
      let results: SearchResult[] = [];
      try {
        results = await fetchWbiSearch(query, opts?.limit ?? 5);
      } catch {
        // 2. 降级 bili-cli 搜索
        if (biliPath) {
          try {
            const { stdout } = await execFileAsync(
              biliPath,
              ["search", "--type", "video", "--json", "-n", String(opts?.limit ?? 5), query],
              { timeout: 20000 }
            );
            results = parseBiliVideoSearch(stdout);
          } catch {
            return [];
          }
        }
      }
      if (results.length === 0) return results;
      // 评论增强：对前 5 个视频拉评论区（用户真实声音）。优先 wbi 直连（免浏览器），失败降级 opencli，再失败无评论
      if (results.length > 0) {
        const withComments = await Promise.all(
          results.slice(0, 5).map(async (r) => {
            const bvid = r.url.split("/").pop() ?? "";
            let comments: Array<{ author: string; text: string }> = [];
            try {
              comments = await fetchWbiComments(bvid, 8);
            } catch {
              // wbi 被风控/失败时，降级 opencli（需 Chrome 扩展）
              if (opencliPath) {
                try {
                  const { stdout } = await execFileAsync(
                    opencliPath,
                    ["bilibili", "comments", bvid, "-f", "json"],
                    { timeout: 30000 }
                  );
                  comments = parseBiliComments(stdout, 8);
                } catch {
                  /* 无评论 */
                }
              }
            }
            if (comments.length === 0) return r;
            const commentText = comments.map((c) => `💬${c.author}：${c.text}`).join("\n");
            return { ...r, snippet: `${r.snippet}\n热门评论：\n${commentText}` };
          })
        );
        results = withComments;
      }
      return results;
    },
  };
}
