import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBilibiliSource,
  fetchWbiComments,
  fetchWbiSearch,
  getMixinKey,
  parseBiliComments,
  parseBiliVideoSearch,
  parseWbiReplies,
  parseWbiSearch,
} from "../../src/source/bilibili.js";

const SAMPLE = JSON.stringify({
  ok: true,
  data: [
    {
      bvid: "BV1D841197Tg",
      title: "<em class=\"keyword\">图书馆</em>为什么没人去？",
      author: "清风伴长剑",
      description: "去图书馆学习真的有必要吗？",
    },
    { bvid: "BV1C7dEYzEb4", title: "不想去图书馆怎么办", author: "Jack", description: "" },
    { id: "12678031", name: "这是用户不是视频", author: "x" },
  ],
});

test("parseBiliVideoSearch 解析视频搜索 JSON（去 HTML 标签/过滤非视频）", () => {
  const rs = parseBiliVideoSearch(SAMPLE);
  assert.equal(rs.length, 2);
  assert.equal(rs[0]!.title, "图书馆为什么没人去？");
  assert.equal(rs[0]!.url, "https://www.bilibili.com/video/BV1D841197Tg");
  assert.equal(rs[0]!.snippet, "去图书馆学习真的有必要吗？");
  assert.equal(rs[1]!.url, "https://www.bilibili.com/video/BV1C7dEYzEb4");
});

test("parseBiliVideoSearch 非法输入返回空数组", () => {
  assert.deepEqual(parseBiliVideoSearch("not json"), []);
  assert.deepEqual(parseBiliVideoSearch(""), []);
  assert.deepEqual(parseBiliVideoSearch('{"ok": true}'), []);
});

test("createBilibiliSource 无外部工具时走 wbi 直连（返回结构完整）", async () => {
  const src = createBilibiliSource(null, null); // 无 bili-cli、无 opencli
  assert.equal(src.name, "bilibili");
  const rs = await src.search("图书馆 占座", { limit: 3 });
  assert.ok(Array.isArray(rs));
  for (const r of rs) {
    assert.match(r.url, /^https:\/\/www\.bilibili\.com\/video\//);
  }
});

const COMMENTS_SAMPLE = JSON.stringify([
  { rank: 1, rpid: "1", author: "哈儿", text: "家里真学不下去，不是自制力不行，而是父母会突然的说你。", likes: 23 },
  { rank: 2, rpid: "2", author: "麻酱", text: "图书馆的氛围真的很好，一个人去心情太好了。", likes: 6 },
  { rank: 3, rpid: "3", author: "张三", text: "评论三", likes: 1 },
  { rank: 4, rpid: "4", author: "李四", text: "评论四", likes: 0 },
]);

test("parseBiliComments 解析评论 JSON（限 8 条）", () => {
  const cs = parseBiliComments(COMMENTS_SAMPLE, 8);
  assert.equal(cs.length, 4); // 样例只有 4 条
  assert.equal(cs[0]!.author, "哈儿");
  assert.match(cs[0]!.text, /父母会突然的说你/);
});

test("parseBiliComments 长评论保留 300 字", () => {
  const long = JSON.stringify([{ author: "A", text: "长".repeat(500) }]);
  const cs = parseBiliComments(long);
  assert.equal(cs[0]!.text.length, 300);
});

test("parseBiliComments 非法输入返回空数组", () => {
  assert.deepEqual(parseBiliComments("not json"), []);
  assert.deepEqual(parseBiliComments("[]"), []);
});

test("getMixinKey 由 img_key+sub_key 生成 32 位密钥", () => {
  // 公开算法已知样例：img_key=7cd084941338484aae1ad9425b84077c sub_key=4932caff0ff746eab6f01bf08b70ac45
  const key = getMixinKey("7cd084941338484aae1ad9425b84077c4932caff0ff746eab6f01bf08b70ac45");
  assert.equal(key.length, 32);
  assert.equal(key, "ea1db124af3c7062474693fa704f4ff8");
});

const WBI_SAMPLE = {
  code: 0,
  data: {
    replies: [
      { rpid: "1", member: { uname: "哈儿" }, content: { message: "家里真学不下去，父母会突然说你。" } },
      { rpid: "2", member: { uname: "麻酱" }, content: { message: "图书馆氛围很好。" } },
      { rpid: "3", member: { uname: "张三" }, content: { message: "第三。" } },
      { rpid: "4", member: { uname: "李四" }, content: { message: "第四。" } },
      { rpid: "5", member: { uname: "王五" }, content: { message: "第五。" } },
    ],
  },
};

test("parseWbiReplies 解析评论 API 响应（限 8 条）", () => {
  const cs = parseWbiReplies(WBI_SAMPLE, 8);
  assert.equal(cs.length, 5);
  assert.equal(cs[0]!.author, "哈儿");
  assert.match(cs[0]!.text, /父母会突然说你/);
});

test("parseWbiReplies 无评论/非法结构返回空数组", () => {
  assert.deepEqual(parseWbiReplies({ code: 0, data: { replies: null } }), []);
  assert.deepEqual(parseWbiReplies("x"), []);
});

test("fetchWbiComments 直连 B站评论 API（真实网络，免浏览器）", async () => {
  const cs = await fetchWbiComments("BV1D841197Tg", 3);
  assert.ok(cs.length >= 1, "应拉到至少 1 条评论");
  assert.ok(cs[0]!.author.length > 0);
  assert.ok(cs[0]!.text.length > 0);
});

const SEARCH_SAMPLE = {
  code: 0,
  data: {
    result: [
      { bvid: "BV1D841197Tg", title: '<em class="keyword">图书馆</em>为什么没人去？', description: "去图书馆学习真的有必要吗？" },
      { bvid: "BV1C7dEYzEb4", title: "不想去图书馆怎么办", description: "" },
      { id: "12678031", name: "不是视频", author: "x" },
    ],
  },
};

test("parseWbiSearch 解析搜索 API 响应（去标签/过滤非视频）", () => {
  const rs = parseWbiSearch(SEARCH_SAMPLE);
  assert.equal(rs.length, 2);
  assert.equal(rs[0]!.title, "图书馆为什么没人去？");
  assert.equal(rs[0]!.url, "https://www.bilibili.com/video/BV1D841197Tg");
  assert.equal(rs[1]!.url, "https://www.bilibili.com/video/BV1C7dEYzEb4");
});

test("parseWbiSearch 无结果返回空数组", () => {
  assert.deepEqual(parseWbiSearch({ code: 0, data: { result: null } }), []);
  assert.deepEqual(parseWbiSearch("x"), []);
});

test("fetchWbiSearch 直连 B站搜索 API（真实网络，免浏览器）", async () => {
  const rs = await fetchWbiSearch("图书馆 占座", 3);
  assert.ok(rs.length >= 1, "应拉到至少 1 条结果");
  assert.match(rs[0]!.url, /^https:\/\/www\.bilibili\.com\/video\//);
});
