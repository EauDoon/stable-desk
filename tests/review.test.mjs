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
  reviewedCandidates,
  rolloverReview,
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
  // The refusal names the way on.
  assert.throws(
    () => check(review, 1, "CHECK-over"),
    /choose Start new review period to continue/,
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

const decide = (p, type, extra = {}, when = "2026-10-01T06:00:00.000Z") => {
  const c = p.candidates.find((c) => c.status === "pending");
  return applyReview(
    p,
    {
      type,
      opId: `REVIEW-${type}-${p.version}`,
      expectedVersion: p.version,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      statement: "Stripe supports stablecoin settlement for eligible merchants.",
      classification: "company_claim",
      rationale: "The published page now states merchant eligibility explicitly.",
      ...extra,
    },
    actor,
    when,
  ).state;
};

test("reviewed candidates list accepted, rejected and superseded changes newest first", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const superseded = review.candidates.at(-1).id;
  review = check(review, 3);
  review = decide(review, "rejected", {
    rationale: "Navigation churn only; no material change to eligibility.",
  });
  review = check(review, 4);
  review = decide(review, "accepted", {}, "2026-10-01T07:00:00.000Z");
  const before = structuredClone(review);
  const list = reviewedCandidates(review);
  assert.deepEqual(review, before, "listing never changes the state");
  assert.deepEqual(
    list.map((c) => c.status),
    ["accepted", "rejected", "superseded"],
  );
  const [accepted, rejected, old] = list;
  assert.equal(accepted.adoptedStatement, "Stripe supports stablecoin settlement for eligible merchants.");
  assert.equal(accepted.adoptedClassification, "company_claim");
  assert.equal(accepted.reviewedBy, actor);
  assert.equal(accepted.reviewedAt, "2026-10-01T07:00:00.000Z");
  assert.equal(accepted.beforeText, text(3));
  assert.equal(accepted.afterText, text(4));
  assert.equal(accepted.afterHash, sha256(text(4)));
  assert.equal(rejected.adoptedStatement, null);
  assert.equal(rejected.rationale, "Navigation churn only; no material change to eligibility.");
  assert.equal(old.id, superseded);
  assert.equal(old.reviewedBy, null);
  assert.equal(old.rationale, null);
  assert.equal(old.reviewedAt, null);
  // Pending candidates stay in the inbox, not in this list.
  review = check(review, 5);
  assert.equal(reviewedCandidates(review).length, 3);
  assert.deepEqual(reviewedCandidates(initialReview(seed)), []);
});

test("reviewed candidates return reviewer text raw for the view to escape", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const rationale = "# Heading <img src=x onerror=alert(1)> [link](https://example.com)";
  review = decide(review, "rejected", { rationale });
  assert.equal(reviewedCandidates(review)[0].rationale, rationale);
});

test("reviewed candidates keep journal order when every timestamp is equal", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  review = check(review, 3); // supersedes the candidate from check 2
  review = decide(review, "rejected", {}, at);
  review = check(review, 4);
  review = decide(review, "accepted", {}, at);
  assert.deepEqual(
    reviewedCandidates(review).map((c) => c.status),
    ["accepted", "rejected", "superseded"],
  );
});

const later = "2026-10-20T08:00:00.000Z";
const checkAt = (p, n, id, when) =>
  applyReview(
    p,
    {
      type: "check",
      opId: id,
      expectedVersion: p.version,
      capture: { outcome: "ok", text: text(n) },
    },
    actor,
    when,
  ).state;

test("a new review period compares the next capture with the carried snapshot", () => {
  let review = check(initialReview(seed), 1);
  review = checkAt(review, 1, "CHECK-same", "2026-10-02T05:00:00.000Z");
  const snapshot = Object.values(review.snapshots)[0];
  const next = rolloverReview(review, actor, later);
  assert.equal(next.version, 1);
  assert.equal(next.checks[0].outcome, "baseline");
  assert.equal(next.checks[0].at, snapshot.at);
  assert.equal(next.checks[0].hash, snapshot.hash);
  assert.match(next.checks[0].note, /^Carried forward from the previous review period \(version 2, journal head [0-9a-f]{64}\); fetched 2026-10-02T05:00:00\.000Z\.$/);
  assert.deepEqual(Object.values(next.snapshots), [snapshot]);
  const same = checkAt(next, 1, "CHECK-after-same", later);
  assert.equal(same.checks.at(-1).outcome, "unchanged");
  assert.equal(same.candidates.length, 0);
  const changed = checkAt(next, 2, "CHECK-after-changed", later);
  assert.equal(changed.checks.at(-1).outcome, "changed");
  const c = changed.candidates.at(-1);
  assert.equal(c.beforeText, text(1));
  assert.equal(c.beforeHash, sha256(text(1)));
  assert.equal(c.previousFetchedAt, "2026-10-02T05:00:00.000Z");
});

test("the rolled-over state is a valid schema 4 state that names the old head", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  review = decide(review, "accepted");
  const head = review.journal.at(-1).eventHash;
  const before = structuredClone(review);
  const next = rolloverReview(review, actor, later);
  assert.deepEqual(review, before, "the old period is not changed");
  assert.equal(validateReview(next), next);
  assert.equal(next.schemaVersion, 4);
  assert.deepEqual(next.desk, review.desk);
  assert.equal(next.journal[0].seq, 1);
  assert.equal(next.journal[0].previousHash, "baseline");
  assert.match(next.journal[0].opId, /^ROLLOVER-/);
  assert.deepEqual(next.journal[0].carriedFrom, {
    version: 3,
    eventHash: head,
    rolledOverAt: later,
    rolledOverBy: actor,
  });
  assert.deepEqual(next.checks[0].carriedFrom, next.journal[0].carriedFrom);
  // Reviewed candidates stay with the old period.
  assert.deepEqual(next.candidates, []);
  assert.deepEqual(reviewedCandidates(next), []);
  // The carried event is part of the hash chain: altering it breaks it.
  const tampered = structuredClone(next);
  tampered.journal[0].carriedFrom.version = 99;
  assert.throws(() => validateReview(tampered), /continuity/);
});

test("at the 60-operation bound a pending candidate is carried and can still be reviewed", () => {
  let review = check(initialReview(seed), 1);
  for (let i = 1; i < REVIEW_MAX_EVENTS - 1; i++)
    review = check(review, 1, `CHECK-bulk-${i}`);
  review = check(review, 2);
  assert.equal(review.version, REVIEW_MAX_EVENTS);
  const pending = review.candidates.find((c) => c.status === "pending");
  // The deadlock this removes: neither decision fits under the bound.
  assert.throws(() => decide(review, "rejected"), /Bounded review limit/);
  assert.throws(() => decide(review, "accepted"), /Bounded review limit/);
  const next = rolloverReview(review, actor, later);
  assert.equal(next.version, 1);
  assert.deepEqual(next.candidates, [pending]);
  assert.equal(next.checks[0].outcome, "changed");
  assert.equal(next.checks[0].at, pending.fetchedAt);
  assert.equal(next.journal[0].candidateId, pending.id);
  const rejected = decide(next, "rejected", {}, later);
  assert.equal(rejected.candidates[0].status, "rejected");
  const accepted = decide(next, "accepted", {}, later);
  assert.equal(accepted.candidates[0].status, "accepted");
  const { workspace } = decodeDesk(accepted.desk);
  assert.equal(
    activeState(seed, workspace).evidence[WATCH.evidenceId].value.statement,
    "Stripe supports stablecoin settlement for eligible merchants.",
  );
});

test("an unchanged check after a pending change dates the carried snapshot at the candidate's fetch", () => {
  let review = check(initialReview(seed), 1);
  review = checkAt(review, 2, "CHECK-change", "2026-10-02T05:00:00.000Z");
  review = checkAt(review, 2, "CHECK-same", "2026-10-03T05:00:00.000Z");
  assert.equal(Object.values(review.snapshots)[0].at, "2026-10-03T05:00:00.000Z");
  const next = rolloverReview(review, actor, later);
  assert.equal(Object.values(next.snapshots)[0].at, "2026-10-02T05:00:00.000Z");
  assert.equal(Object.values(next.snapshots)[0].text, text(2));
  assert.equal(next.candidates[0].status, "pending");
  assert.equal(decide(next, "rejected", {}, later).candidates[0].status, "rejected");
});

test("a review with no snapshot rolls over to version 0, and version 0 is refused", () => {
  const unreachable = applyReview(
    initialReview(seed),
    {
      type: "check",
      opId: "CHECK-down",
      expectedVersion: 0,
      capture: { outcome: "unreachable", status: 503, note: "Down." },
    },
    actor,
    at,
  ).state;
  const next = rolloverReview(unreachable, actor, later);
  assert.equal(next.version, 0);
  assert.deepEqual(next.journal, []);
  assert.deepEqual(next.snapshots, {});
  assert.deepEqual(next.desk, unreachable.desk);
  assert.throws(
    () => rolloverReview(initialReview(seed), actor, later),
    /Nothing to carry into a new review period\./,
  );
  assert.throws(() => rolloverReview(unreachable, "", later), /Reviewer label required/);
  assert.throws(() => rolloverReview(unreachable, actor, "soon"), /Invalid new period date/);
});

test("the weekly brief marks carried checks and does not count them", () => {
  let review = check(initialReview(seed), 1);
  review = check(review, 2);
  const next = rolloverReview(review, actor, at);
  const brief = weeklyBrief(next, "2026-10-01T07:00:00.000Z");
  assert.match(brief, /^0 source checks; 0 accepted revisions; 0 rejected candidates; 1 candidates pending across history\.$/m);
  assert.match(brief, /changed, carried forward from review period version 2 \(not a new fetch\)/);
  const after = checkAt(next, 2, "CHECK-new", "2026-10-01T06:30:00.000Z");
  assert.match(weeklyBrief(after, "2026-10-01T07:00:00.000Z"), /^1 source checks;/m);
});
