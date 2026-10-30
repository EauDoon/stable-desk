import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareDataset,
  createWorkspace,
  activeState,
  commitOperation,
  workspaceHead,
  parseV2Import,
  exportV2,
  uid,
} from "../src/workspace.js";
import { changeReport } from "../src/change-report.js";
import { TEST_NOW } from "./clock.js";

const seed = prepareDataset(
  JSON.parse(await readFile(new URL("../data/baseline.json", import.meta.url), "utf8")),
);
const deskRaw = await readFile(new URL("./compat/v4.1-desk-workspace.json", import.meta.url), "utf8");
const cwd = new URL("..", import.meta.url);
const revise = (ws, changes, actor = "Researcher", rationale = "Scope checked against the original page.") => {
  const e = activeState(seed, ws).evidence["E-G02"];
  return commitOperation(seed, ws, {
    type: "evidence_revision",
    recordId: "E-G02",
    profileId: ws.activeProfileId,
    expectedRevision: e.revision,
    expectedHead: workspaceHead(ws),
    opId: uid("OP"),
    actor,
    rationale,
    at: TEST_NOW,
    after: { ...e.value, ...changes },
  }).workspace;
};

test("the report lists each committed change with reviewer, rationale and before and after values", () => {
  const ws = revise(createWorkspace(seed, "WS-report"), {
    scope: "Revised scope after manual source review.",
  });
  const report = changeReport(seed, ws, { generatedAt: TEST_NOW });
  assert.match(report, /^# Stable Desk change report\n/);
  assert.match(report, /^- Workspace: WS-report$/m);
  assert.match(report, new RegExp(`^- Workspace head: ${workspaceHead(ws)}$`, "m"));
  assert.match(report, /^- Dataset: 2026-09-30\.generic\.2, public baseline as of 2026-09-30$/m);
  assert.match(report, /^- Generated: 2026-10-15T12:00:00\.000Z$/m);
  assert.match(report, /^## Committed changes \(1\)$/m);
  assert.match(
    report,
    /^- #1 2026-10-15T12:00:00\.000Z: evidence revision of E-G02 by Researcher\. Rationale: Scope checked against the original page\.$/m,
  );
  assert.match(report, /^ {2}- Field scope: ".+" -> "Revised scope after manual source review\."$/m);
  assert.match(report, /^## Differences from the repository baseline \(1\)$/m);
  assert.match(report, /^- Evidence E-G02: scope$/m);
  assert.match(report, /Reviewer labels are local and unauthenticated/);
  assert.match(report, /Nothing here verifies a claim/);
});

test("an unchanged workspace reports no committed changes and no differences", () => {
  const report = changeReport(seed, createWorkspace(seed, "WS-empty"), { generatedAt: TEST_NOW });
  assert.match(report, /^## Committed changes \(0\)\n\n- No committed changes for this profile\.$/m);
  assert.match(report, /^## Differences from the repository baseline \(0\)$/m);
  assert.match(report, /^- None\. This profile matches the repository baseline\.$/m);
});

test("reviewer text and values stay inert Markdown on their own list line", () => {
  const hostile = "# Heading\n- injected item\n[link](https://example.com) <img src=x> `code` *bold*";
  const ws = revise(
    createWorkspace(seed, "WS-hostile"),
    { scope: "#  Also a heading\n\n## and more" },
    "Reviewer\n# not a heading",
    hostile,
  );
  const report = changeReport(seed, ws, { generatedAt: TEST_NOW });
  const lines = report.split("\n");
  // Only the report's own three headings start with '#'.
  assert.deepEqual(
    lines.filter((l) => l.startsWith("#")),
    [
      "# Stable Desk change report",
      "## Committed changes (1)",
      "## Differences from the repository baseline (1)",
    ],
  );
  // Markup characters are escaped: none can open HTML, a link or code.
  assert.ok(!/(^|[^\\])<img/.test(report));
  assert.ok(!/(^|[^\\])\]\(https:/.test(report));
  assert.ok(!report.includes("`code`"));
  // Each user value sits after fixed text inside a single list line.
  const event = lines.find((l) => l.startsWith("- #1 "));
  assert.ok(
    event.endsWith(
      "by Reviewer # not a heading. Rationale: # Heading - injected item \\[link\\](https://example.com) \\<img src=x\\> \\`code\\` \\*bold\\*",
    ),
    event,
  );
  assert.match(report, /^ {2}- Field scope: ".+" -> "# Also a heading ## and more"$/m);
});

test("the report covers only the chosen profile and refuses an unknown one", () => {
  const { seed: s, workspace } = parseV2Import(deskRaw);
  const active = changeReport(s, workspace, { generatedAt: TEST_NOW });
  assert.match(active, /^## Committed changes \(6\)$/m);
  assert.ok(!active.includes("profile created"));
  const other = workspace.events.find((e) => e.type === "profile_created").profileId;
  const second = changeReport(s, workspace, { profileId: other, generatedAt: TEST_NOW });
  assert.match(second, /^## Committed changes \(1\)$/m);
  assert.match(second, /profile created of PROFILE-/);
  assert.ok(
    second.includes(`- Profile ${other}: a local profile, not the repository's default profile generic-stable.`),
  );
  assert.throws(
    () => changeReport(s, workspace, { profileId: "PROFILE-missing" }),
    /Unknown profile PROFILE-missing\./,
  );
});

test("the v4.1 compatibility workspace produces a full report", () => {
  const { seed: s, workspace } = parseV2Import(deskRaw);
  const report = changeReport(s, workspace, { generatedAt: TEST_NOW });
  assert.match(report, /decision saved of D-G01 by Researcher/);
  assert.match(report, /^ {2}- Field basis: recorded for assumptions A-P-G01-1, A-P-G01-2\.$/m);
  assert.match(report, /^ {2}- Field status: "Proposed" -> "Investigating"$/m);
  assert.match(report, /source check of S-G09/);
  assert.match(report, /^- Evidence E-G09: scope$/m);
});

const cli = (...args) =>
  spawnSync(process.execPath, ["scripts/change-report.mjs", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 10000,
  });

test("the change report CLI prints help, and refuses usage errors with exit 2", () => {
  for (const flag of ["--help", "-h"]) {
    const result = cli(flag);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage: npm run report:changes -- <export\.json> \[--profile <id>\]/);
    assert.match(result.stdout, /Exit codes: 0 report printed, 1 unreadable or invalid file, 2 usage error\./);
    assert.equal(result.stderr, "");
  }
  for (const [args, message] of [
    [[], /Give the export file to report on\./],
    [["a.json", "b.json"], /Give exactly one export file\./],
    [["--since", "2026-10-01", "a.json"], /Unknown option '--since'/],
    [["a.json", "--profile"], /--profile/],
    [["a.json", "--profile", " "], /Invalid --profile/],
  ]) {
    const result = cli(...args);
    assert.equal(result.status, 2, `${args.join(" ")}: ${result.stderr}`);
    assert.match(result.stderr, message);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.stdout, "");
  }
});

test("the change report CLI exits 1 for a missing or invalid file and prints the report for a valid one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stable-desk-report-"));
  try {
    const bad = join(dir, "bad.json");
    await writeFile(bad, '{"schemaVersion":2,"workspace":{}}');
    for (const file of [bad, join(dir, "missing.json")]) {
      const result = cli(file);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^Cannot report on /);
      assert.equal(result.stdout, "");
    }
    const fixture = "tests/compat/v4.1-desk-workspace.json";
    const result = cli(fixture);
    assert.equal(result.status, 0, result.stderr);
    const { seed: s, workspace } = parseV2Import(deskRaw);
    const generated = result.stdout.match(/^- Generated: (.+)$/m)[1];
    assert.equal(result.stdout, changeReport(s, workspace, { generatedAt: generated }));
    // The same workspace in Source review's adopted-workspace form works too.
    const adopted = join(dir, "adopted.json");
    await writeFile(adopted, JSON.stringify(exportV2(s, workspace)));
    assert.equal(cli(adopted).status, 0);
    const other = workspace.events.find((e) => e.type === "profile_created").profileId;
    const second = cli(fixture, "--profile", other);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /^## Committed changes \(1\)$/m);
    const unknown = cli(fixture, "--profile", "PROFILE-missing");
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown profile PROFILE-missing\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
