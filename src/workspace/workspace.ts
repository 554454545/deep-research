import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PersonaSchema, type Persona } from "../persona/persona.js";

// 进度表里的一行
export interface TodoItem { 
// - title: string —— 这一行的名字（"需求澄清"、"信息侦察"…8 个阶段之一）
// - completed: boolean —— 是否完成，true = 打勾
  title: string;        
  completed: boolean; 
}

// 学习状态
export type StudyStatus = "planning" | "running" | "done";

// 一次研究的档案封面
export interface WorkspaceMeta {
  question: string;
  // 创建时间
  createdAt: string;
  // 研究生命周期状态
  status: StudyStatus;
}

/** 工作区 = 一次研究的全部状态，续跑时 loadWorkspace 恢复 */
export interface Workspace {
  dir: string;
  meta: WorkspaceMeta;
  // 8 行进度表
  todos: TodoItem[];
}

/** 阶段清单：对齐 AGENT.md 工作流 */
export const DEFAULT_STAGES: string[] = [
  "需求澄清",
  "研究设计",
  "信息侦察",
  "画像构建",
  "组建 Panel",
  "焦点小组讨论",
  "一对一访谈",
  "洞察报告",
];

/**
 * 写队列：并发写文件时串行落盘。
 * 坑（AI SDK 同一步多工具调用并行执行）：并发 updateTodo 各自
 * 直接 writeFile 会用旧快照互相覆盖，必须串行化写。
 */
const writeQueues = new WeakMap<Workspace, Promise<void>>();

function enqueueWrite(ws: Workspace, file: string, data: string): Promise<void> {
  const prev = writeQueues.get(ws) ?? Promise.resolve();
  const next = prev.then(() => writeFile(file, data, "utf8"));
  writeQueues.set(ws, next);
  return next;
}

function enqueueAppend(ws: Workspace, file: string, data: string): Promise<void> {
  const prev = writeQueues.get(ws) ?? Promise.resolve();
  const next = prev.then(() => appendFile(file, data, "utf8"));
  writeQueues.set(ws, next);
  return next;
}

/** 目录名 = 序号 + 问题关键词（去标点截断）+ 时分秒：如 3-为什么学生不去图书馆-150230，序号递增便于识别最新输出 */
function newId(question: string, seq: number): string {
  const slug =
    question
      .replace(/[，。？！、；：""''（）《》·\s]+/g, "")
      .slice(0, 18) || "research";
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(8, 14);
  return `${seq}-${slug}-${ts}`;
}

/** 计算目录下一个序号：扫描现有 "<数字>-" 前缀取最大值 +1（无则 1） */
export async function nextSeq(rootDir: string): Promise<number> {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    let max = 0;
    for (const e of entries) {
      const m = e.name.match(/^(\d+)-/);
      if (m) max = Math.max(max, Number.parseInt(m[1]!, 10));
    }
    return max + 1;
  } catch {
    return 1;
  }
}

/** 创建新工作区：目录 + meta/todos/plan/report/notes，todo 初始化为阶段清单 */
export async function createWorkspace(
  rootDir: string,
  question: string,
  stages: string[] = DEFAULT_STAGES
): Promise<Workspace> {
  const seq = await nextSeq(rootDir);
  const dir = path.join(rootDir, newId(question, seq));
  await mkdir(path.join(dir, "notes"), { recursive: true });
  const ws: Workspace = {
    dir,
    meta: { question, createdAt: new Date().toISOString(), status: "planning" },
    todos: stages.map((title) => ({ title, completed: false })),
  };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(ws.meta, null, 2), "utf8");
  await writeFile(path.join(dir, "todos.json"), JSON.stringify(ws.todos, null, 2), "utf8");
  await writeFile(
    path.join(dir, "plan.md"),
    `# 研究方案\n\n> 问题：${question}\n> 状态：待制定\n`,
    "utf8"
  );
  await writeFile(path.join(dir, "report.md"), "", "utf8");
  return ws;
}

/** 续跑：从磁盘恢复工作区 */
export async function loadWorkspace(dir: string): Promise<Workspace> {
  const [meta, todos] = await Promise.all([
    readFile(path.join(dir, "meta.json"), "utf8"),
    readFile(path.join(dir, "todos.json"), "utf8"),
  ]);
  return { dir, meta: JSON.parse(meta) as WorkspaceMeta, todos: JSON.parse(todos) as TodoItem[] };
}

/** 更新单个 todo（同步改内存 + 串行落盘），index 越界抛错 */
export async function updateTodo(ws: Workspace, index: number, completed: boolean): Promise<void> {
  if (index < 0 || index >= ws.todos.length) {
    throw new Error(`updateTodo: index ${index} 越界（共 ${ws.todos.length} 项）`);
  }
  ws.todos[index] = { ...ws.todos[index], completed };
  await enqueueWrite(ws, path.join(ws.dir, "todos.json"), JSON.stringify(ws.todos, null, 2));
}

export async function setStatus(ws: Workspace, status: StudyStatus): Promise<void> {
  ws.meta.status = status;
  await enqueueWrite(ws, path.join(ws.dir, "meta.json"), JSON.stringify(ws.meta, null, 2));
}

export async function writePlan(ws: Workspace, content: string): Promise<void> {
  await enqueueWrite(ws, path.join(ws.dir, "plan.md"), content);
}

export async function writeReport(ws: Workspace, content: string): Promise<void> {
  await enqueueWrite(ws, path.join(ws.dir, "report.md"), content);
}

/** 过程产物沉淀到 notes/<section>.md（追加） */
export async function appendNote(ws: Workspace, section: string, content: string): Promise<string> {
  const file = path.join(ws.dir, "notes", `${section}.md`);
  await enqueueAppend(ws, file, `${content}\n\n`);
  return file;
}

/** 覆盖写 notes/<section>.md（角色记忆等需要整体替换的场景），走写队列，自动建子目录，等写完再返回 */
export async function writeNote(ws: Workspace, section: string, content: string): Promise<string> {
  const file = path.join(ws.dir, "notes", `${section}.md`);
  const prev = writeQueues.get(ws) ?? Promise.resolve();
  const next = prev.then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  });
  writeQueues.set(ws, next);
  await next;
  return file;
}

/** 读 notes/<section>.md，文件缺失返回空字符串 */
export async function readNote(ws: Workspace, section: string): Promise<string> {
  try {
    return await readFile(path.join(ws.dir, "notes", `${section}.md`), "utf8");
  } catch {
    return "";
  }
}

/** 角色卡落盘 personas.json（逐卡校验，非法抛错） */
export async function writePersonas(ws: Workspace, personas: Persona[]): Promise<void> {
  const validated = personas.map((p) => PersonaSchema.parse(p));
  await enqueueWrite(ws, path.join(ws.dir, "personas.json"), JSON.stringify(validated, null, 2));
}

/** 读回角色卡，文件缺失返回空数组 */
export async function readPersonas(ws: Workspace): Promise<Persona[]> {
  try {
    const raw = await readFile(path.join(ws.dir, "personas.json"), "utf8");
    return JSON.parse(raw) as Persona[];
  } catch {
    return [];
  }
}

/** 研究 Panel：从画像库选人组成的讨论组 */
export interface Panel {
  title: string;
  members: Persona[];
}

/** Panel 落盘 panel.json */
export async function writePanel(ws: Workspace, panel: Panel): Promise<void> {
  await enqueueWrite(ws, path.join(ws.dir, "panel.json"), JSON.stringify(panel, null, 2));
}

/** 读回 Panel，文件缺失返回 null */
export async function readPanel(ws: Workspace): Promise<Panel | null> {
  try {
    const raw = await readFile(path.join(ws.dir, "panel.json"), "utf8");
    return JSON.parse(raw) as Panel;
  } catch {
    return null;
  }
}

/** todo 列表的模型可读文本 */
export function todosText(ws: Workspace): string {
  return ws.todos.map((t, i) => `${t.completed ? "[x]" : "[ ]"} ${i}. ${t.title}`).join("\n");
}
