// Version consistency check. package.json "version" is canonical; every other
// version surface must agree with it, and no hand-written version literal may
// drift in the code directories. Used by `npm run check:version`, the unit
// tests, CI and the release workflow (with --tag).
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const LITERAL = /\bv\d+\.\d+(\.\d+)?\b/;
const SCANNED = ["src", "server", "api", "scripts"];
const MIRROR = "src/version.js";
const RELEASED = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})\s*$/m;

async function files(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const found = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

async function readText(root, path) {
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function checkVersions({
  root = resolve(import.meta.dirname, ".."),
  tag = null,
} = {}) {
  const rows = [];
  const row = (source, value, ok, note = "") =>
    rows.push({ source, value: value ?? "(missing)", ok, note });
  const pkg = JSON.parse((await readText(root, "package.json")) ?? "{}");
  const version = pkg.version;
  row(
    "package.json",
    version,
    typeof version === "string" && SEMVER.test(version),
    "canonical; must be strict SemVer",
  );
  const lockText = await readText(root, "package-lock.json");
  const lock = lockText === null ? {} : JSON.parse(lockText);
  row("package-lock.json version", lock.version, lock.version === version);
  row(
    'package-lock.json packages[""]',
    lock.packages?.[""]?.version,
    lock.packages?.[""]?.version === version,
  );
  const mirror = (await readText(root, MIRROR))?.match(
    /export const VERSION = "([^"]+)";/,
  )?.[1];
  row(MIRROR, mirror, mirror === version);
  const changelog = await readText(root, "CHANGELOG.md");
  row(
    "CHANGELOG.md [Unreleased]",
    changelog === null
      ? null
      : /^## \[Unreleased\]\s*$/m.test(changelog)
        ? "present"
        : "absent",
    changelog !== null && /^## \[Unreleased\]\s*$/m.test(changelog),
    "heading must exist",
  );
  const released = changelog?.match(RELEASED)?.[1];
  row(
    "CHANGELOG.md latest release",
    released,
    released === version,
    "first dated heading",
  );
  if (tag !== null && tag !== undefined && tag !== "")
    row("git tag", tag, tag === `v${version}`, "must be v + version");
  const literals = [];
  for (const dir of SCANNED)
    for (const path of await files(resolve(root, dir))) {
      const local = relative(root, path).split(sep).join("/");
      if (local === MIRROR) continue;
      const lines = (await readFile(path, "utf8")).split("\n");
      lines.forEach((line, index) => {
        const match = line.match(LITERAL);
        if (match) literals.push(`${local}:${index + 1} ${match[0]}`);
      });
    }
  row(
    "stray version literals",
    literals.length ? literals.join(", ") : "none",
    literals.length === 0,
    `${SCANNED.join(", ")}; import VERSION instead`,
  );
  const errors = rows
    .filter((r) => !r.ok)
    .map((r) => `${r.source}: ${r.value}${r.note ? ` (${r.note})` : ""}`);
  return { version, rows, errors, ok: errors.length === 0 };
}

export function formatTable(rows) {
  const width = Math.max(...rows.map((r) => r.source.length));
  return rows
    .map(
      (r) => `${r.ok ? "ok  " : "FAIL"}  ${r.source.padEnd(width)}  ${r.value}`,
    )
    .join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let values;
  try {
    ({ values } = parseArgs({
      options: { tag: { type: "string" }, help: { type: "boolean", short: "h" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    console.error(`${error.message}\nUsage: node scripts/check-version.mjs [--tag vX.Y.Z]`);
    process.exit(2);
  }
  if (values.help) {
    console.log("Usage: node scripts/check-version.mjs [--tag vX.Y.Z]\nWith GITHUB_REF_TYPE=tag, GITHUB_REF_NAME is checked as the tag.");
    process.exit(0);
  }
  const tag =
    values.tag ??
    (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null);
  const result = await checkVersions({ tag });
  console.log(formatTable(result.rows));
  if (!result.ok) {
    console.error(`Version check failed:\n- ${result.errors.join("\n- ")}`);
    process.exitCode = 1;
  } else console.log(`Version ${result.version} is consistent.`);
}
