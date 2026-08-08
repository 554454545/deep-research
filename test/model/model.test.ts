import { test } from "node:test";
import assert from "node:assert/strict";
import { getModel } from "../../src/model/model.js";

test("getModel 缺 key 时抛明确错误（懒加载）", () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.throws(() => getModel(), /DEEPSEEK_API_KEY 未配置/);
  } finally {
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
  }
});
