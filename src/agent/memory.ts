import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { Persona } from "../persona/persona.js";
import { readNote, writeNote } from "../workspace/workspace.js";
import type { Workspace } from "../workspace/workspace.js";

/** 记忆摘要器：把"该角色本轮发言 + 旧记忆"提炼成新的记忆（有信息量的才沉淀） */
export interface MemorySummarizer {
  summarize(persona: Persona, roundSpeech: string, oldMemory: string): Promise<string>;
}

/** LLM 摘要器：真实实现（嵌套 generateText 调用） */
export function createLLMSummarizer(model: LanguageModel): MemorySummarizer {
  return {
    async summarize(persona, roundSpeech, oldMemory) {
      const system = `你是 ${persona.name}（${persona.background}）。你在整理自己的记忆笔记本。
把【本轮发言】和【旧记忆】合并提炼成新的记忆，规则：
1. 只保留关键表态、被反驳/被认同的经历、立场演化——日常寒暄不进记忆；
2. 旧记忆里仍重要的保留，过时的丢弃；
3. 用第一人称，简洁条目式（每行一条），不超过 8 行。`;
      const content = `【旧记忆】\n${oldMemory || "（无）"}\n\n【本轮发言】\n${roundSpeech}\n\n请输出新的记忆。`;
      const result = await generateText({ model, system, messages: [{ role: "user", content }] });
      return result.text.trim();
    },
  };
}

/** 测试摘要器：确定性——把本轮自己的发言条目追加进记忆，不调模型 */
export function createOfflineSummarizer(): MemorySummarizer {
  return {
    async summarize(persona, roundSpeech, oldMemory) {
      const own = roundSpeech
        .split("\n")
        .filter((l) => l.includes(`${persona.name}：`))
        .map((l) => `- ${l.replace(`${persona.name}：`, "").slice(0, 60)}`);
      const merged = [...(oldMemory ? oldMemory.split("\n") : []), ...own];
      return merged.slice(-8).join("\n");
    },
  };
}

/**
 * 角色记忆存储：每个角色一份记忆（notes/persona-memory/<id>.md）。
 * 读：发言前取自己的记忆注入 prompt；写：每轮讨论后 consolidate 落盘。
 */
export interface PersonaMemoryStore {
  read(personaId: string): Promise<string>;
  /** 每轮结束后调用：自己的发言 + 旧记忆 → 新记忆 → 落盘 */
  consolidate(persona: Persona, ownSpeech: string): Promise<string>;
}

export function createPersonaMemoryStore(
  ws: Workspace,
  summarizer: MemorySummarizer
): PersonaMemoryStore {
  const section = (personaId: string) => `persona-memory/${personaId}`;

  return {
    async read(personaId: string): Promise<string> {
      return readNote(ws, section(personaId));
    },
    async consolidate(persona, ownSpeech) {
      const old = await readNote(ws, section(persona.id));
      const memory = await summarizer.summarize(persona, ownSpeech, old);
      await writeNote(ws, section(persona.id), memory + "\n");
      return memory;
    },
  };
}
