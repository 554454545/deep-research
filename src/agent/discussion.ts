import type { Persona } from "../persona/persona.js";
import { appendNote } from "../workspace/workspace.js";
import type { Workspace } from "../workspace/workspace.js";
import type { PersonaMemoryStore } from "./memory.js";
import type { PersonaSpeaker } from "./speaker.js";

/** 一条发言：谁说的、回复谁（可选，@名字 点名）、内容 */
interface SpeakEntry {
  from: string;
  to?: string;
  text: string;
}

/** 发言格式化为模型可见文本：带回复关系（阿哲 → 博文：…） */
function formatEntry(e: SpeakEntry): string {
  return e.to ? `${e.from} → ${e.to}：${e.text}` : `${e.from}：${e.text}`;
}

/** 从发言内容解析 @点名：@博文 你宿舍党… → { to: "博文", text: "你宿舍党…" } */
function parseReply(raw: string): { to?: string; text: string } {
  const m = raw.match(/^@(\S+?)[：:，,\s]/);
  if (m) return { to: m[1]!, text: raw.slice(m[0].length) };
  return { text: raw };
}

/**
 * 焦点小组引擎：问题列表 × 全部 persona 轮询发言。
 * 发言支持 @名字 点名直接回应（A→B 对话链）；每个角色只看到
 * "公开讨论记录（最近 6 条）"——像真人小组都听得到发言，但只基于自己的角色卡回应。
 * 若传入 memory（角色长期记忆）：每轮结束后为该轮所有角色并行 consolidate
 * （自己的发言+旧记忆→新记忆落盘），下一轮发言时自己的记忆注入 prompt。
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
  const transcript: SpeakEntry[] = [];
  const lines: string[] = [`## 焦点小组：${topic}`, `参与：${personas.map((p) => p.name).join("、")}`, ""];
  for (const q of questions) {
    const roundStart = transcript.length;
    lines.push(`### 问题：${q}`);
    for (const p of personas) {
      let entry: SpeakEntry;
      try {
        const raw = await speaker.speak({
          persona: p,
          transcript: transcript.slice(-6).map(formatEntry),
          question: q,
          memory: memory ? await memory.read(p.id) : undefined,
        });
        const { to, text } = parseReply(raw);
        entry = { from: p.name, to, text };
      } catch (err) {
        // 单次发言失败不中断整场讨论
        entry = { from: p.name, text: `（发言失败：${err instanceof Error ? err.message : String(err)}）` };
      }
      transcript.push(entry);
      lines.push(formatEntry(entry), "");
    }
    // 本轮结束后：每个角色沉淀记忆（自己的发言+旧记忆→新记忆），供下一轮发言使用
    // 并行执行（各角色记忆互相独立），避免 8 次串行嵌套调用拖慢讨论
    if (memory) {
      const ownSpeech = (p: Persona) =>
        transcript
          .slice(roundStart)
          .filter((e) => e.from === p.name)
          .map((e) => e.text)
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
