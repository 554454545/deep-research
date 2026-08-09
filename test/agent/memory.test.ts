import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOfflineSummarizer, createPersonaMemoryStore } from "../../src/agent/memory.js";
import { createWorkspace } from "../../src/workspace/workspace.js";
import type { Persona } from "../../src/persona/persona.js";

const PERSONA: Persona = {
  id: "p_1",
  name: "阿哲",
  background: "大三考研党",
  traits: ["自律"],
  stance: "图书馆是战场",
  voice: "直接",
  evidence: ["library.md"],
};

test("consolidate 沉淀记忆并落盘，read 读回", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-mem-"));
  try {
    const ws = await createWorkspace(root, "q");
    const store = createPersonaMemoryStore(ws, createOfflineSummarizer());

    // 初始无记忆
    assert.equal(await store.read(PERSONA.id), "");

    // 第一轮：本轮发言含自己的话 → 沉淀
    await store.consolidate(PERSONA, "阿哲：图书馆是我的战场\n小萌：咖啡馆才有灵感\n");
    const m1 = await store.read(PERSONA.id);
    assert.match(m1, /图书馆是我的战场/);
    assert.ok(!m1.includes("小萌"), "记忆只记自己的话，不记别人的");

    // 第二轮：旧记忆保留 + 新发言追加
    await store.consolidate(PERSONA, "阿哲：占座必须管\n小萌：太严格了\n");
    const m2 = await store.read(PERSONA.id);
    assert.match(m2, /图书馆是我的战场/);
    assert.match(m2, /占座必须管/);

    // 落盘文件存在
    const onDisk = await readFile(path.join(ws.dir, "notes", "persona-memory", "p_1.md"), "utf8");
    assert.ok(onDisk.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
