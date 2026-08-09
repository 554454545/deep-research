import type { Persona } from "../persona/persona.js";
import { appendNote } from "../workspace/workspace.js";
import type { Workspace } from "../workspace/workspace.js";
import type { PersonaMemoryStore } from "./memory.js";
import type { PersonaSpeaker } from "./speaker.js";

/**
 * 焦点小组引擎：问题列表 × 全部 persona 轮询发言。
 * 每个角色只看到"公开讨论记录（最近 6 条）"——像真人小组都听得到发言，
 * 但只基于自己的角色卡回应，身份独立。
 * 若传入 memory（角色长期记忆）：每轮结束后为该轮所有角色 consolidate（本轮发言+旧记忆→新记忆落盘），
 * 下一轮发言时自己的记忆注入 prompt——角色"记得"之前说过的话。
 * 发言逐条落盘 notes/<section>.md，返回全文给主循环。
 */
export async function runDiscussion(
  ws: Workspace,
  personas: Persona[],
  topic: string,
  questions: string[],
  speaker: PersonaSpeaker,
  section = "discussion",
  memory?: PersonaMemoryStore
): Promise<string> {
  const transcript: string[] = [];
  const lines: string[] = [`## 焦点小组：${topic}`, `参与：${personas.map((p) => p.name).join("、")}`, ""];
  for (const q of questions) {
    const roundStart = transcript.length;
    lines.push(`### 问题：${q}`);
    for (const p of personas) {
      let entry: string;
      try {
        const speech = await speaker.speak({
          persona: p,
          transcript: transcript.slice(-6),
          question: q,
          memory: memory ? await memory.read(p.id) : undefined,
        });
        entry = `${p.name}：${speech}`;
      } catch (err) {
        // 单次发言失败不中断整场讨论
        entry = `${p.name}：（发言失败：${err instanceof Error ? err.message : String(err)}）`;
      }
      transcript.push(entry);
      lines.push(entry, "");
    }
    // 本轮结束后：每个角色沉淀记忆（自己的发言+旧记忆→新记忆），供下一轮发言使用
    // 并行执行（各角色记忆互相独立），避免 8 次串行嵌套调用拖慢讨论
    if (memory) {
      const ownSpeech = (p: Persona) =>
        transcript
          .slice(roundStart)
          .filter((l) => l.startsWith(`${p.name}：`))
          .join("\n");
      await Promise.all(
        personas.map(async (p) => {
          try {
            await memory.consolidate(p, ownSpeech(p));
          } catch {
            // 记忆沉淀失败不中断讨论
          }
        })
      );
    }
  }
  const full = lines.join("\n");
  await appendNote(ws, section, full);
  return full;
}
