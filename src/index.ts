import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { runStudy } from "./agent/agent.js";
import { createFakeModel } from "./model/fake.js";

// 离线应答器走 v2 兼容模式，关闭 AI SDK 的 compatibility warning
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

/** CLI：npm run demo（交互输入问题）或 npm run demo -- "问题"；加 --offline 走离线应答器 */
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const argQuestion = args.filter((a) => !a.startsWith("--")).join(" ");

if (!offline && !process.env.DEEPSEEK_API_KEY) {
  console.error("[deep-research] 未配置 DEEPSEEK_API_KEY（.env 里没有），请先配置，或加 --offline 离线演示");
  process.exit(1);
}

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

const model = offline ? createFakeModel() : undefined;

console.log(`[deep-research] 开始研究：${question}${offline ? "（离线模式）" : ""}`);

const { ws } = await runStudy({
  question,
  model,
  workspacesRoot: path.join(process.cwd(), "workspaces"),
  onStep: (toolName, summary) => console.log(`  → ${toolName} ${summary}`),
});

console.log(`\n研究完成。工作区：${ws.dir}`);
console.log(`报告：${path.join(ws.dir, "report.md")}`);
