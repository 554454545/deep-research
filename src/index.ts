import path from "node:path";
import { runStudy } from "./agent/agent.js";
import { createFakeModel } from "./model/fake.js";

// 离线应答器走 v2 兼容模式，关闭 AI SDK 的 compatibility warning
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

/** CLI 演示：npm run demo -- "问题"（加 --offline 走离线应答器，不配 key） */
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const question =
  args.filter((a) => !a.startsWith("--")).join(" ") || "为什么当代学生不再走进图书馆了？";

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
