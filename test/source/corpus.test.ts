import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCorpusSource } from "../../src/source/corpus.js";

async function makeCorpus(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "dr-corpus-"));
  await mkdir(path.join(dir, "sub"), { recursive: true });
  await writeFile(
    path.join(dir, "library.md"),
    "大学生在宿舍学习成为主流，为什么不去图书馆成为热议话题。\n图书馆自习占座问题严重，学生吐槽不断。\n宿舍学习替代了图书馆的大部分功能。\n",
    "utf8"
  );
  await writeFile(path.join(dir, "sub", "cafe.txt"), "咖啡馆适合自习，消费高但有氛围。\n", "utf8");
  return dir;
}

test("corpus 检索：关键词全部命中才返回，含子目录与正文片段", async () => {
  const dir = await makeCorpus();
  try {
    const src = createCorpusSource(dir);
    const rs = await src.search("图书馆 占座 吐槽", { limit: 5 });
    assert.equal(rs.length, 1);
    assert.equal(rs[0].title, "library.md");
    assert.match(rs[0].snippet, /占座/);
    assert.equal(rs[0].url, path.join(dir, "library.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("corpus 检索：子目录文件可命中、无匹配词返回空", async () => {
  const dir = await makeCorpus();
  try {
    const src = createCorpusSource(dir);
    const cafe = await src.search("咖啡馆 氛围");
    assert.equal(cafe.length, 1);
    assert.equal(cafe[0].title, "cafe.txt");
    const none = await src.search("绝对不存在的词");
    assert.deepEqual(none, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("corpus 检索：目录不存在返回空不抛错", async () => {
  const src = createCorpusSource("/nonexistent/xyz");
  assert.deepEqual(await src.search("任意词"), []);
});
