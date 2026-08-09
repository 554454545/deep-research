import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendNote,
  createWorkspace,
  loadWorkspace,
  todosText,
  updateTodo,
} from "../../src/workspace/workspace.js";

async function tmpRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "dr-ws-"));
}

test("createWorkspace 建目录与初始状态", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "为什么学生不去图书馆？");
    assert.equal(ws.todos.length, 8);
    assert.ok(ws.todos.every((t) => !t.completed));
    assert.equal(ws.meta.status, "planning");
    assert.equal(ws.meta.question, "为什么学生不去图书馆？");
    const plan = await readFile(path.join(ws.dir, "plan.md"), "utf8");
    assert.match(plan, /为什么学生不去图书馆/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("工作区目录名可读：问题关键词 + 时间戳", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "为什么学生不去图书馆？");
    assert.match(path.basename(ws.dir), /^\d+-为什么学生不去图书馆-\d{6}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updateTodo 修改内存并落盘，loadWorkspace 可恢复", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "q");
    await updateTodo(ws, 0, true);
    assert.equal(ws.todos[0].completed, true);
    const restored = await loadWorkspace(ws.dir);
    assert.equal(restored.todos[0].completed, true);
    assert.equal(restored.todos[1].completed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("updateTodo 越界抛错", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "q");
    await assert.rejects(() => updateTodo(ws, 8, true), /越界/);
    await assert.rejects(() => updateTodo(ws, -1, true), /越界/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("并发 updateTodo 不互相覆盖（写队列串行落盘）", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "q");
    // AI SDK 同一步多工具调用并行：8 个 update_todo 同时执行
    await Promise.all(Array.from({ length: 8 }, (_, i) => updateTodo(ws, i, true)));
    const onDisk = JSON.parse(await readFile(path.join(ws.dir, "todos.json"), "utf8")) as Array<{
      completed: boolean;
    }>;
    assert.equal(onDisk.length, 8);
    assert.ok(onDisk.every((t) => t.completed), "磁盘上的 todos 应全部完成，不允许被旧快照覆盖");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("appendNote 多次追加内容都保留", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "q");
    await appendNote(ws, "discussion", "第一轮纪要");
    await appendNote(ws, "discussion", "第二轮纪要");
    const content = await readFile(path.join(ws.dir, "notes", "discussion.md"), "utf8");
    assert.match(content, /第一轮纪要/);
    assert.match(content, /第二轮纪要/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("todosText 输出模型可读文本", async () => {
  const root = await tmpRoot();
  try {
    const ws = await createWorkspace(root, "q");
    await updateTodo(ws, 0, true);
    const text = todosText(ws);
    assert.match(text, /\[x\] 0\. 需求澄清/);
    assert.match(text, /\[ \] 1\. 研究设计/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
