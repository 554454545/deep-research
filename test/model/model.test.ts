import { test } from "node:test";
import assert from "node:assert/strict";
import { getModel } from "../../src/model/model.js";
import { createFakeModel } from "../../src/model/fake.js";

test("getModel 缺 key 时抛明确错误（懒加载）", () => {
  const prev = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.throws(() => getModel(), /DEEPSEEK_API_KEY 未配置/);
  } finally {
    if (prev !== undefined) process.env.DEEPSEEK_API_KEY = prev;
  }
});

test("createFakeModel 是离线确定性应答器（LanguageModelV2 形状）", () => {
  const model = createFakeModel();
  assert.equal(model.specificationVersion, "v2");
  assert.equal(model.provider, "fake");
  assert.equal(model.modelId, "fake-offline");
  assert.equal(typeof model.doGenerate, "function");
});
