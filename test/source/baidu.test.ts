import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBaiduHtml } from "../../src/source/baidu.js";

const SAMPLE_HTML = `<div id="content_left">
  <div class="result c-container" id="1">
    <h3 class="c-title"><a href="http://www.baidu.com/link?url=abc123" target="_blank">图书馆一座难求，有人占座不学习</a></h3>
    <div class="c-abstract">考研季图书馆<strong>占座</strong>大战每天上演，<em>吐槽</em>声一片，预约系统形同虚设。</div>
  </div>
  <div class="result c-container" id="2">
    <h3 class="t"><a href="https://zhihu.com/question/42">大学生为什么不去图书馆了？</a></h3>
    <span class="content-right_8Zs40">宿舍+降噪耳机成为主流自习方案，图书馆人流下降。</span>
  </div>
  <div class="result c-container" id="3">
    <h3 class="t"><a href="//baike.baidu.com/item/占座">占座（百度百科）</a></h3>
    <div class="c-abstract">占座指预先占据座位的行为。</div>
  </div>
</div>`;

test("parseBaiduHtml 提取标题/链接/摘要", () => {
  const rs = parseBaiduHtml(SAMPLE_HTML);
  assert.equal(rs.length, 3);
  assert.equal(rs[0].title, "图书馆一座难求，有人占座不学习");
  assert.equal(rs[0].url, "http://www.baidu.com/link?url=abc123");
  assert.match(rs[0].snippet, /占座/);
  assert.match(rs[0].snippet, /考研季/);
  assert.equal(rs[2].title, "占座（百度百科）");
  assert.equal(rs[2].url, "https://baike.baidu.com/item/占座"); // 协议相对链接补全
});

test("parseBaiduHtml 对空/无结果页返回空数组", () => {
  assert.deepEqual(parseBaiduHtml(""), []);
  assert.deepEqual(parseBaiduHtml("<html><body>no results</body></html>"), []);
});
