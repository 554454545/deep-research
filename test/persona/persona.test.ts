import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createWorkspace, readPersonas, writePersonas } from "../../src/workspace/workspace.js";
import { PersonaSchema, type Persona } from "../../src/persona/persona.js";

const PERSONA: Persona = {
  id: "p_1",
  name: "阿哲",
  background: "大三考研党，每天 7:30 排队抢座",
  traits: ["自律", "秩序感强"],
  stance: "图书馆是战场，占座必须严格管理",
  voice: "直接、略带焦虑",
  evidence: ["library.md"],
};

test("writePersonas 落盘 personas.json，readPersonas 读回一致", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-persona-"));
  try {
    const ws = await createWorkspace(root, "为什么学生不去图书馆？");
    await writePersonas(ws, [PERSONA]);

    const onDisk = JSON.parse(
      await readFile(path.join(ws.dir, "personas.json"), "utf8")
    ) as Persona[];
    assert.equal(onDisk.length, 1);
    assert.deepEqual(onDisk[0], PERSONA);

    const restored = await readPersonas(ws);
    assert.deepEqual(restored, [PERSONA]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writePersonas 非法角色卡抛错（name 为空）", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-persona-"));
  try {
    const ws = await createWorkspace(root, "q");
    await assert.rejects(
      () => writePersonas(ws, [{ ...PERSONA, name: "" }]),
      (err: unknown) => err instanceof z.ZodError
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("readPersonas 文件缺失返回空数组", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dr-persona-"));
  try {
    const ws = await createWorkspace(root, "q");
    assert.deepEqual(await readPersonas(ws), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PersonaSchema 通过合法对象", () => {
  assert.ok(PersonaSchema.safeParse(PERSONA).success);
});
