import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRelevant, parseBingHtml } from "../../src/source/bing.js";

const SAMPLE_HTML = `<ol id="b_results">
  <li class="b_algo">
    <h2><a href="https://zhihu.com/question/123">大学生为什么不去图书馆了？</a></h2>
    <div class="b_caption"><p>现在的学生更喜欢在<strong>宿舍</strong>和咖啡馆学习，图书馆&nbsp;人流下降。</p></div>
  </li>
  <li class="b_algo">
    <h2><a href="https://example.com/456">图书馆占座乱象：抢座大战每天都在上演</a></h2>
    <p>占座问题严重，<strong>吐槽</strong>不断，预约系统形同虚设。</p>
  </li>
  <li class="b_noresult">无结果</li>
</ol>`;

test("parseBingHtml 提取标题/链接/摘要并去标签解码实体", () => {
  const results = parseBingHtml(SAMPLE_HTML);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "大学生为什么不去图书馆了？");
  assert.equal(results[0].url, "https://zhihu.com/question/123");
  assert.equal(results[0].snippet, "现在的学生更喜欢在宿舍和咖啡馆学习，图书馆 人流下降。");
  assert.equal(results[1].title, "图书馆占座乱象：抢座大战每天都在上演");
  assert.match(results[1].snippet, /吐槽/);
});

test("parseBingHtml 对空/无结果页返回空数组", () => {
  assert.deepEqual(parseBingHtml(""), []);
  assert.deepEqual(parseBingHtml("<html><body>no results</body></html>"), []);
});

test("filterRelevant 滤掉与查询无 2 字共组的字典页/异语种页，保留相关结果", () => {
  const results = [
    { title: "为（汉语文字）_百度百科", url: "https://baike.baidu.com/1", snippet: "为的本义是作、做，是个特殊的动词" },
    { title: "大学生为什么不去图书馆？", url: "https://zhihu.com/q1", snippet: "现在的学生更喜欢在宿舍学习，图书馆人流下降" },
    { title: "English title", url: "https://example.com/en", snippet: "university library research" },
  ];
  const kept = filterRelevant(results, "大学生 为什么不去图书馆 原因");
  assert.deepEqual(kept.map((r) => r.title), ["大学生为什么不去图书馆？"]);
});

test("filterRelevant 纯英文查询无中文共组判定，不做过滤", () => {
  const results = [
    { title: "English title", url: "https://example.com/en", snippet: "university library research" },
  ];
  assert.equal(filterRelevant(results, "university library").length, 1);
});
