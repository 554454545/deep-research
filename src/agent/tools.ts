import { tool } from "ai";
import { z } from "zod";
import type { Workspace } from "../workspace/workspace.js";
import {
  appendNote,
  setStatus,
  todosText,
  updateTodo,
  writePlan,
  writeReport,
} from "../workspace/workspace.js";

/** 骨架阶段工具的统一返回：诚实声明未实现，产物先落盘笔记 */
function skeletonResult(section: string, note: string): string {
  void appendNote; // 占位避免误删引用
  return `【骨架占位】${note}。该阶段完整实现未接入，过程记录见 notes/${section}.md。`;
}

/**
 * 工具注册表：8 个阶段工具。
 * 真实实现：make_study_plan / update_todo / generate_report；
 * 其余 5 个为骨架占位（记录输入到 notes/，返回未实现说明），保证循环完整。
 */
export function createTools(ws: Workspace) {
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
      description: "【骨架】信息侦察：采集真实用户信号（社媒/网页/本地语料）。",
      inputSchema: z.object({
        topic: z.string().describe("侦察主题"),
        platforms: z.array(z.string()).describe("信息源平台"),
      }),
      execute: async ({ topic, platforms }) => {
        const note = `## 信息侦察（骨架）\n主题：${topic}\n平台：${platforms.join("、")}`;
        await appendNote(ws, "scouting", note);
        return skeletonResult("scouting", `已记录侦察计划（主题：${topic}）`);
      },
    }),

    build_persona: tool({
      description: "【骨架】构建用户画像：覆盖不同细分人群的 6-8 个画像。",
      inputSchema: z.object({
        names: z.array(z.string()).describe("画像名单"),
      }),
      execute: async ({ names }) => {
        await appendNote(ws, "personas", `## 画像构建（骨架）\n${names.join("、")}`);
        return skeletonResult("personas", `已记录画像名单（${names.length} 个）`);
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
      description: "【骨架】焦点小组讨论：多画像围绕主题讨论，提炼共识/分歧/意外主题。",
      inputSchema: z.object({
        round: z.number().describe("第几轮讨论"),
        topic: z.string().describe("讨论主题"),
      }),
      execute: async ({ round, topic }) => {
        await appendNote(ws, "discussion", `## 第 ${round} 轮讨论（骨架）\n主题：${topic}`);
        return skeletonResult("discussion", `已记录第 ${round} 轮讨论计划`);
      },
    }),

    run_interview: tool({
      description: "【骨架】一对一深度访谈：挖掘个人决策路径与情感动因。",
      inputSchema: z.object({
        personaName: z.string().describe("受访画像"),
      }),
      execute: async ({ personaName }) => {
        await appendNote(ws, "interviews", `## 深度访谈（骨架）\n受访者：${personaName}`);
        return skeletonResult("interviews", `已记录对 ${personaName} 的访谈计划`);
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
