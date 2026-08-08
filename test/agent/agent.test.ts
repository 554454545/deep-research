import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runStudy } from "../../src/agent/agent.js";
import { createFakeModel } from "../helpers/fake-model.js";
import { createCorpusSource } from "../../src/source/corpus.js";

/** 语料内容需覆盖 FakeModel 默认脚本的三个搜索词（按空格分词全部命中） */
const CORPUS_TEXT = [
  "# 图书馆调研语料",
  "大学生在宿舍学习成为主流，为什么不去图书馆成为热议话题。",
  "图书馆自习占座问题严重，学生吐槽不断。",
  "宿舍学习替代了图书馆的大部分功能。",
  "",
].join("\n");

async function makeCorpusDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dr-agent-corpus-"));
  await writeFile(path.join(dir, "library.md"), CORPUS_TEXT, "utf8");
  return dir;
}

test("FakeModel 端到端：不联网跑通完整研究流程（规划 → 侦察 → todo 推进 → 报告）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-run-"));
  const corpusDir = await makeCorpusDir();
  try {
    const steps: string[] = [];
    const { ws, text } = await runStudy({
      question: "为什么当代学生不再走进图书馆了？",
      model: createFakeModel(),
      workspacesRoot: root,
      sources: [createCorpusSource(corpusDir)],
      onStep: (toolName) => steps.push(toolName),
    });

    // 1. 工具调用顺序：规划 → 侦察 → 8 个 todo 并行推进 → 报告
    assert.equal(steps[0], "make_study_plan");
    assert.equal(steps[1], "scout_sources");
    assert.equal(steps.filter((s) => s === "update_todo").length, 8);
    assert.equal(steps.at(-1), "generate_report");

    // 2. plan.md 写入研究方案
    const plan = await readFile(path.join(ws.dir, "plan.md"), "utf8");
    assert.match(plan, /研究目标/);
    assert.match(plan, /JTBD/);

    // 3. 侦察真实落盘：scouting.md 含语料库命中的内容
    const scouting = await readFile(path.join(ws.dir, "notes", "scouting.md"), "utf8");
    assert.match(scouting, /library\.md/);
    assert.match(scouting, /占座/);

    // 4. todos 全部完成（并发写不丢）
    const onDisk = JSON.parse(await readFile(path.join(ws.dir, "todos.json"), "utf8")) as Array<{
      completed: boolean;
    }>;
    assert.ok(onDisk.every((t) => t.completed));

    // 5. report.md 生成、状态 done
    const report = await readFile(path.join(ws.dir, "report.md"), "utf8");
    assert.match(report, /核心发现/);
    assert.equal(ws.meta.status, "done");

    // 6. 最终回复文本
    assert.match(text, /研究完成/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(corpusDir, { recursive: true, force: true });
  }
});

test("stopWhen 封顶：模型反复调用工具也能终止", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-run-"));
  const corpusDir = await makeCorpusDir();
  try {
    const { ws } = await runStudy({
      question: "q",
      model: createFakeModel(), // 默认脚本 5 步，maxSteps 更小也能正常收束
      workspacesRoot: root,
      sources: [createCorpusSource(corpusDir)],
      maxSteps: 3,
    });
    assert.ok(ws.dir.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(corpusDir, { recursive: true, force: true });
  }
});
