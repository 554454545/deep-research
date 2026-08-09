import path from "node:path";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import { createFileLogger, createNullLogger, type Logger } from "../logger.js";
import { getModel } from "../model/model.js";
import { createDefaultSources, type DataSource } from "../source/index.js";
import { createWorkspace, type Workspace } from "../workspace/workspace.js";
import { createLLMSpeaker, type PersonaSpeaker } from "./speaker.js";
import { createTools } from "./tools.js";

// 发起一次研究的配置清单
export interface RunStudyOptions {
  question: string;
  model?: LanguageModel;
  /** 谁来扮演角色 */
  speaker?: PersonaSpeaker;
  /** 工作区根目录，缺省 ./workspaces */
  workspacesRoot?: string;
  /** 数据源（侦察阶段用），缺省 本地语料库 + 360 搜索 */
  sources?: DataSource[];
  /** 工具往返封顶步数，缺省 16 */
  maxSteps?: number;
  /** 每步工具调用的进度回调 */
  onStep?: (toolName: string, summary: string) => void;
  /** 日志目录：传了则每个研究写一份 JSONL 日志（logs/<工作区名>.log） */
  logDir?: string;
}

/**
 * 一次研究跑完交给你两样东西：
 * - ws —— 工作区对象（目录路径 + meta + todos）：研究全程的存档，report.md 也在 ws.dir 下
 * - text —— 模型跑完所有阶段后说的最终总结（收尾那段话）
 */
export interface RunStudyResult {
  ws: Workspace;
  text: string;
}

const SYSTEM_PROMPT = `你是 deep-research，一个洞察与用户研究 Agent。
用户输入一个研究问题，你像专业用户研究员一样自主完成一次完整的用户研究，最终产出洞察报告。

工作方式：
1. 第一步先调用 make_study_plan 制定研究方案（研究目标/对象/框架/方法），它会初始化 8 个阶段 todo。
2. 第二步调用 scout_sources 做信息侦察：给出 3-5 个覆盖不同角度的搜索关键词，工具会返回真实搜索结果（360 搜索 + 本地语料库）并落盘。后续画像构建必须基于这些真实素材。
3. 第三步调用 build_persona 构建用户画像：给出 6-8 个角色卡（每个含 名字/背景/性格特征/立场/说话风格/evidence 依据素材），工具校验后落盘。
4. 之后按阶段推进：先调用 create_panel 从已构建画像中按名字选 3-8 人组建研究 Panel（落盘 panel.json）；再调用 run_discussion 组织焦点小组（从 Panel 成员中选取角色，给出讨论主题和问题列表，引擎会让每个角色真实轮询发言、互相回应）；调用 run_interview 对关键画像做一对一深度访谈（给出受访者和问题列表，引擎逐问回答）。
   每完成一个阶段，立即调用 update_todo 把对应 todo 标记完成（index 从 0 开始）。
5. 全部阶段完成后，调用 generate_report 生成洞察报告。
6. 最后用中文向用户总结研究结论与核心发现。

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
  const speaker = opts.speaker ?? createLLMSpeaker(model);
  const tools = createTools(ws, sources, speaker);
  const logger: Logger = opts.logDir
    ? createFileLogger(opts.logDir, path.basename(ws.dir))
    : createNullLogger();

  logger.info("study_started", { question: opts.question, workspace: ws.dir });
  try {
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: opts.question }],
      tools,
      stopWhen: stepCountIs(opts.maxSteps ?? 16),
      onStepFinish: (step) => {
        for (const call of step.toolCalls) {
          logger.tool(call.toolName, call.input);
          const summary = JSON.stringify(call.input).slice(0, 60);
          opts.onStep?.(call.toolName, summary);
        }
      },
    });
    logger.info("study_done", { workspace: ws.dir, steps: result.steps?.length });
    return { ws, text: result.text };
  } catch (err) {
    logger.error("study_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
