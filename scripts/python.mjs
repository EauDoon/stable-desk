// Runs a repository Python script with the first working Python 3, so
// `npm run package` and `npm run audit:content` work on a standard Windows
// install, which has `py` and `python` but no `python3`.
//
//   node scripts/python.mjs <script.py> [args...]
//
// Candidates, in order: $PYTHON, python3, python, then `py -3` on Windows.
// Each is probed first, so a Microsoft Store alias stub or a Python 2 is
// skipped. The script's exit code is passed through (the audit uses 0, 1 and
// 2). With no Python 3 found it prints one line and exits 1.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function candidates(env = process.env, platform = process.platform) {
  const list = [];
  if (env.PYTHON?.trim()) list.push({ command: env.PYTHON.trim(), args: [] });
  list.push({ command: "python3", args: [] }, { command: "python", args: [] });
  if (platform === "win32") list.push({ command: "py", args: ["-3"] });
  return list;
}

const PROBE = "import sys; raise SystemExit(0 if sys.version_info[0] == 3 else 1)";
const options = { windowsHide: true };

export function findPython({
  env = process.env,
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  for (const candidate of candidates(env, platform)) {
    const probe = spawn(candidate.command, [...candidate.args, "-c", PROBE], {
      ...options,
      stdio: "ignore",
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

// Returns the exit code to use; never throws for a missing interpreter.
export function runPython(argv, {
  env = process.env,
  platform = process.platform,
  spawn = spawnSync,
  log = console.error,
} = {}) {
  if (!argv.length) {
    log("Usage: node scripts/python.mjs <script.py> [args...]");
    return 2;
  }
  const python = findPython({ env, platform, spawn });
  if (!python) {
    log(
      "No Python 3 interpreter found (tried PYTHON, python3, python and, on Windows, py -3). Install Python 3 or set PYTHON to its path.",
    );
    return 1;
  }
  const run = spawn(python.command, [...python.args, ...argv], {
    ...options,
    stdio: "inherit",
  });
  if (run.error) {
    log(`Could not run ${python.command}: ${run.error.message}`);
    return 1;
  }
  return run.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exitCode = runPython(process.argv.slice(2));
