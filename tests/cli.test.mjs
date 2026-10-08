import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const cwd = new URL("..", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const server = (...args) =>
  spawnSync(process.execPath, ["scripts/server.mjs", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 10000,
  });

test("--version and --help print to stdout and exit 0 without listening", () => {
  for (const flag of ["--version", "-v"]) {
    const result = server(flag);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `stable-desk ${pkg.version}`);
  }
  for (const flag of ["--help", "-h"]) {
    const result = server(flag);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage: node scripts\/server\.mjs/);
    assert.match(result.stdout, /--port <number>/);
    assert.equal(result.stderr, "");
  }
});

test("missing values, invalid values and unknown flags exit 2 with usage on stderr", () => {
  for (const [args, message] of [
    [["--port"], /port/],
    [["--host"], /host/],
    [["--port", "4195", "--host"], /host/],
    [["--port", "70000"], /--port "70000"/],
    [["--port", "-1"], /port/],
    [["--port", "41x"], /--port "41x"/],
    [["--host", ""], /--host/],
    [["--bogus"], /--bogus/],
    [["extra"], /positional/],
  ]) {
    const result = server(...args);
    assert.equal(result.status, 2, `${args.join(" ")}: ${result.stdout}${result.stderr}`);
    assert.match(result.stderr, message, args.join(" "));
    assert.match(result.stderr, /Usage: node scripts\/server\.mjs/);
    assert.equal(result.stdout, "", args.join(" "));
  }
});

test("--port 0 still starts on a free loopback port with the startup line first", async () => {
  const child = spawn(
    process.execPath,
    ["scripts/server.mjs", "--host", "127.0.0.1", "--port", "0"],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const line = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Server startup timeout")), 5000);
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`Server exited ${code}`)));
      child.stdout.once("data", (chunk) => {
        clearTimeout(timer);
        resolve(String(chunk).split("\n")[0]);
      });
    });
    const match = line.match(/^Stable Desk: http:\/\/127\.0\.0\.1:(\d+) \(.+\)$/);
    assert.ok(match, line);
    assert.ok(Number(match[1]) > 0);
    const response = await fetch(`http://127.0.0.1:${match[1]}/`);
    assert.equal(response.status, 200);
    await response.body?.cancel();
  } finally {
    child.kill();
  }
});
