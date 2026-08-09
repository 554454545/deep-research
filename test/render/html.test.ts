import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReport, renderHtmlReport } from "../../src/render/html.js";

const SAMPLE_REPORT = `# 大学图书馆到馆率提升洞察报告

> 研究问题：为什么当代学生不再走进图书馆了？

## 研究背景
大学图书馆正面临悖论：馆舍扩建、资源扩充，但学生到馆日益稀少。

## 核心研究问题
- 学生真正在图书馆里要完成什么任务？
- 是什么摩擦将学生推向替代场所？

## 核心发现
### 发现 01：学生不是不想学习，而是图书馆未能提供确定性
确定有电、确定有网、确定有座。
来源：https://www.zhihu.com/question/123、corpus/library.md
### 发现 02：图书馆的竞争对手是宿舍+咖啡馆
技术宅在宿舍建驾驶舱。

## 用户画像
- 考研党·阿哲（高频）：需要稳定座位

## 需求分层（KANO）
### 基础需求 · MUST-HAVE（缺失即流失）
- 稳定可用的供电插座
### 期望需求 · PERFORMANCE（越好越满意）
- 物理隔断的分区管理
### 惊喜需求 · DELIGHTER（超出预期）
- 独立预约式研修间

## 策略建议
- **P1 立即**：建立插座损坏响应机制（基础设施失守是流失第一触发点）

## 用户原声
- 图书馆免费，但来回折腾浪费时间（林晓）

## 研究过程
- [x] 需求澄清
- [ ] 洞察报告
`;

test("parseReport 解析报告各板块", () => {
  const s = parseReport(SAMPLE_REPORT);
  assert.equal(s.title, "大学图书馆到馆率提升洞察报告");
  assert.equal(s.question, "为什么当代学生不再走进图书馆了？");
  assert.match(s.background, /悖论/);
  assert.equal(s.coreQuestions.length, 2);
  assert.equal(s.findings.length, 2);
  assert.equal(s.findings[0]!.title, "学生不是不想学习，而是图书馆未能提供确定性");
  assert.match(s.findings[0]!.detail, /确定有电/);
  assert.deepEqual(s.findings[0]!.sources, ["https://www.zhihu.com/question/123", "corpus/library.md"]);
  assert.equal(s.findings[1]!.sources.length, 0);
  assert.equal(s.personas.length, 1);
  assert.deepEqual(s.needs.must, ["稳定可用的供电插座"]);
  assert.deepEqual(s.needs.performance, ["物理隔断的分区管理"]);
  assert.deepEqual(s.needs.delight, ["独立预约式研修间"]);
  assert.match(s.recommendations[0]!, /P1 立即/);
  assert.match(s.quotes[0]!, /林晓/);
  assert.equal(s.todos.length, 2);
});

test("renderHtmlReport 输出自包含 HTML（含关键板块与统计徽章）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-html-"));
  try {
    await writeFile(path.join(root, "report.md"), SAMPLE_REPORT, "utf8");
    await writeFile(
      path.join(root, "personas.json"),
      JSON.stringify([{ name: "阿哲" }, { name: "小萌" }]),
      "utf8"
    );
    const html = await renderHtmlReport(root);
    assert.match(html, /INSIGHT RESEARCH REPORT/);
    assert.match(html, /大学图书馆到馆率提升洞察报告/);
    assert.match(html, /核心发现/);
    assert.match(html, /需求分层（KANO）/);
    assert.match(html, /MUST-HAVE/);
    assert.match(html, /<a href="https:\/\/www\.zhihu\.com\/question\/123"/);
    assert.match(html, /finding-src/);
    assert.match(html, /策略建议/);
    assert.match(html, /用户原声/);
    assert.match(html, /2<\/div><div class="label">研究画像/);
    assert.match(html, /<html/);
    assert.match(html, /<\/html>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
