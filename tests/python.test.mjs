import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { candidates, findPython, runPython } from "../scripts/python.mjs";

// A fake spawn: `works` lists the commands that pass the Python 3 probe;
// `exit` is the status the script run returns.
function fakeSpawn(works, exit = 0, calls = []) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes("-c"))
      return works.includes(command) ? { status: 0 } : { status: 9009 };
    return { status: exit };
  };
}

test("candidates try PYTHON, python3, python, then py -3 on Windows only", () => {
  assert.deepEqual(candidates({}, "linux").map((c) => c.command), ["python3", "python"]);
  assert.deepEqual(candidates({}, "win32"), [
    { command: "python3", args: [] },
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
  ]);
  assert.deepEqual(candidates({ PYTHON: " /opt/py/bin/python3.12 " }, "linux")[0], {
    command: "/opt/py/bin/python3.12",
    args: [],
  });
  assert.equal(candidates({ PYTHON: "  " }, "linux")[0].command, "python3");
});

test("a stub or Python 2 that fails the probe is skipped", () => {
  // A standard Windows install: the python3 alias is a Store stub.
  assert.deepEqual(findPython({ env: {}, platform: "win32", spawn: fakeSpawn(["python"]) }), {
    command: "python",
    args: [],
  });
  assert.deepEqual(findPython({ env: {}, platform: "win32", spawn: fakeSpawn(["py"]) }), {
    command: "py",
    args: ["-3"],
  });
  assert.equal(findPython({ env: {}, platform: "linux", spawn: fakeSpawn(["py"]) }), null);
  // A spawn error (command not found) is a miss, not a crash.
  const missing = () => ({ error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }) });
  assert.equal(findPython({ env: {}, platform: "linux", spawn: missing }), null);
});

test("the script runs with the found interpreter, inherited stdio and no console window", () => {
  const calls = [];
  const code = runPython(["scripts/package.py", "out.zip"], {
    env: {},
    platform: "win32",
    spawn: fakeSpawn(["py"], 0, calls),
    log: () => {},
  });
  assert.equal(code, 0);
  const run = calls.at(-1);
  assert.equal(run.command, "py");
  assert.deepEqual(run.args, ["-3", "scripts/package.py", "out.zip"]);
  assert.equal(run.options.stdio, "inherit");
  assert.ok(calls.every((c) => c.options.windowsHide === true));
});

test("the script's exit code is passed through, including the audit's 2", () => {
  for (const exit of [0, 1, 2]) {
    const code = runPython(["scripts/audit-content.py"], {
      env: {},
      platform: "linux",
      spawn: fakeSpawn(["python3"], exit),
      log: () => {},
    });
    assert.equal(code, exit);
  }
  // A run killed by a signal has no status: report failure.
  const killed = (command, args) => (args.includes("-c") ? { status: 0 } : { status: null, signal: "SIGTERM" });
  assert.equal(runPython(["x.py"], { env: {}, platform: "linux", spawn: killed, log: () => {} }), 1);
});

test("with no Python 3 it prints one line naming PYTHON and exits 1; with no script it exits 2", () => {
  const lines = [];
  const code = runPython(["scripts/package.py"], {
    env: {},
    platform: "win32",
    spawn: fakeSpawn([]),
    log: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^No Python 3 interpreter found .*set PYTHON to its path\.$/);
  const usage = [];
  assert.equal(runPython([], { log: (line) => usage.push(line) }), 2);
  assert.match(usage[0], /^Usage: node scripts\/python\.mjs <script\.py>/);
});

test("the resolver runs a real script on this machine's Python 3", () => {
  const result = spawnSync(process.execPath, ["scripts/python.mjs", "-c", "print('python-ok')"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.status === 1 && /No Python 3 interpreter found/.test(result.stderr)) return;
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "python-ok");
});
