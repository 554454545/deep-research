import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpeakPrompt, createOfflineSpeaker } from "../../src/agent/speaker.js";
import type { Persona } from "../../src/persona/persona.js";

const PERSONA: Persona = {
  id: "p_1",
  name: "阿哲",
  background: "大三考研党，每天 7:30 排队抢座",
  traits: ["自律", "秩序感强"],
  stance: "图书馆是战场，占座必须严格管理",
  voice: "直接、语速快",
  evidence: ["library.md"],
};

test("buildSpeakPrompt 注入完整角色卡与上下文", () => {
  const { system, messages } = buildSpeakPrompt({
    persona: PERSONA,
    transcript: ["小明：宿舍更舒服", "小红：咖啡馆有氛围"],
    question: "你平时在哪学习？",
  });
  assert.match(system, /你是阿哲/);
  assert.match(system, /大三考研党/);
  assert.match(system, /自律、秩序感强/);
  assert.match(system, /图书馆是战场/);
  assert.match(system, /直接、语速快/);
  assert.match(system, /主观因素|动机、情感与权衡/);
  assert.match(messages[0].content, /小明：宿舍更舒服/);
  assert.match(messages[0].content, /当前问题：你平时在哪学习/);
  assert.match(messages[0].content, /请以阿哲的身份发言/);
});

test("buildSpeakPrompt 无讨论记录时直接给问题", () => {
  const { messages } = buildSpeakPrompt({ persona: PERSONA, transcript: [], question: "q" });
  assert.ok(!messages[0].content.includes("讨论记录"));
  assert.match(messages[0].content, /当前问题：q/);
});

test("createOfflineSpeaker 确定性输出：含立场与问题，两次一致，不含名字前缀", async () => {
  const speaker = createOfflineSpeaker();
  const ctx = { persona: PERSONA, transcript: [], question: "为什么不去图书馆" };
  const a = await speaker.speak(ctx);
  const b = await speaker.speak(ctx);
  assert.match(a, /图书馆是战场，占座必须严格管理/);
  assert.match(a, /为什么不去图书馆/);
  assert.ok(!a.includes("阿哲："));
  assert.equal(a, b);
});
