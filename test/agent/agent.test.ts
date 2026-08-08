import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runStudy } from "../../src/agent/agent.js";
import { createFakeModel } from "../../src/model/fake.js";

test("FakeModel 端到端：离线跑通完整研究流程（规划 → todo 推进 → 报告）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-run-"));
  try {
    const steps: string[] = [];
    const { ws, text } = await runStudy({
      question: "为什么当代学生不再走进图书馆了？",
      model: createFakeModel(),
      workspacesRoot: root,
      onStep: (toolName) => steps.push(toolName),
    });

    // 1. 工具调用顺序：先规划，再 8 个 todo 并行推进，最后报告
    assert.equal(steps[0], "make_study_plan");
    assert.equal(steps.filter((s) => s === "update_todo").length, 8);
    assert.equal(steps.at(-1), "generate_report");

    // 2. plan.md 写入研究方案
    const plan = await readFile(path.join(ws.dir, "plan.md"), "utf8");
    assert.match(plan, /研究目标/);
    assert.match(plan, /JTBD/);

    // 3. todos 全部完成（并发写不丢）
    const onDisk = JSON.parse(await readFile(path.join(ws.dir, "todos.json"), "utf8")) as Array<{
      completed: boolean;
    }>;
    assert.ok(onDisk.every((t) => t.completed));

    // 4. report.md 生成、状态 done
    const report = await readFile(path.join(ws.dir, "report.md"), "utf8");
    assert.match(report, /核心发现/);
    assert.equal(ws.meta.status, "done");

    // 5. 最终回复文本
    assert.match(text, /研究完成/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stopWhen 封顶：模型反复调用工具也能终止", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-run-"));
  try {
    const { ws } = await runStudy({
      question: "q",
      model: createFakeModel(), // 默认脚本 4 步，maxSteps 更小也能正常收束
      workspacesRoot: root,
      maxSteps: 3,
    });
    assert.ok(ws.dir.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
