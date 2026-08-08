import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { runStudy } from "./agent/agent.js";

// 关闭 AI SDK 的兼容性 warning（v2 规格应答器仅测试使用，不影响运行）
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

/** CLI：npm run demo（交互输入问题）或 npm run demo -- "问题"；运行必须有 DEEPSEEK_API_KEY */
if (!process.env.DEEPSEEK_API_KEY) {
  console.error("[deep-research] 未配置 DEEPSEEK_API_KEY（.env 里没有），请先在 .env 配置后再运行");
  process.exit(1);
}

const args = process.argv.slice(2);
const argQuestion = args.filter((a) => !a.startsWith("--")).join(" ");

// 研究问题：优先命令行参数，否则必须由用户交互输入
let question = argQuestion;
if (!question) {
  // 传统 readline 接口：EOF（管道/无输入）时 close 事件兜底 resolve(null)，避免挂起
  const rl = createInterface({ input, output });
  const answer = await new Promise<string | null>((resolve) => {
    rl.question("请输入研究问题（关于人类行为与决策的商业问题）：\n> ", resolve);
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
  onStep: (toolName, summary) => console.log(`  → ${toolName} ${summary}`),
});

console.log(`\n研究完成。工作区：${ws.dir}`);
console.log(`报告：${path.join(ws.dir, "report.md")}`);
