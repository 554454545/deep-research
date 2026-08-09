import path from "node:path";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { runStudy } from "./agent/agent.js";
import { renderHtmlReport } from "./render/html.js";

// 关闭 AI SDK 的兼容性 warning
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("[deep-research] 未配置 DEEPSEEK_API_KEY（.env 里没有），请先在 .env 配置后再运行");
  process.exit(1);
}

const args = process.argv.slice(2);
// 不进入交互模式直接问  -- "问题"
const argQuestion = args.filter((a) => !a.startsWith("--")).join(" ");

// 研究问题：优先命令行参数，否则必须由用户交互输入
let question = argQuestion;
if (!question) {
  const rl = createInterface({ input, output });
  const answer = await new Promise<string | null>((resolve) => {
    rl.question("请输入研究问题(关于人类行为与决策的问题)：\n> ", resolve);
    rl.on("close", () => resolve(null));
  });
  rl.close();
  question = (answer ?? "").trim();
  if (!question) {
    console.error("未输入研究问题，退出");
    process.exit(1);
  }
}

console.log(`[deep-research] 开始研究：${question}`);

const { ws } = await runStudy({
  question,
  workspacesRoot: path.join(process.cwd(), "workspaces"),
  logDir: path.join(process.cwd(), "logs"),
  onStep: (toolName, summary) => console.log(`  → ${toolName} ${summary}`),
});

console.log(`\n[deep-research] 研究完成！`);
console.log(`问题：${question}`);
console.log(`工作区：${ws.dir}`);
console.log(`报告：${path.join(ws.dir, "report.md")}`);
console.log(`过程素材：${path.join(ws.dir, "notes")}`);
console.log(`\n查看报告：cat ${path.join(ws.dir, "report.md")}`);

// 渲染可视化 HTML 报告（对标参考报告形态；md 保留）
try {
  const html = await renderHtmlReport(ws.dir);
  const htmlFile = path.join(ws.dir, "report.html");
  await writeFile(htmlFile, html, "utf8");
  console.log(`可视化报告：${htmlFile}`);
  console.log(`用浏览器打开：explorer.exe ${htmlFile.replace(/\\/g, "/")}（WSL 内可直接 xdg-open）`);
} catch (err) {
  console.warn(`HTML 渲染跳过：${err instanceof Error ? err.message : String(err)}`);
}
