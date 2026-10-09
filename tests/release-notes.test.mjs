import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { sectionFor } from "../scripts/release-notes.mjs";

const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const fixture = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [2.0.0] - 2026-02-01",
  "",
  "### Added",
  "",
  "- Second release.",
  "",
  "## [1.10.0] - 2026-01-15",
  "",
  "- Not the 1.1.0 section.",
  "",
  "## [1.1.0] - 2026-01-10",
  "",
  "- First release.",
  "",
  "## [1.0.0] - 2026-01-01",
  "",
  "[2.0.0]: https://example.invalid/compare/v1.10.0...v2.0.0",
  "[1.0.0]: https://example.invalid/releases/tag/v1.0.0",
  "",
].join("\n");

test("a section runs from its heading to the next heading", () => {
  assert.equal(sectionFor(fixture, "2.0.0"), "### Added\n\n- Second release.\n");
  assert.equal(sectionFor(fixture, "v1.1.0"), "- First release.\n");
  assert.equal(sectionFor(fixture.replace(/\n/g, "\r\n"), "1.10.0"), "- Not the 1.1.0 section.\n");
});

test("a missing, empty or unnamed version is refused", () => {
  assert.throws(() => sectionFor(fixture, "9.9.9"), /no section for 9\.9\.9/);
  assert.throws(() => sectionFor(fixture, "1.0.0"), /section 1\.0\.0 is empty/);
  assert.throws(() => sectionFor(fixture, "Unreleased"), /section Unreleased is empty/);
  assert.throws(() => sectionFor(fixture, ""), /Name the version/);
});

test("the repository changelog has notes for the current and backfilled releases", () => {
  const current = sectionFor(changelog, pkg.version);
  assert.match(current, /^### (Added|Changed|Fixed|Security)$/m);
  assert.doesNotMatch(current, /^## /m);
  const earlier = sectionFor(changelog, "4.1.0");
  assert.match(earlier, /review queue/);
  assert.doesNotMatch(earlier, /^## \[4\.0\.0\]/m);
});

test("the CLI prints one section and exits 1 for a missing one", () => {
  const run = (...args) =>
    spawnSync(process.execPath, ["scripts/release-notes.mjs", ...args], {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    });
  const ok = run("4.1.0");
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, sectionFor(changelog, "4.1.0"));
  const missing = run("9.9.9");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no section for 9\.9\.9/);
  assert.equal(run().status, 2);
});
