import { tool } from "ai";
import { z } from "zod";
import type { Persona } from "../persona/persona.js";
import type { Workspace } from "../workspace/workspace.js";
import type { DataSource, SearchResult } from "../source/source.js";
import { runDiscussion } from "./discussion.js";
import type { PersonaSpeaker } from "./speaker.js";
import {
  appendNote,
  setStatus,
  todosText,
  updateTodo,
  writePersonas,
  writePlan,
  writeReport,
} from "../workspace/workspace.js";

/** 角色卡输入 schema（无 id，id 由工具统一生成）：build_persona / run_discussion / run_interview 共用 */
const personaInput = z.object({
  name: z.string().describe("画像名字"),
  background: z.string().describe("身份背景：年级/专业/生活状态"),
  traits: z.array(z.string()).describe("性格特征"),
  stance: z.string().describe("对研究主题的立场/态度"),
  voice: z.string().describe("说话风格"),
});
type PersonaInput = z.infer<typeof personaInput>;

function toPersonas(inputs: PersonaInput[]): Persona[] {
  return inputs.map((p, i) => ({ id: `p_${i + 1}`, ...p }));
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
export function createTools(ws: Workspace, sources: DataSource[], speaker: PersonaSpeaker) {
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
        "信息侦察：用多个搜索关键词在数据源（免费必应搜索 + 本地语料库）采集真实用户信号，结果落盘 notes/scouting.md。调用后你会拿到真实搜索结果，后续画像构建必须基于这些素材。",
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
        return `侦察完成：${queries.length} 个关键词 × ${sources.length} 个数据源，去重后共 ${results.length} 条真实结果（已全部落盘 notes/scouting.md）。\n前 ${Math.min(results.length, 12)} 条：\n${view}\n${
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
        const cards = toPersonas(personas);
        await writePersonas(ws, cards);
        const summary = cards
          .map((c) => `- ${c.name}（${c.background}）立场：${c.stance}`)
          .join("\n");
        return `已构建 ${cards.length} 个画像并落盘 personas.json：\n${summary}`;
      },
    }),

    create_panel: tool({
      description: "【骨架】组建研究 Panel：选定画像集合。",
      inputSchema: z.object({
        title: z.string().describe("Panel 名称"),
        personaNames: z.array(z.string()).describe("纳入 Panel 的画像"),
      }),
      execute: async ({ title, personaNames }) => {
        await appendNote(ws, "panel", `## Panel（骨架）\n${title}\n${personaNames.join("、")}`);
        return skeletonResult("panel", `已记录 Panel：${title}`);
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
        const full = await runDiscussion(ws, toPersonas(personas), topic, questions, speaker);
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
          "interviews"
        );
        const preview = full.length > 2500 ? `${full.slice(0, 2500)}\n…（全文见 notes/interviews.md）` : full;
        return `深度访谈完成，已落盘 notes/interviews.md。\n\n${preview}`;
      },
    }),

    generate_report: tool({
      description:
        "生成深度洞察报告：整合研究过程产物，输出核心发现与可落地建议。全部阶段完成后最后调用。",
      inputSchema: z.object({
        title: z.string().describe("报告标题"),
        highlights: z.array(z.string()).describe("核心发现列表"),
      }),
      execute: async ({ title, highlights }) => {
        const report = [
          `# ${title}`,
          "",
          `> 研究问题：${ws.meta.question}`,
          "",
          "## 研究过程",
          "阶段产物见 notes/ 目录：",
          ws.todos.map((t) => `- ${t.completed ? "[x]" : "[ ]"} ${t.title}`).join("\n"),
          "",
          "## 核心发现",
          ...highlights.map((h) => `- ${h}`),
          "",
          "## 建议",
          "（待补充：接入完整研究阶段后由模型产出）",
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

/** 按 url 去重（取先出现的） */
function dedupeByUrl(items: Array<SearchResult & { source: string }>): Array<SearchResult & { source: string }> {
  const seen = new Set<string>();
  return items.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
