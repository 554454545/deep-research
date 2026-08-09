import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { Persona } from "../persona/persona.js";

// 一次发言的上下文：角色卡 + 公开讨论记录（最近几条）+ 当前问题 + 角色自己的记忆
export interface SpeakContext {
  persona: Persona;         // 谁在说
  transcript: string[];     // 公开讨论的记录
  question: string;         // 当前要回答的问题
  memory?: string;          // 该角色自己的长期记忆（私密），可选
}

// 发言器：多角色模拟的演员——给角色卡和上下文，返回该角色的发言
export interface PersonaSpeaker {
  speak(ctx: SpeakContext): Promise<string>;
}

/**
 * 构造发言人 prompt（纯函数，可单测）。
 * system：角色卡全量注入（名字/背景/性格/立场/说话风格）+ 聚焦主观因素的发言要求。
 * messages：公开讨论记录（最近 6 条 -- 需要改）+ 当前问题。
 * 输出：角色设定, user 消息
 */
export function buildSpeakPrompt(ctx: SpeakContext): {
  system: string;
  messages: Array<{ role: "user"; content: string }>;
} {
  const { persona, transcript, question } = ctx;
  const system = [
    `你是${persona.name}。${persona.background}`,
    `性格：${persona.traits.join("、")}。`,
    `你对本次讨论的态度：${persona.stance}。`,
    `说话风格：${persona.voice}。`,
    ctx.memory ? `你的记忆（之前说过的话、经历过的讨论）：\n${ctx.memory}` : "",
    `你正在参加一场焦点小组讨论，请以第一人称发言（80-200 字）。基于自己的真实情况，讲清你的动机、情感与权衡——为什么这么选、什么在推动你的决定。可以回应别人刚才说的话，也可以呼应你自己之前的立场，绝不要说"作为AI"之类的话。`,
  ]
    .filter(Boolean)
    .join("\n");
  const history = transcript.slice(-6).join("\n");
  const content = `${history ? `讨论记录：\n${history}\n\n` : ""}当前问题：${question}\n请以${persona.name}的身份发言。`;
  return { system, messages: [{ role: "user", content }] };
}

/** 
 * 真实实现：同一个 LLM 按角色卡生成发言 
 * 让模型能演受访者*/
export function createLLMSpeaker(model: LanguageModel): PersonaSpeaker {
  return {
    async speak(ctx) {
      const { system, messages } = buildSpeakPrompt(ctx);
      const result = await generateText({ model, system, messages });
      return result.text.trim();
    },
  };
}

// 测试实现：确定性模板，不调模型不花钱（返回纯发言内容，名字前缀由引擎统一加）
export function createOfflineSpeaker(): PersonaSpeaker {
  return {
    async speak(ctx) {
      return `${ctx.persona.stance}。我认为“${ctx.question}”的关键在于${ctx.persona.traits[0]}。`;
    },
  };
}
