import { tool } from "ai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PersonaSchema } from "../persona/persona.js";
import type { Persona } from "../persona/persona.js";
import type { Workspace } from "../workspace/workspace.js";
import type { DataSource, SearchResult } from "../source/source.js";
import { runDiscussion } from "./discussion.js";
import type { PersonaMemoryStore } from "./memory.js";
import type { PersonaSpeaker } from "./speaker.js";
import {
  appendNote,
  readPersonas,
  setStatus,
  todosText,
  updateTodo,
  writePanel,
  writePersonas,
  writePlan,
  writeReport,
} from "../workspace/workspace.js";

/**
 * 角色卡输入 schema：从 PersonaSchema 派生（omit id）——模型提交时不带 id，
 * id 由工具统一生成（toPersonas）。build_persona / run_discussion / run_interview 共用。
 */
const personaInput = PersonaSchema.omit({ id: true });
type PersonaInput = z.infer<typeof personaInput>;

function toPersonas(inputs: PersonaInput[]): Persona[] {
  return inputs.map((p, i) => ({ id: `p_${i + 1}`, ...p }));
}

/** 收集 scouting.md 里的可引用素材（链接 + 链接的文件名），供 evidence 校验 */
async function collectScoutingLinks(ws: Workspace): Promise<string[]> {
  try {
    const raw = await readFile(path.join(ws.dir, "notes", "scouting.md"), "utf8");
    const links: string[] = [];
    for (const m of raw.matchAll(/^- 链接：(.+)$/gm)) {
      const url = m[1].trim();
      links.push(url);
      const base = path.basename(url.split("?")[0] ?? url);
      if (base && base !== url) links.push(base);
    }
    return links;
  } catch {
    return [];
  }
}

/** 骨架阶段工具的统一返回：诚实声明未实现，产物先落盘笔记 */
function skeletonResult(section: string, note: string): string {
  void appendNote; // 占位避免误删引用
  return `【骨架占位】${note}。该阶段完整实现未接入，过程记录见 notes/${section}.md。`;
}

/**
 * 工具注册表：8 个阶段工具。
 * 真实实现：make_study_plan / scout_sources / build_persona / run_discussion / run_interview / update_todo / generate_report；
 * create_panel 为骨架占位（记录输入到 notes/），保证循环完整。
 */
export function createTools(
  ws: Workspace,
  sources: DataSource[],
  speaker: PersonaSpeaker,
  memory?: PersonaMemoryStore
) {
  return {
    make_study_plan: tool({
      description:
        "制定研究方案：写入研究目标/对象/框架/方法，并初始化 8 个阶段 todo。研究开始第一步调用。",
      inputSchema: z.object({
        goal: z.string().describe("研究目标"),
        audience: z.string().describe("研究对象/目标人群"),
        framework: z.string().describe("研究方法框架，如 JTBD + KANO"),
        methods: z.array(z.string()).describe("研究方法列表"),
      }),
      execute: async ({ goal, audience, framework, methods }) => {
        const plan = [
          "# 研究方案",
          "",
          `> 问题：${ws.meta.question}`,
          "",
          "## 研究目标",
          goal,
          "",
          "## 研究对象",
          audience,
          "",
          "## 研究框架",
          framework,
          "",
          "## 研究方法",
          ...methods.map((m) => `- ${m}`),
          "",
        ].join("\n");
        await writePlan(ws, plan);
        await appendNote(ws, "study-plan", plan);
        await setStatus(ws, "running");
        return `研究方案已写入 plan.md，8 个阶段 todo 已就绪：\n${todosText(ws)}`;
      },
    }),

    update_todo: tool({
      description:
        "更新阶段 todo 的完成状态（index 从 0 开始，对应阶段清单：需求澄清/研究设计/信息侦察/画像构建/组建 Panel/焦点小组讨论/一对一访谈/洞察报告）。每完成一个阶段必须调用。",
      inputSchema: z.object({
        index: z.number().int().min(0).describe("todo 下标，从 0 开始"),
        completed: z.boolean().describe("是否完成"),
      }),
      execute: async ({ index, completed }) => {
        await updateTodo(ws, index, completed);
        return `todo[${index}] 已标记${completed ? "完成" : "未完成"}：\n${todosText(ws)}`;
      },
    }),

    scout_sources: tool({
      description:
        "信息侦察：用多个搜索关键词在数据源（360 搜索 + 本地语料库）采集真实用户信号，结果落盘 notes/scouting.md。调用后你会拿到真实搜索结果，后续画像构建必须基于这些素材。",
      inputSchema: z.object({
        topic: z.string().describe("侦察主题"),
        queries: z.array(z.string()).describe("搜索关键词列表（3-5 个），覆盖不同角度和人群措辞"),
      }),
      execute: async ({ topic, queries }) => {
        const raw: Array<SearchResult & { source: string }> = [];
        const failures: string[] = [];
        for (const q of queries) {
          for (const src of sources) {
            try {
              const rs = await src.search(q, { limit: 5 });
              raw.push(...rs.map((r) => ({ ...r, source: src.name })));
            } catch (err) {
              failures.push(`${src.name}(${q}): ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
        const results = dedupeByUrl(raw);
        const note = [
          `## 信息侦察（${new Date().toISOString()}）`,
          `主题：${topic}`,
          `关键词：${queries.join(" / ")}`,
          `来源：${sources.map((s) => s.name).join(" + ")}`,
          "",
          ...results.map((r) => `### ${r.title}\n- 链接：${r.url}\n- 摘要：${r.snippet}\n`),
          failures.length ? `\n> 采集失败（已跳过）：${failures.join("；")}` : "",
          "",
        ].join("\n");
        await appendNote(ws, "scouting", note);
        const view = results
          .slice(0, 12)
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${truncate(r.snippet, 120)}\n   ${r.url}`
          )
          .join("\n");
        if (results.length === 0) {
          return `侦察未获取到任何素材（${queries.length} 个关键词 × ${sources.length} 个数据源，0 条结果）${failures.length ? `，采集失败：${failures[0]}` : ""}。请更换更口语化、更具体的搜索关键词（如加入"吐槽""后悔""真实经历"等用户口吻词）重试；若连续多次仍为空，说明数据源暂不可用，可降低对素材的依赖继续推进。`;
        }
        return `侦察完成：${queries.length} 个关键词 × ${sources.length} 个数据源，去重后共 ${results.length} 条真实结果（已全部落盘 notes/scouting.md）。\n前 ${Math.min(results.length, 12)} 条：\n${view}${
          failures.length ? `\n注意：${failures.length} 次采集失败（${failures[0]}）` : ""
        }`;
      },
    }),

    build_persona: tool({
      description:
        "构建用户画像：给出 6-8 个覆盖不同细分人群的角色卡（背景/性格/立场/说话风格），工具校验后落盘 personas.json。画像必须基于侦察素材，覆盖不同人群维度。",
      inputSchema: z.object({
        personas: z.array(personaInput),
      }),
      execute: async ({ personas }) => {
        // evidence 校验：每个角色必须引用至少一条真实侦察素材（scouting.md 无链接时跳过校验，避免死循环）
        const links = await collectScoutingLinks(ws);
        if (links.length > 0) {
          const bad = personas.filter((p) =>
            p.evidence.every((e) => !links.some((l) => e.includes(l) || l.includes(e)))
          );
          if (bad.length > 0) {
            return `校验失败：以下画像未引用任何真实侦察素材（evidence 必须命中 notes/scouting.md 中的链接或文件名，至少一条）：${bad.map((b) => b.name).join("、")}。请修正 evidence 后重试。`;
          }
        }
        const cards = toPersonas(personas);
        await writePersonas(ws, cards);
        const summary = cards
          .map((c) => `- ${c.name}（${c.background}）立场：${c.stance}`)
          .join("\n");
        return `已构建 ${cards.length} 个画像并落盘 personas.json（全部通过素材校验）：\n${summary}`;
      },
    }),

    create_panel: tool({
      description:
        "组建研究 Panel：从已构建的画像（personas.json）中按名字选人组队，落盘 panel.json。参与后续焦点小组/访谈的角色从 Panel 成员中选取。",
      inputSchema: z.object({
        title: z.string().describe("Panel 名称（如：高校图书馆氛围派学习者）"),
        personaNames: z
          .array(z.string())
          .min(1)
          .describe("成员名单（必须是 build_persona 已构建画像的名字，3-8 人）"),
      }),
      execute: async ({ title, personaNames }) => {
        const all = await readPersonas(ws);
        const found = all.filter((p) => personaNames.includes(p.name));
        const missing = personaNames.filter((n) => !all.some((p) => p.name === n));
        if (missing.length > 0) {
          return `组建失败：以下画像不存在（请先 build_persona 构建，或核对名字）：${missing.join("、")}。当前画像库：${all.map((p) => p.name).join("、") || "（空）"}`;
        }
        const panel = { title, members: found };
        await writePanel(ws, panel);
        return `Panel「${title}」已组建并落盘 panel.json，成员（${found.length} 人）：${found.map((p) => p.name).join("、")}。后续 run_discussion / run_interview 请从这些成员中选取。`;
      },
    }),

    run_discussion: tool({
      description:
        "焦点小组讨论：给出参与讨论的角色卡（从刚才构建的画像中选取）、讨论主题和问题列表。引擎会让每个角色基于自己的设定和前面的发言真实轮询发言（各说各话、互相回应），全程落盘 notes/discussion.md。",
      inputSchema: z.object({
        personas: z.array(personaInput).describe("参与讨论的角色卡（3-8 个）"),
        topic: z.string().describe("讨论主题"),
        questions: z.array(z.string()).describe("讨论问题列表（按顺序逐题讨论）"),
      }),
      execute: async ({ personas, topic, questions }) => {
        const full = await runDiscussion(ws, toPersonas(personas), topic, questions, speaker, "discussion", memory);
        const preview = full.length > 3000 ? `${full.slice(0, 3000)}\n…（全文见 notes/discussion.md）` : full;
        return `焦点小组完成：${personas.length} 人 × ${questions.length} 题，已落盘 notes/discussion.md。\n\n${preview}`;
      },
    }),

    run_interview: tool({
      description:
        "一对一深度访谈：给出受访者角色卡和访谈问题列表，引擎会真实逐问回答（深挖决策路径与情感动因），落盘 notes/interviews.md。对低频/不去者等关键画像做。",
      inputSchema: z.object({
        persona: personaInput.describe("受访者角色卡"),
        questions: z.array(z.string()).describe("访谈问题列表"),
      }),
      execute: async ({ persona, questions }) => {
        const full = await runDiscussion(
          ws,
          [toPersonas([persona])[0]],
          "一对一深度访谈",
          questions,
          speaker,
          "interviews",
          memory
        );
        const preview = full.length > 2500 ? `${full.slice(0, 2500)}\n…（全文见 notes/interviews.md）` : full;
        return `深度访谈完成，已落盘 notes/interviews.md。\n\n${preview}`;
      },
    }),

    generate_report: tool({
      description:
        "生成深度洞察报告：整合研究过程产物，按结构化板块输出（背景/核心问题/发现/画像/需求分层/策略建议/原声）。全部阶段完成后最后调用。",
      inputSchema: z.object({
        title: z.string().describe("报告标题"),
        summary: z.string().describe("研究背景概述（一段，交代现象与问题）"),
        coreQuestions: z.array(z.string()).describe("核心研究问题（2-3 个）"),
        findings: z
          .array(
            z.object({
              title: z.string().describe("发现标题（一句话结论）"),
              detail: z.string().describe("发现阐述（支撑证据与解释，100-200 字）"),
              evidence: z
                .array(z.string())
                .min(1)
                .describe("依据的侦察素材：引用 notes/scouting.md 中出现的链接或文件名（至少一条，每条发现必须锚定真实素材）"),
            })
          )
          .min(1)
          .describe("核心发现（3-5 条）"),
        personas: z.array(z.string()).describe("画像摘要（每个一行：名字+类型+关键需求）"),
        needs: z
          .object({
            must: z.array(z.string()).min(1).describe("基础需求 MUST-HAVE（缺失即流失）"),
            performance: z.array(z.string()).describe("期望需求 PERFORMANCE（越好越满意）"),
            delight: z.array(z.string()).describe("惊喜需求 DELIGHTER（超出预期）"),
          })
          .describe("KANO 需求分层"),
        recommendations: z
          .array(
            z.object({
              priority: z.string().describe("优先级（P1 立即 / P2 短期 / P3 中期 / P4 长期）"),
              action: z.string().describe("具体动作"),
              why: z.string().describe("理由/依据（可引用用户原声或素材）"),
            })
          )
          .min(1)
          .describe("策略建议（带优先级，3-5 条）"),
        quotes: z.array(z.string()).describe("用户原声（可溯源引述，每条带角色名）"),
      }),
      execute: async (input) => {
        const { title, summary, coreQuestions, findings, personas, needs, recommendations, quotes } =
          input;
        // 报告生成 = 洞察报告阶段完成：先把最后一项 todo 标记完成（模型可能先调 report 后标 todo）
        const lastIndex = ws.todos.length - 1;
        if (!ws.todos[lastIndex].completed) {
          await updateTodo(ws, lastIndex, true);
        }
        // evidence 校验：每条发现必须引用至少一条真实侦察素材（scouting.md 无链接时跳过，避免死循环）
        const links = await collectScoutingLinks(ws);
        if (links.length > 0) {
          const bad = findings.filter((f) =>
            f.evidence.every((e) => !links.some((l) => e.includes(l) || l.includes(e)))
          );
          if (bad.length > 0) {
            return `校验失败：以下发现的 evidence 未引用任何真实侦察素材（需命中 notes/scouting.md 中的链接或文件名，至少一条）：${bad.map((b) => b.title).join("、")}。请修正 evidence 后重试。`;
          }
        }
        const report = [
          `# ${title}`,
          "",
          `> 研究问题：${ws.meta.question}`,
          "",
          "## 研究背景",
          summary,
          "",
          "## 核心研究问题",
          ...coreQuestions.map((q) => `- ${q}`),
          "",
          "## 核心发现",
          ...findings.map(
            (f, i) =>
              `### 发现 ${String(i + 1).padStart(2, "0")}：${f.title}\n${f.detail}\n来源：${f.evidence.join("、")}`
          ),
          "",
          "## 用户画像",
          ...personas.map((p) => `- ${p}`),
          "",
          "## 需求分层（KANO）",
          "### 基础需求 · MUST-HAVE（缺失即流失）",
          ...needs.must.map((n) => `- ${n}`),
          "### 期望需求 · PERFORMANCE（越好越满意）",
          ...needs.performance.map((n) => `- ${n}`),
          "### 惊喜需求 · DELIGHTER（超出预期）",
          ...needs.delight.map((n) => `- ${n}`),
          "",
          "## 策略建议",
          ...recommendations.map((r) => `- **${r.priority}**：${r.action}（${r.why}）`),
          "",
          "## 用户原声",
          ...quotes.map((q) => `- ${q}`),
          "",
          "## 研究过程",
          "阶段产物见 notes/ 目录：",
          ws.todos.map((t) => `- ${t.completed ? "[x]" : "[ ]"} ${t.title}`).join("\n"),
          "",
        ].join("\n");
        await writeReport(ws, report);
        await setStatus(ws, "done");
        return `深度洞察报告已生成：${ws.dir}/report.md`;
      },
    }),
  };
}

/** 供 createTools 外部使用的类型（工具注册表） */
export type ToolSet = ReturnType<typeof createTools>;

// 按 url 去重 - 取先出现的
function dedupeByUrl(items: Array<SearchResult & { source: string }>): Array<SearchResult & { source: string }> {
  const seen = new Set<string>();
  return items.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// 把过长的字符串截到 n 个字符
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
