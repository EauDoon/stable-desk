import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readBoundedUtf8 } from "../scripts/read-bounded.mjs";

test("bounded import reads exact limits, Unicode and empty files; rejects oversized and invalid UTF-8", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bounded-import-"));
  const file = join(dir, "export.json");
  try {
    await writeFile(file, "é");
    assert.equal(await readBoundedUtf8(file, 2), "é");
    await assert.rejects(readBoundedUtf8(file, 1), /exceeds/);
    await writeFile(file, "\uFEFF{}");
    assert.equal(await readBoundedUtf8(file, 5), "\uFEFF{}");
    await writeFile(file, "");
    assert.equal(await readBoundedUtf8(file, 0), "");
    await writeFile(file, Buffer.from([0xc3, 0x28]));
    await assert.rejects(readBoundedUtf8(file, 2), /encoded data/);
    await assert.rejects(readBoundedUtf8(dir, 20), /regular file/);
    await assert.rejects(readBoundedUtf8(file, -1), /Invalid byte limit/);
    await writeFile(file, "a".repeat(131072));
    assert.equal((await readBoundedUtf8(file, 131072)).length, 131072);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("named pipes are rejected without waiting for a writer", { skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "bounded-fifo-"));
  const pipe = join(dir, "input.json");
  try {
    const created = spawnSync("mkfifo", [pipe], { encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const script = fileURLToPath(new URL("../scripts/change-report.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, pipe], { encoding: "utf8", timeout: 3000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /regular file/);
    assert.equal(result.stdout, "");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
