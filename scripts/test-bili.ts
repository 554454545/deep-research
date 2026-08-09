/**
 * B站数据源快速测试：搜索 + 评论增强链路验证（不跑完整研究）。
 * 结果落盘 data/bilibili/<关键词>-<时间戳>.md，并在终端打印。
 * 用法：npm run test:bili -- "关键词"（默认"图书馆 占座"）
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBilibiliSource, findBiliPath, findOpencliPath } from "../src/source/bilibili.js";
import { nextSeq } from "../src/workspace/workspace.js";

const query = process.argv.slice(2).join(" ") || "图书馆 占座";
const bili = findBiliPath();
const opencli = findOpencliPath();
console.log(`bili 路径: ${bili ?? "未找到（B站搜索不可用）"}`);
console.log(`opencli 路径: ${opencli ?? "未找到（评论拉取不可用）"}`);
console.log(`关键词: ${query}\n`);

const src = createBilibiliSource(bili, opencli);
const rs = await src.search(query, { limit: 4 });

// 落盘 data/bilibili/<序号>-<关键词>-<时分秒>.md（运行时产物，gitignore，序号递增便于识别最新）
const stamp = new Date()
  .toISOString()
  .slice(11, 19)
  .replace(/:/g, "");
const outDir = path.join(process.cwd(), "data", "bilibili");
await mkdir(outDir, { recursive: true });
const seq = await nextSeq(outDir);
const outFile = path.join(outDir, `${seq}-${query.replace(/[\\/:*?"<>|]/g, "-")}-${stamp}.md`);
const md = [
  `# B站数据测试：${query}`,
  `> 时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
  "",
  ...rs.flatMap((r, i) => {
    const comments = r.snippet.split("热门评论：")[1];
    return [
      `## ${i + 1}. ${r.title}`,
      `链接：${r.url}`,
      ...(comments ? comments.split("\n").map((c) => c.trim()) : ["（无评论）"]),
      "",
    ];
  }),
].join("\n");
await writeFile(outFile, md);
console.log(`\n已落盘：${outFile}`);

console.log(`搜索结果 ${rs.length} 条：`);
for (const [i, r] of rs.entries()) {
  console.log(`\n${i + 1}. ${r.title}`);
  console.log(`   ${r.url}`);
  const comments = r.snippet.split("热门评论：")[1];
  if (comments) {
    console.log(comments.split("\n").slice(0, 4).join("\n   "));
  } else {
    console.log("   （无评论——检查 Chrome 是否打开 + opencli doctor 是否 connected）");
  }
}
