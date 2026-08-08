import path from "node:path";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import { getModel } from "../model/model.js";
import { createDefaultSources, type DataSource } from "../source/index.js";
import { createWorkspace, type Workspace } from "../workspace/workspace.js";
import { createTools } from "./tools.js";

export interface RunStudyOptions {
  /** 研究问题（用户输入） */
  question: string;
  /** 模型，缺省 getModel()（真实 DeepSeek；测试/离线传 FakeModel） */
  model?: LanguageModel;
  /** 工作区根目录，缺省 ./workspaces */
  workspacesRoot?: string;
  /** 数据源（侦察阶段用），缺省 本地语料库 + 免费必应 */
  sources?: DataSource[];
  /** 工具往返封顶步数，缺省 16 */
  maxSteps?: number;
  /** 每步工具调用的进度回调（CLI 打印用） */
  onStep?: (toolName: string, summary: string) => void;
}

export interface RunStudyResult {
  ws: Workspace;
  text: string;
}

const SYSTEM_PROMPT = `你是 deep-research，一个洞察与用户研究 Agent。
用户输入一个研究问题，你像专业用户研究员一样自主完成一次完整的用户研究，最终产出洞察报告。

工作方式：
1. 第一步先调用 make_study_plan 制定研究方案（研究目标/对象/框架/方法），它会初始化 8 个阶段 todo。
2. 第二步调用 scout_sources 做信息侦察：给出 3-5 个覆盖不同角度的搜索关键词，工具会返回真实搜索结果（必应 + 本地语料库）并落盘。后续画像构建必须基于这些真实素材。
3. 之后按阶段推进研究：画像构建 → 组建 Panel → 焦点小组讨论 → 一对一访谈。
   每完成一个阶段，立即调用 update_todo 把对应 todo 标记完成（index 从 0 开始）。
4. 全部阶段完成后，调用 generate_report 生成洞察报告。
5. 最后用中文向用户总结研究结论与核心发现。

研究框架建议采用 JTBD（用户"雇用"了什么替代品完成任务）+ KANO（需求优先级分层）。
过程产物通过工具自动落盘到工作区，你只需汇报要点。`;

/** 主循环：一次完整研究 = 模型 + 工具注册 + todo 状态机（AI SDK 工具调用驱动） */
export async function runStudy(opts: RunStudyOptions): Promise<RunStudyResult> {
  const model = opts.model ?? getModel();
  const ws = await createWorkspace(
    opts.workspacesRoot ?? path.join(process.cwd(), "workspaces"),
    opts.question
  );
  const sources = opts.sources ?? createDefaultSources();
  const tools = createTools(ws, sources);

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: opts.question }],
    tools,
    stopWhen: stepCountIs(opts.maxSteps ?? 16),
    onStepFinish: (step) => {
      for (const call of step.toolCalls) {
        const summary = JSON.stringify(call.input).slice(0, 60);
        opts.onStep?.(call.toolName, summary);
      }
    },
  });

  return { ws, text: result.text };
}
