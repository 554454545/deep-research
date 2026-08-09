import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFileLogger, createNullLogger } from "../src/logger.js";

test("createFileLogger 写 JSONL 日志文件", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dr-log-"));
  try {
    const logger = createFileLogger(dir, "test-run");
    logger.info("study_started", { question: "q" });
    logger.tool("scout_sources", { queries: ["a"] });
    logger.error("study_failed", { message: "boom" });

    const content = await readFile(path.join(dir, "test-run.log"), "utf8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 3);
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(first.event, "study_started");
    assert.equal(first.level, "info");
    assert.ok(typeof first.ts === "string");
    const tool = JSON.parse(lines[1]) as Record<string, unknown>;
    assert.equal(tool.tool, "scout_sources");
    assert.equal(JSON.parse(lines[2] as string).level, "error");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("createNullLogger 不产生任何输出", async () => {
  const logger = createNullLogger();
  logger.info("x", {});
  logger.tool("y", {});
  logger.error("z", {});
  // 不抛错即通过；空实现无副作用
  assert.ok(true);
});
