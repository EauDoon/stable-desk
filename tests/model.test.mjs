import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateDataset,
  validateWorkspace,
  filterOrganizations,
  evidenceFingerprint,
  reviewState,
  blankWorkspace,
  parseImport,
  exportPayload,
  validDate,
} from "../src/model.js";
const baseline = JSON.parse(
  await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
);
test("baseline coverage and lineage are valid, with a genuine first snapshot", () => {
  assert.deepEqual(validateDataset(baseline), []);
  assert.equal(baseline.organizations.length, 10);
  assert.equal(baseline.priorities.length, 3);
  assert.equal(baseline.changes.length, 1);
  assert.equal(baseline.changes[0].kind, "baseline");
  assert.equal(baseline.changes[0].before, null);
  assert.ok(baseline.sources.every((s) => s.accessedAt === "2026-09-30"));
  assert.ok(
    baseline.priorities.every(
      (p) => p.evidenceSnapshot === evidenceFingerprint(baseline, p),
    ),
  );
});
test("filters combine evidence search, opportunity, relationship and market", () => {
  assert.deepEqual(
    filterOrganizations(baseline, {
      query: "USDC",
      lane: "Distribution",
      relationship: "demo",
    }).map((o) => o.id),
    ["stripe", "worldpay"],
  );
  assert.deepEqual(
    filterOrganizations(baseline, { market: "United Kingdom page" }).map(
      (o) => o.id,
    ),
    ["coinbase"],
  );
  assert.equal(
    filterOrganizations(baseline, { query: "  nonexistent  " }).length,
    0,
  );
  assert.equal(
    filterOrganizations(baseline, { query: "price range" }).length,
    1,
  );
});
test("reject duplicate IDs, missing evidence, invalid dates and executable URLs", () => {
  for (const mutate of [
    (d) => d.sources.push(d.sources[0]),
    (d) => d.evidence[0].sourceIds.push("missing-source"),
    (d) => d.priorities[0].organizationIds.push("unknown-org"),
    (d) => (d.sources[0].url = "javascript:alert(1)"),
    (d) => (d.sources[0].url = "https://user:secret@example.com"),
    (d) => (d.sources[0].publishedAt = "2027-01-01"),
    (d) => (d.organizations[0].relationship = "constructor"),
    (d) => (d.evidence[0].type = "toString"),
    (d) => (d.changes[0].before = "fabricated-history"),
    (d) => (d.evidence[0].asOf = "2026-02-30"),
  ]) {
    const d = structuredClone(baseline);
    mutate(d);
    assert.ok(validateDataset(d).length);
  }
  assert.equal(validDate("2026-02-30"), false);
});
test("changed source, organization or added evidence flags affected proposals", () => {
  const cases = [
    (d) => (d.sources.find((s) => s.id === "S-G02").dateNote += " Changed."),
    (d) =>
      (d.organizations.find((o) => o.id === "stripe").uncertainty +=
        " New gap."),
    (d) =>
      d.evidence.push({
        ...d.evidence[1],
        id: "E-new",
        statement: "New public evidence.",
      }),
  ];
  for (const mutate of cases) {
    const d = structuredClone(baseline);
    mutate(d);
    assert.equal(
      reviewState(d, d.priorities[0], {}, "2026-09-30").label,
      "Evidence changed",
    );
    assert.equal(
      reviewState(d, d.priorities[1], {}, "2026-09-30").label,
      "Baseline reviewed",
    );
  }
});
test("stale date and explicit local review use the current evidence snapshot", () => {
  const p = baseline.priorities[0];
  assert.equal(
    reviewState(baseline, p, {}, "2026-10-31").label,
    "Review overdue",
  );
  const review = {
    [p.id]: {
      fingerprint: evidenceFingerprint(baseline, p),
      reviewedAt: "2026-10-31T10:00:00Z",
      reviewBy: "2026-11-30",
      note: "Assumptions reviewed.",
    },
  };
  assert.equal(
    reviewState(baseline, p, review, "2026-10-31").label,
    "Reviewed locally",
  );
  const d = structuredClone(baseline);
  d.evidence[1].scope += " Changed scope.";
  assert.equal(
    reviewState(d, d.priorities[0], review, "2026-10-31").label,
    "Evidence changed",
  );
});
test("full export/import preserves decision notes and review lineage", () => {
  const workspace = blankWorkspace();
  workspace.decisions["D-G01"] = {
    status: "Investigating",
    owner: "Researcher",
    reviewBy: "2026-10-15",
    notes: "Check repeat users and settlement route.",
  };
  workspace.activity.push({
    kind: "decision_edit",
    at: "2026-09-30T12:00:00Z",
    summary: "D-G01 local edit.",
  });
  const restored = parseImport(
    JSON.stringify(exportPayload(baseline, workspace)),
  );
  assert.deepEqual(restored.data, baseline);
  assert.deepEqual(restored.workspace, workspace);
  assert.deepEqual(
    parseImport(JSON.stringify(baseline)).workspace,
    blankWorkspace(),
  );
});
test("malformed, oversized and invalid local workspace imports are rejected", () => {
  assert.throws(() => parseImport("{"));
  assert.throws(() => parseImport(" ".repeat(2_000_001)), /2 MB/);
  const w = blankWorkspace();
  w.decisions.Unknown = { status: "Approved" };
  assert.ok(validateWorkspace(w, baseline).length);
  assert.throws(
    () => parseImport(JSON.stringify(exportPayload(baseline, w))),
    /Invalid local decision/,
  );
  assert.ok(
    validateWorkspace({ ...blankWorkspace(), decisions: [] }, baseline).length,
  );
});

test("fictional provenance cannot be promoted or restored from a legacy dataset", () => {
  for (const mutate of [
    (d) => delete d.profile,
    (d) => delete d.meta.datasetId,
    (d) => (d.profile.issuer = "A real company"),
    (d) => (d.profile.mode = "real_issuer"),
    (d) => (d.organizations[0].relationship = "announced"),
    (d) => (d.organizations[0].relationshipEvidenceIds = ["E-G02"]),
    (d) =>
      (d.evidence.find((e) => e.type === "synthetic_example").type =
        "verified_fact"),
    (d) => (d.evidence[0].subject = "fictional_profile"),
    (d) => (d.priorities[0].mode = "real_opportunity"),
    (d) => (d.decisions[0].mode = "real_decision"),
  ]) {
    const d = structuredClone(baseline);
    mutate(d);
    assert.ok(validateDataset(d).length);
    assert.throws(() => parseImport(JSON.stringify(d)));
  }
  assert.ok(
    baseline.organizations.every(
      (o) => o.relationship === "demo" && !o.relationshipEvidenceIds.length,
    ),
  );
  assert.equal(
    baseline.evidence.filter((e) => e.type === "synthetic_example").length,
    3,
  );
});
test("profile changes flag all examples without relabeling real sources", () => {
  const d = structuredClone(baseline);
  const sources = JSON.stringify(d.sources);
  d.profile.name = "Example Stablecoin";
  d.profile.ticker = "EXAMPLE";
  assert.deepEqual(validateDataset(d), []);
  assert.equal(JSON.stringify(d.sources), sources);
  for (const p of d.priorities)
    assert.equal(reviewState(d, p, {}, "2026-09-30").label, "Evidence changed");
});
