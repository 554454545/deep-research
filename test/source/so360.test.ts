import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSo360Html } from "../../src/source/so360.js";

const SAMPLE_HTML = `<ul class="result">
  <li class="res-list">
    <h3 class="res-title"><a href="https://zhihu.com/question/1">现在的大学生怎么图书馆都不去了？</a></h3>
    <div class="res-rich"><span class="res-list-summary">现在的学生更喜欢在<em>宿舍</em>学习，图书馆人流下降。</span></div>
    <p class="g-linkinfo"><cite><a href="https://www.so.com/link?m=x">zhihu.com</a></cite></p>
  </li>
  <li class="res-list">
    <h3 class="res-title"><a href="//www.360kuai.com/pc/abc">关于大学生不愿意去图书馆的原因调查</a></h3>
    <span class="res-list-summary">调查显示占座问题、开放时间不足是主要<strong>原因</strong>。</span>
  </li>
  <li class="res-list">
    <h3 class="res-title"><a href="https://example.com/no-snippet">没有摘要的结果</a></h3>
    <p>只有这一行正文文本。</p>
  </li>
</ul>`;

test("parseSo360Html 提取标题/链接/摘要（含 em/strong 去标签与协议补全）", () => {
  const rs = parseSo360Html(SAMPLE_HTML);
  assert.equal(rs.length, 3);
  assert.equal(rs[0].title, "现在的大学生怎么图书馆都不去了？");
  assert.equal(rs[0].url, "https://zhihu.com/question/1");
  assert.match(rs[0].snippet, /宿舍/);
  assert.equal(rs[1].title, "关于大学生不愿意去图书馆的原因调查");
  assert.equal(rs[1].url, "https://www.360kuai.com/pc/abc");
  assert.match(rs[1].snippet, /占座/);
  assert.match(rs[2].snippet, /正文文本/); // 无摘要时兜底块文本
});

test("parseSo360Html 对空/无结果页返回空数组", () => {
  assert.deepEqual(parseSo360Html(""), []);
  assert.deepEqual(parseSo360Html("<html><body>no results</body></html>"), []);
});
