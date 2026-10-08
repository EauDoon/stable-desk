import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVersions } from "../scripts/check-version.mjs";
import { VERSION } from "../src/version.js";

const repo = new URL("..", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "stable-desk-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const version = overrides.version ?? "1.2.3";
  const files = {
    "package.json": JSON.stringify({ name: "fixture", version }),
    "package-lock.json": JSON.stringify({
      version: overrides.lockVersion ?? version,
      packages: { "": { version: overrides.lockRootVersion ?? version } },
    }),
    "src/version.js": `export const VERSION = "${overrides.mirror ?? version}";\n`,
    "src/app.js": overrides.app ?? "export const label = `Stable Desk v${VERSION}`;\n",
    "CHANGELOG.md":
      overrides.changelog ??
      `# Changelog\n\n## [Unreleased]\n\n## [${version}] - 2026-10-09\n\n- Fixture.\n\n## [1.0.0] - 2026-01-01\n`,
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test("the repository's version surfaces agree", async () => {
  const result = await checkVersions();
  assert.deepEqual(result.errors, []);
  assert.equal(result.version, pkg.version);
  assert.equal(VERSION, pkg.version);
});

test("a consistent fixture passes, including its matching tag", async (t) => {
  const root = await fixture(t);
  assert.equal((await checkVersions({ root })).ok, true);
  assert.equal((await checkVersions({ root, tag: "v1.2.3" })).ok, true);
});

test("a mismatched lockfile or mirror fails", async (t) => {
  for (const override of [
    { lockVersion: "1.2.4" },
    { lockRootVersion: "1.2.4" },
    { mirror: "1.2.4" },
  ]) {
    const result = await checkVersions({ root: await fixture(t, override) });
    assert.equal(result.ok, false, JSON.stringify(override));
  }
});

test("a non-SemVer package version fails", async (t) => {
  const result = await checkVersions({ root: await fixture(t, { version: "1.2" }) });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /package\.json/);
});

test("a stray hand-written version literal in the code directories fails", async (t) => {
  const result = await checkVersions({
    root: await fixture(t, { app: 'export const label = "Stable Desk v9.9";\n' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /src\/app\.js:1 v9\.9/);
});

test("a changelog without [Unreleased] or with another latest release fails", async (t) => {
  const missing = await checkVersions({
    root: await fixture(t, { changelog: "# Changelog\n\n## [1.2.3] - 2026-10-09\n" }),
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /Unreleased/);
  const stale = await checkVersions({
    root: await fixture(t, {
      changelog: "# Changelog\n\n## [Unreleased]\n\n## [1.2.2] - 2026-10-01\n",
    }),
  });
  assert.equal(stale.ok, false);
  assert.match(stale.errors.join("\n"), /latest release/);
});

test("a tag that does not name the version fails", async (t) => {
  const root = await fixture(t);
  for (const tag of ["v9.9.9", "1.2.3", "v1.2.3-rc.1"])
    assert.equal((await checkVersions({ root, tag })).ok, false, tag);
});

test("the CLI exits 1 for a wrong tag and 0 for the matching one", () => {
  const run = (...args) =>
    spawnSync(process.execPath, ["scripts/check-version.mjs", ...args], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GITHUB_REF_TYPE: "", GITHUB_REF_NAME: "" },
    });
  const wrong = run("--tag", "v9.9.9");
  assert.equal(wrong.status, 1, wrong.stdout + wrong.stderr);
  assert.match(wrong.stderr, /git tag/);
  const right = run("--tag", `v${pkg.version}`);
  assert.equal(right.status, 0, right.stdout + right.stderr);
  assert.equal(run("--bogus").status, 2);
});
