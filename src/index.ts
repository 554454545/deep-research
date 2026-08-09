import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { runStudy } from "./agent/agent.js";

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
