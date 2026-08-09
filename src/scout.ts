import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import { getModel } from "./model/model.js";
import { createDefaultSources, type DataSource } from "./source/index.js";
import { createWorkspace } from "./workspace/workspace.js";
import { createTools } from "./agent/tools.js";
import { createLLMSpeaker } from "./agent/speaker.js";
import { createLLMSummarizer, createPersonaMemoryStore } from "./agent/memory.js";

// 关闭 AI SDK 的兼容性 warning
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("[deep-research] 未配置 DEEPSEEK_API_KEY（.env 里没有），请先在 .env 配置后再运行");
  process.exit(1);
}

/**
 * 快速侦察模式：只跑 方案制定 + 信息侦察 两个阶段（不做讨论/访谈/报告），
 * 用于快速验证数据源拉取的内容质量（平台源测试专用）。
 */
async function runScout(question: string): Promise<void> {
  const model = getModel();
  const sources = createDefaultSources();
  const ws = await createWorkspace(path.join(process.cwd(), "workspaces"), question);

  const speaker = createLLMSpeaker(model);
  const memory = createPersonaMemoryStore(ws, createLLMSummarizer(model));
  const all = createTools(ws, sources, speaker, memory);

  // 只暴露侦察相关的两个工具，模型只能走 方案→侦察
  const scoutTools = {
    make_study_plan: all.make_study_plan,
    scout_sources: all.scout_sources,
  };

  console.log(`[deep-research] 快速侦察：${question}`);
  console.log(`数据源：${sources.map((s) => s.name).join(" + ")}`);
  console.log(`工作区：${ws.dir}\n`);

  const system = `你是一名商业用户研究助理。当前是快速侦察模式：
1. 第一步调用 make_study_plan 制定研究方案。
2. 第二步调用 scout_sources 做信息侦察：给出 3-5 个覆盖不同角度的搜索关键词（含用户口吻词，如"吐槽""后悔""真实经历"），工具会用多个数据源（360 搜索 + B站视频搜索含评论区）抓取真实素材。
3. 侦察完成后用中文总结素材要点。
只做侦察，不要调用其他工具。`;

  const { text, steps } = await generateText({
    model,
    system,
    messages: [{ role: "user", content: question }],
    tools: scoutTools,
    stopWhen: stepCountIs(4),
    onStepFinish: (step) => {
      const calls = step.toolCalls;
      if (calls && calls.length > 0) {
        for (const c of calls) {
          console.log(`  → ${c.toolName} ${JSON.stringify(c.input).slice(0, 80)}`);
        }
      }
    },
  });

  console.log(`\n[deep-research] 侦察完成（${steps.length} 圈）`);
  console.log(`素材：${path.join(ws.dir, "notes", "scouting.md")}`);
  console.log(`查看：cat ${path.join(ws.dir, "notes", "scouting.md")}`);
  console.log(`\n侦察总结：\n${text}`);
}

const argQuestion = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
let question = argQuestion;
if (!question) {
  const rl = createInterface({ input, output });
  const answer = await new Promise<string | null>((resolve) => {
    rl.question("请输入研究问题：\n> ", resolve);
    rl.on("close", () => resolve(null));
  });
  rl.close();
  question = (answer ?? "").trim();
  if (!question) {
    console.error("未输入研究问题，退出");
    process.exit(1);
  }
}

await runScout(question);
