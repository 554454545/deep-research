import type { Persona } from "../persona/persona.js";
import { appendNote } from "../workspace/workspace.js";
import type { Workspace } from "../workspace/workspace.js";
import type { PersonaSpeaker } from "./speaker.js";

/**
 * 焦点小组引擎：问题列表 × 全部 persona 轮询发言。
 * 每个角色只看到"公开讨论记录（最近 6 条）"——像真人小组都听得到发言，
 * 但只基于自己的角色卡回应，身份独立。
 * 发言逐条落盘 notes/<section>.md，返回全文给主循环。
 */
export async function runDiscussion(
  ws: Workspace,
  personas: Persona[],
  topic: string,
  questions: string[],
  speaker: PersonaSpeaker,
  section = "discussion"
): Promise<string> {
  const transcript: string[] = [];
  const lines: string[] = [`## 焦点小组：${topic}`, `参与：${personas.map((p) => p.name).join("、")}`, ""];
  for (const q of questions) {
    lines.push(`### 问题：${q}`);
    for (const p of personas) {
      let entry: string;
      try {
        const speech = await speaker.speak({
          persona: p,
          transcript: transcript.slice(-6),
          question: q,
        });
        entry = `${p.name}：${speech}`;
      } catch (err) {
        // 单次发言失败不中断整场讨论
        entry = `${p.name}：（发言失败：${err instanceof Error ? err.message : String(err)}）`;
      }
      transcript.push(entry);
      lines.push(entry, "");
    }
  }
  const full = lines.join("\n");
  await appendNote(ws, section, full);
  return full;
}
