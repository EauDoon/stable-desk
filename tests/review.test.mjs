import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  prepareDataset,
  activeState,
  assumptionStatus,
  workspaceHead,
} from "../src/workspace.js";
import {
  initialReview,
  applyReview,
  decodeDesk,
  validateReview,
  weeklyBrief,
  WATCH,
  REVIEW_MAX_EVENTS,
} from "../src/review-model.js";
import { meaningfulText, collect } from "../server/collector.mjs";
import { createAPI } from "../server/api.mjs";
import { sha256 } from "../src/sha256.js";
const seed = prepareDataset(
  JSON.parse(
    await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
  ),
);
const at = "2026-10-01T05:00:00.000Z",
  actor = "local-reviewer";
const text = (n) =>
  `Official stablecoin documentation. Merchants must examine business eligibility, country restrictions and supported tokens before using the payment product. Revision ${n}.`;
const check = (p, n, id = `CHECK-${n}`) =>
  applyReview(
    p,
    {
      type: "check",
      opId: id,
      expectedVersion: p.version,
      capture: { outcome: "ok", text: text(n) },
    },
    actor,
    at,
  ).state;

test("sha256 matches published vectors", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  // Block-boundary lengths must pad identically to a reference implementation.
  assert.equal(
    sha256("a".repeat(1_000)),
    "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
  );
});

test("initial review state is empty, versioned and self-describing", () => {
  const review = initialReview(seed);
  assert.equal(review.schemaVersion, 4);
  assert.equal(review.version, 0);
  assert.deepEqual(review.journal, []);
  assert.deepEqual(review.checks, []);
  assert.equal(validateReview(review), review);
});

test("first successful capture is a baseline, not a change", () => {
  const review = check(initialReview(seed), 1);
  assert.equal(review.checks.at(-1).outcome, "baseline");
  assert.equal(review.candidates.length, 0);
  assert.equal(review.version, 1);
});

test("identical capture records an unchanged check and no candidate", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 1, "CHECK-again");
  assert.equal(review.checks.at(-1).outcome, "unchanged");
  assert.equal(review.candidates.length, 0);
  assert.equal(review.version, 2);
});

test("changed capture stages exactly one candidate with both hashes", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  assert.equal(review.checks.at(-1).outcome, "changed");
  const c = review.candidates.at(-1);
  assert.equal(c.status, "pending");
  assert.equal(c.sourceId, WATCH.id);
  assert.equal(c.url, WATCH.url);
  assert.equal(c.beforeHash, sha256(text(1)));
  assert.equal(c.afterHash, sha256(text(2)));
});

test("unreachable capture stays unresolved and creates no candidate", () => {
  const review = applyReview(
    initialReview(seed),
    {
      type: "check",
      opId: "CHECK-fail",
      expectedVersion: 0,
      capture: { outcome: "unreachable", status: 403, note: "Restricted." },
    },
    actor,
    at,
  ).state;
  assert.equal(review.checks.at(-1).outcome, "unreachable");
  assert.equal(review.candidates.length, 0);
  assert.equal(review.checks.at(-1).hash, null);
});

test("accepting a candidate adopts one revision and names affected records", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  const result = applyReview(
    review,
    {
      type: "accepted",
      opId: "REVIEW-1",
      expectedVersion: review.version,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      statement: "Stripe supports stablecoin settlement for eligible merchants.",
      classification: "company_claim",
      rationale: "The published page now states merchant eligibility explicitly.",
    },
    actor,
    "2026-10-01T06:00:00.000Z",
  );
  const event = result.state.journal.at(-1);
  assert.equal(event.type, "accepted");
  assert.ok(event.affectedAssumptionIds.length > 0);
  assert.ok(event.affectedDecisionIds.length > 0);
  const { workspace } = decodeDesk(result.state.desk);
  const evidence = activeState(seed, workspace).evidence[WATCH.evidenceId];
  assert.equal(
    evidence.value.statement,
    "Stripe supports stablecoin settlement for eligible merchants.",
  );
  // The adopted head is the review event itself: exactly one revision.
  assert.equal(workspaceHead(workspace), event.adoptedHead);
  assert.equal(
    workspace.events.filter((e) => e.recordId === WATCH.evidenceId).length,
    1,
  );
  // A decision is never endorsed automatically by an evidence revision.
  for (const id of event.affectedDecisionIds) {
    const decision = seed.decisions.find((d) => d.id === id);
    assert.ok(
      ["Proposed", "Investigating", "Ready for review", "Parked", "Declined"].includes(
        decision.status,
      ),
    );
    assert.equal(
      workspace.events.some(
        (e) => e.recordId === id && e.after?.status === "Ready for review",
      ),
      decision.status === "Ready for review",
    );
  }
});

test("rejection preserves adopted evidence", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const before = review.desk;
  const c = review.candidates.at(-1);
  const result = applyReview(
    review,
    {
      type: "rejected",
      opId: "REVIEW-2",
      expectedVersion: review.version,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      rationale: "Page churn only; no material change to eligibility.",
    },
    actor,
    at,
  );
  assert.deepEqual(result.state.desk, before);
  assert.equal(result.state.candidates.at(-1).status, "rejected");
});

test("a second change supersedes an unreviewed candidate", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const first = review.candidates.at(-1).id;
  review = check(review, 3);
  assert.equal(
    review.candidates.find((c) => c.id === first).status,
    "superseded",
  );
  assert.equal(review.candidates.at(-1).status, "pending");
});

test("an unchanged statement must be rejected, not adopted", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  const { seed: s, workspace } = decodeDesk(review.desk);
  const current = activeState(s, workspace).evidence[WATCH.evidenceId].value
    .statement;
  assert.throws(
    () =>
      applyReview(
        review,
        {
          type: "accepted",
          opId: "REVIEW-3",
          expectedVersion: review.version,
          candidateId: c.id,
          expectedCandidateHash: c.afterHash,
          statement: current,
          classification: "company_claim",
          rationale: "Trying to adopt an unchanged claim.",
        },
        actor,
        at,
      ),
    /Unchanged claims/,
  );
});

test("an unsupported classification is refused", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  assert.throws(
    () =>
      applyReview(
        review,
        {
          type: "accepted",
          opId: "REVIEW-4",
          expectedVersion: review.version,
          candidateId: c.id,
          expectedCandidateHash: c.afterHash,
          statement: "A materially different reviewed statement about settlement.",
          classification: "verified_fact",
          rationale: "Attempting an unsupported claim class.",
        },
        actor,
        at,
      ),
    /classification/,
  );
});

test("a short rationale is refused", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  assert.throws(
    () =>
      applyReview(
        review,
        {
          type: "accepted",
          opId: "REVIEW-5",
          expectedVersion: review.version,
          candidateId: c.id,
          expectedCandidateHash: c.afterHash,
          statement: "A materially different reviewed statement about settlement.",
          classification: "company_claim",
          rationale: "no",
        },
        actor,
        at,
      ),
    /Explain the review decision/,
  );
});

test("repeating an identical operation is idempotent", () => {
  let review = check(initialReview(seed), 1);
  const again = applyReview(
    review,
    {
      type: "check",
      opId: "CHECK-1",
      expectedVersion: 0,
      capture: { outcome: "ok", text: text(1) },
    },
    actor,
    at,
  );
  assert.equal(again.duplicate, true);
  assert.equal(again.state, review);
});

test("reusing an operation ID with changed intent is refused", () => {
  const review = check(initialReview(seed), 1);
  assert.throws(
    () =>
      applyReview(
        review,
        {
          type: "check",
          opId: "CHECK-1",
          expectedVersion: review.version,
          capture: { outcome: "ok", text: text(99) },
        },
        actor,
        at,
      ),
    /changed intent/,
  );
});

test("a stale expected version is refused", () => {
  const review = check(initialReview(seed), 1);
  assert.throws(
    () =>
      applyReview(
        review,
        {
          type: "check",
          opId: "CHECK-stale",
          expectedVersion: 0,
          capture: { outcome: "ok", text: text(2) },
        },
        actor,
        at,
      ),
    /changed/i,
  );
});

test("a tampered journal breaks continuity validation", () => {
  const review = check(initialReview(seed), 1);
  const tampered = structuredClone(review);
  tampered.journal[0].capture = null;
  tampered.journal[0].note = "edited";
  assert.throws(() => validateReview(tampered), /continuity/);
});

test("a check with no journal record is refused", () => {
  const review = check(initialReview(seed), 1);
  const tampered = structuredClone(review);
  tampered.checks[0].outcome = "changed";
  assert.throws(() => validateReview(tampered), /inconsistent/);
});

test("the operation bound is enforced", () => {
  let review = initialReview(seed);
  for (let i = 0; i < REVIEW_MAX_EVENTS; i++)
    review = check(review, 1, `CHECK-bulk-${i}`);
  assert.equal(review.version, REVIEW_MAX_EVENTS);
  assert.throws(
    () => check(review, 1, "CHECK-over"),
    /Bounded review limit/,
  );
});

test("the weekly brief reports real events with citations", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  review = applyReview(
    review,
    {
      type: "accepted",
      opId: "REVIEW-brief",
      expectedVersion: review.version,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      statement: "Stripe supports stablecoin settlement for eligible merchants.",
      classification: "company_claim",
      rationale: "The published page now states merchant eligibility explicitly.",
    },
    actor,
    at,
  ).state;
  const brief = weeklyBrief(review, "2026-10-01T07:00:00.000Z");
  assert.match(brief, new RegExp(WATCH.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(brief, /accepted by local-reviewer/);
  assert.ok(brief.includes("(STABLE) remains fictional"));
  // The accepted claim's own words must reach the brief, not just its ID.
  assert.match(brief, /The published page now states merchant eligibility/);
  // Adopted heads and affected record IDs are named for follow-up review.
  assert.match(brief, /Adopted workspace head: EV-/);
  assert.match(brief, /no decision was automatically endorsed/);
  // No pending candidate remains after acceptance.
  assert.doesNotMatch(brief, /Review candidate/);
});

test("the check API returns a bounded capture and ignores caller input", async () => {
  const api = createAPI({
    collector: async () => ({ outcome: "ok", status: 200, text: text(1) }),
  });
  const ok = await api(
    new Request("https://x/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://evil.example", capture: { outcome: "ok" } }),
    }),
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.source.url, WATCH.url);
  assert.equal(body.capture.text, text(1));

  const rejected = await api(
    new Request("https://x/api/check?url=https://evil.example", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /one fixed source/);
});

test("the check API timestamps a capture with its injected clock", async () => {
  const api = createAPI({
    now: () => 0,
    collector: async () => ({ outcome: "ok", status: 200, text: text(1) }),
  });
  const response = await api(new Request("https://x/api/check"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checkedAt, "1970-01-01T00:00:00.000Z");
});

test("the check API rejects a non-JSON body", async () => {
  const api = createAPI({ collector: async () => ({ outcome: "ok", text: text(1) }) });
  const response = await api(
    new Request("https://x/api/check", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    }),
  );
  assert.equal(response.status, 415);
});

test("extraction drops chrome and keeps meaningful text", () => {
  const html = `<html><head><style>.x{color:red}</style></head><body><nav>Menu noise</nav><main><h1>Stablecoin payments</h1><p>${"Merchants should review eligibility and settlement. ".repeat(6)}</p></main><footer>Footer noise</footer><script>alert(1)</script></body></html>`;
  const out = meaningfulText(html);
  assert.match(out, /Stablecoin payments/);
  assert.doesNotMatch(out, /Menu noise/);
  assert.doesNotMatch(out, /Footer noise/);
  assert.doesNotMatch(out, /alert\(1\)/);
});

test("extraction refuses a page with no stablecoin content", () => {
  assert.throws(
    () => meaningfulText(`<main>${"unrelated ".repeat(50)}</main>`),
    /Meaningful source text/,
  );
});

test("an oversized or failing source resolves as unreachable", async () => {
  const failing = await collect(async () => {
    throw new Error("network down");
  });
  assert.equal(failing.outcome, "unreachable");
  assert.equal(failing.status, null);
  const refused = await collect(async () => ({ ok: false, status: 403, type: "basic" }));
  assert.equal(refused.outcome, "unreachable");
  assert.equal(refused.status, 403);
});

test("a check against a profile without the approved source is refused", () => {
  const raw = JSON.parse(
    readFileSync(new URL("../data/baseline.json", import.meta.url), "utf8"),
  );
  // Point the watched source at a different URL: the review loop must refuse
  // to collect against a profile that does not match the approved source.
  const source = raw.sources.find((s) => s.id === WATCH.id);
  const original = source.url;
  source.url = "https://example.invalid/not-the-approved-source";
  const altered = prepareDataset(raw);
  assert.throws(
    () =>
      applyReview(
        initialReview(altered),
        {
          type: "check",
          opId: "CHECK-mismatch",
          expectedVersion: 0,
          capture: { outcome: "ok", text: text(1) },
        },
        actor,
        at,
      ),
    /approved source URL/,
  );
  source.url = original;
});

test("assumptions downstream of an adopted revision are marked for review", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  const result = applyReview(
    review,
    {
      type: "accepted",
      opId: "REVIEW-stale",
      expectedVersion: review.version,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      statement: "Stripe supports stablecoin settlement for eligible merchants.",
      classification: "company_claim",
      rationale: "The published page now states merchant eligibility explicitly.",
    },
    actor,
    "2026-10-01T06:00:00.000Z",
  );
  const { seed: s, workspace } = decodeDesk(result.state.desk);
  const state = activeState(s, workspace);
  // The linked assumption A-P-G01-2 depends on this evidence and must now need
  // review rather than remaining silently current.
  const linked = Object.values(state.assumptions).filter((a) =>
    a.value.evidenceIds.includes(WATCH.evidenceId),
  );
  assert.ok(linked.length > 0);
  for (const a of linked)
    assert.equal(
      assumptionStatus(state, a.value.id).label,
      "Needs assumption review",
    );
});

test("malformed review backups fail validation with review errors, not TypeErrors", async () => {
  const { ReviewError } = await import("../src/review-model.js");
  const initial = initialReview(seed);
  const reviewed = check(check(initialReview(seed), 1), 2);
  for (const [label, value] of [
    ["candidates:[null]", { ...initial, candidates: [null] }],
    ["checks:[null]", { ...initial, checks: [null] }],
    ["snapshots:[null]", { ...initial, snapshots: [null] }],
    ["snapshots:{x:null}", { ...initial, snapshots: { x: null } }],
    ["journal:[null]", { ...initial, version: 1, journal: [null] }],
    ["journal:[1]", { ...initial, version: 1, journal: [1] }],
    ["candidates:[1]", { ...reviewed, candidates: [1] }],
    ["snapshot text missing", (() => {
      const copy = structuredClone(reviewed);
      delete Object.values(copy.snapshots)[0].text;
      return copy;
    })()],
  ])
    assert.throws(
      () => validateReview(value),
      (error) => error instanceof ReviewError && !/Cannot read|destructure|not iterable/.test(error.message),
      label,
    );
  // Valid schema-4 states are unaffected.
  assert.equal(validateReview(reviewed), reviewed);
});

test("the weekly brief keeps reviewer text inert and rejects an invalid date", async () => {
  const { mdInline } = await import("../src/review-model.js");
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const c = review.candidates.at(-1);
  review = applyReview(
    review,
    {
      type: "rejected",
      opId: "REVIEW-inject",
      expectedVersion: review.version,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      rationale: "Irrelevant.\n\n# Injected heading\n[click](javascript:alert(1)) <img src=x> *bold* `code` back\\slash.",
    },
    "Researcher\n## Actor heading",
    at,
  ).state;
  const brief = weeklyBrief(review, "2026-10-01T07:00:00.000Z");
  const lines = brief.split("\n");
  // Nothing from reviewer text can start a line, so no heading or list opens.
  assert.equal(lines.some((line) => /^#+ (Injected|Actor)/.test(line)), false);
  // Brackets are escaped, so no unescaped "](" can form a link, and no raw tag remains.
  assert.doesNotMatch(brief, /(^|[^\\])\]\(javascript:/m);
  assert.doesNotMatch(brief, /(^|[^\\])<img/m);
  assert.doesNotMatch(brief, /\.\./);
  const line = lines.find((l) => l.includes("rejected by"));
  assert.ok(line.includes("rejected by Researcher ## Actor heading;"), line);
  assert.ok(line.includes("Irrelevant. # Injected heading \\[click\\](javascript:alert(1)) \\<img src=x\\> \\*bold\\* \\`code\\` back\\\\slash. [Source]("), line);
  assert.equal(mdInline("ends with a period."), "ends with a period.");
  assert.equal(mdInline(undefined), "");
  assert.throws(() => weeklyBrief(review, "nope"), /Invalid brief date/);
  assert.throws(() => weeklyBrief(review, 12), /Invalid brief date/);
});
