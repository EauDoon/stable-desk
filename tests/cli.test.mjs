import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

// A Node stack trace on stderr ("    at file:///...") means a crash, not a message.
const stackTrace = /^\s+at /m;

test("an address this machine cannot bind exits 2 with usage, not a stack trace", () => {
  // 192.0.2.1 is reserved for documentation (RFC 5737), so no interface has it
  // and listen fails at once with no DNS lookup.
  const result = server("--host", "192.0.2.1", "--port", "0");
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /--host "192\.0\.2\.1"/);
  assert.match(result.stderr, /Usage: node scripts\/server\.mjs/);
  assert.doesNotMatch(result.stderr, stackTrace);
  assert.equal(result.stdout, "");
});

test("a port already in use exits 1 with one line, not a stack trace", async () => {
  const busy = createServer();
  await new Promise((resolve) => busy.listen(0, "127.0.0.1", resolve));
  try {
    const port = String(busy.address().port);
    const result = server("--host", "127.0.0.1", "--port", port);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`127\\.0\\.0\\.1:${port}.*already in use`));
    assert.match(result.stderr, /--port/);
    assert.doesNotMatch(result.stderr, stackTrace);
    assert.equal(result.stdout, "");
  } finally {
    await new Promise((resolve) => busy.close(resolve));
  }
});

test("--dist without a build exits 1 and says to build first", async () => {
  // The server serves the dist/ beside its own scripts/ folder, so run a copy
  // of it, with copies of the modules it imports, from a folder with no dist/.
  // The folder sits inside the repository, so cheerio still resolves.
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  const fixture = await mkdtemp(fileURLToPath(new URL("../test-results/cli-", import.meta.url)));
  try {
    for (const path of ["scripts/server.mjs", "server", "src", "vercel.json"])
      await cp(fileURLToPath(new URL(`../${path}`, import.meta.url)), join(fixture, path), { recursive: true });
    const result = spawnSync(process.execPath, [join(fixture, "scripts", "server.mjs"), "--dist", "--port", "0"], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /dist\/ does not exist/);
    assert.match(result.stderr, /npm run build/);
    assert.doesNotMatch(result.stderr, stackTrace);
    assert.equal(result.stdout, "");
  } finally {
    await rm(fixture, { recursive: true, force: true });
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
