import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDiscussion } from "../../src/agent/discussion.js";
import { createOfflineSpeaker } from "../../src/agent/speaker.js";
import { createWorkspace } from "../../src/workspace/workspace.js";
import type { Persona } from "../../src/persona/persona.js";

const PERSONAS: Persona[] = [
  {
    id: "p_1",
    name: "阿哲",
    background: "大三考研党",
    traits: ["自律"],
    stance: "图书馆是战场",
    voice: "直接",
  evidence: ["library.md"],
  },
  {
    id: "p_2",
    name: "小萌",
    background: "大二氛围派",
    traits: ["感性"],
    stance: "咖啡馆更有灵感",
    voice: "活泼",
  evidence: ["library.md"],
  },
];

test("runDiscussion 问题×全员轮询发言，落盘并返回全文", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-disc-"));
  try {
    const ws = await createWorkspace(root, "为什么学生不去图书馆？");
    const full = await runDiscussion(ws, PERSONAS, "学习场所选择", ["你在哪学习？", "图书馆哪里不行？"], createOfflineSpeaker());

    // 顺序：q1→p1, q1→p2, q2→p1, q2→p2
    const names = full.match(/[阿哲|小萌]：/g);
    assert.equal(names?.length, 4);
    const idx = (n: string) => full.indexOf(`${n}：`);
    assert.ok(idx("阿哲") < idx("小萌"), "q1 阿哲先于小萌");
    assert.ok(full.indexOf("小萌", idx("小萌") + 1) > full.indexOf("阿哲", idx("阿哲") + 1), "q2 阿哲在第二个问题区");

    // 每个问题都出现
    assert.match(full, /问题：你在哪学习/);
    assert.match(full, /问题：图书馆哪里不行/);
    // 发言含角色立场（离线模板）
    assert.match(full, /阿哲：图书馆是战场/);
    assert.match(full, /小萌：咖啡馆更有灵感/);

    // 落盘 notes/discussion.md
    const onDisk = await readFile(path.join(ws.dir, "notes", "discussion.md"), "utf8");
    assert.match(onDisk, /阿哲：图书馆是战场/);
    assert.match(onDisk, /问题：图书馆哪里不行/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runDiscussion 单次发言失败不中断整场", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-disc-"));
  try {
    const ws = await createWorkspace(root, "q");
    const failingSpeaker = {
      speak: async () => {
        throw new Error("模型挂了");
      },
    };
    const full = await runDiscussion(ws, PERSONAS, "t", ["q1"], failingSpeaker);
    assert.match(full, /发言失败：模型挂了/);
    assert.match(full, /阿哲：/);
    assert.match(full, /小萌：/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runInterview 模式：单 persona 多轮，落盘 notes/interviews.md", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-disc-"));
  try {
    const ws = await createWorkspace(root, "q");
    const full = await runDiscussion(
      ws,
      [PERSONAS[0]],
      "一对一深度访谈",
      ["你最近一次去图书馆是什么时候？", "什么阻止你去？", "图书馆做什么你会回来？"],
      createOfflineSpeaker(),
      "interviews"
    );
    // 3 个问题 × 1 人 = 3 条发言
    assert.equal(full.match(/阿哲：/g)?.length, 3);
    const onDisk = await readFile(path.join(ws.dir, "notes", "interviews.md"), "utf8");
    assert.match(onDisk, /一对一深度访谈/);
    assert.match(onDisk, /什么阻止你去/);
    assert.match(onDisk, /阿哲：图书馆是战场/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
