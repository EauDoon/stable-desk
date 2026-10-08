import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  prepareDataset,
  createWorkspace,
  activeState,
  projectWorkspace,
  commitOperation,
  workspaceHead,
  uid,
  uuid,
  assumptionStatus,
  priorityStatus,
  decisionStatus,
  sourceFreshness,
  reviewQueue,
  previewEvidence,
  materializeDataset,
  migrateLegacy,
  parseV2Import,
  exportV2,
  mergeWorkspace,
  digest,
  IMPORT_LIMIT_BYTES,
  serializeWorkspace,
} from "../src/workspace.js";
import { blankWorkspace } from "../src/model.js";
const seed = prepareDataset(
  JSON.parse(
    await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
  ),
);
const fresh = () => createWorkspace(seed);
function command(ws, type, id, after, extra = {}) {
  const s = activeState(seed, ws);
  const key = {
    evidence_revision: "evidence",
    assumption_update: "assumptions",
    decision_saved: "decisions",
    source_check: "sources",
  }[type];
  return {
    type,
    recordId: id,
    after,
    profileId: ws.activeProfileId,
    expectedRevision: key
      ? s[key][id]?.revision
      : type === "profile_update"
        ? s.profileRevision
        : "absent",
    expectedHead: workspaceHead(ws),
    opId: uid("OP"),
    actor: "Researcher",
    rationale: "Public context reviewed; no automatic acceptance inferred.",
    ...extra,
  };
}
const apply = (ws, c) => commitOperation(seed, ws, c).workspace;
const edited = (ws, id = "E-G02") => ({
  ...activeState(seed, ws).evidence[id].value,
  scope: "Revised scope after manual source review.",
});
test("v2 seed has stable explicit assumption dependencies and genuine baseline history", () => {
  const ws = fresh(),
    s = activeState(seed, ws);
  assert.equal(seed.assumptions.length, 6);
  assert.equal(seed.changes.length, 2);
  assert.equal(
    priorityStatus(s, "P-G01", "2026-09-30").label,
    "Baseline reviewed",
  );
  assert.equal(Object.keys(s.profiles ?? {}).length, 0);
  assert.equal(ws.events.length, 0);
});
test("two profiles isolate claims, relationships, decisions, checks and reviews", () => {
  let ws = fresh();
  const profile = {
    ...activeState(seed, ws).profile,
    id: uid("PROFILE"),
    name: "Example Issuer",
    ticker: "EXAMPLE",
    currency: "USD",
    markets: ["Example region"],
    networks: ["Intended network"],
    useCase: "Hypothetical merchant settlement",
  };
  ws = apply(
    ws,
    command(ws, "profile_created", profile.id, profile, {
      profileId: profile.id,
    }),
  );
  const original = ws.activeProfileId;
  ws.activeProfileId = profile.id;
  const s = activeState(seed, ws);
  assert.equal(s.decisions["D-G01"].value.notes, "");
  assert.equal(
    assumptionStatus(s, "A-P-G01-1").label,
    "Needs assumption review",
  );
  ws = apply(ws, command(ws, "evidence_revision", "E-G02", edited(ws)));
  assert.equal(
    activeState(seed, ws).evidence["E-G02"].value.scope,
    "Revised scope after manual source review.",
  );
  ws.activeProfileId = original;
  assert.notEqual(
    activeState(seed, ws).evidence["E-G02"].value.scope,
    "Revised scope after manual source review.",
  );
  assert.equal(
    materializeDataset(seed, ws).organizations[0].relationship,
    "demo",
  );
});
test("researched profile requires explicit enablement and never promotes synthetic evidence", () => {
  let ws = fresh();
  const after = {
    ...activeState(seed, ws).profile,
    mode: "researched_profile",
    issuer: "Public research subject",
  };
  assert.throws(
    () => apply(ws, command(ws, "profile_update", after.id, after)),
    /confirmation/,
  );
  ws = apply(
    ws,
    command(ws, "profile_update", after.id, after, {
      confirmedResearchMode: true,
    }),
  );
  assert.equal(activeState(seed, ws).profile.mode, "researched_profile");
  const e = {
    ...activeState(seed, ws).evidence["E-G11"].value,
    type: "verified_fact",
    subject: "public_market",
    sourceRole: "supports_statement",
  };
  assert.throws(
    () => apply(ws, command(ws, "evidence_revision", e.id, e)),
    /Synthetic provenance/,
  );
  assert.equal(
    materializeDataset(seed, ws).priorities[0].mode,
    "synthetic_example",
  );
});
test("manual unchanged/unreachable source checks preserve publication, claim revisions and assumption review", () => {
  let ws = fresh();
  const before = activeState(seed, ws);
  const source = structuredClone(before.sources["S-G02"]);
  for (const outcome of ["unchanged", "unreachable"]) {
    ws = apply(
      ws,
      command(ws, "source_check", "S-G02", {
        sourceId: "S-G02",
        checkedAt: "2026-09-30",
        reviewDays: 7,
        outcome,
        note: "Manually checked public source; client outcome retained.",
        evidenceRevisionIds: [],
      }),
    );
    const s = activeState(seed, ws);
    assert.deepEqual(s.sources["S-G02"], source);
    assert.deepEqual(s.evidence["E-G02"], before.evidence["E-G02"]);
    assert.equal(
      assumptionStatus(s, "A-P-G01-2", "2026-09-30").label,
      "Baseline reviewed",
    );
    assert.equal(
      sourceFreshness(seed, s, "S-G02", "2026-09-30").label,
      outcome === "unreachable" ? "Coverage unresolved" : "Check recorded",
    );
  }
});
test("revision preview identifies changed fields and only exact dependent assumptions", () => {
  const ws = fresh();
  const p = previewEvidence(seed, ws, "E-G02", edited(ws));
  assert.deepEqual(
    p.fields.map((f) => f.field),
    ["scope"],
  );
  assert.deepEqual(
    p.affected.map((a) => a.id),
    ["A-P-G01-2"],
  );
  assert.deepEqual(p.affected[0].decisionIds, ["D-G01"]);
  const next = apply(ws, command(ws, "evidence_revision", "E-G02", edited(ws)));
  const s = activeState(seed, next);
  assert.equal(
    assumptionStatus(s, "A-P-G01-2").label,
    "Needs assumption review",
  );
  assert.equal(
    assumptionStatus(s, "A-P-G01-1", "2026-09-30").label,
    "Baseline reviewed",
  );
  assert.equal(
    priorityStatus(s, "P-G02", "2026-09-30").label,
    "Baseline reviewed",
  );
});
test("revised evidence and source check commit atomically under one operation", () => {
  const ws = fresh();
  const next = apply(
    ws,
    command(ws, "evidence_revision", "E-G02", edited(ws), {
      check: {
        sourceId: "S-G02",
        checkedAt: "2026-09-30",
        reviewDays: 30,
        note: "Source opened; evidence scope revised.",
      },
    }),
  );
  assert.equal(next.events.length, 2);
  assert.equal(next.events[0].opId, next.events[1].opId);
  assert.deepEqual(next.events[1].after.evidenceRevisionIds, [
    next.events[0].id,
  ]);
  assert.equal(activeState(seed, next).checks[0].outcome, "content_revised");
  assert.throws(
    () =>
      apply(
        ws,
        command(ws, "evidence_revision", "E-G02", edited(ws), {
          check: {
            sourceId: "S-G03",
            checkedAt: "2026-09-30",
            reviewDays: 30,
            note: "Wrong source",
          },
        }),
      ),
    /linked/,
  );
  assert.equal(ws.events.length, 0);
});
test("unknown/withdrawn claims block reviews while retaining prior evidence", () => {
  let ws = fresh();
  const before = activeState(seed, ws).evidence["E-G02"].value;
  for (const status of ["unknown", "withdrawn"]) {
    ws = apply(
      ws,
      command(ws, "evidence_revision", "E-G02", { ...before, status }),
    );
    const s = activeState(seed, ws);
    assert.equal(assumptionStatus(s, "A-P-G01-2").label, "Blocked by evidence");
    assert.throws(
      () =>
        apply(
          ws,
          command(
            ws,
            "decision_saved",
            "D-G01",
            {
              status: "Investigating",
              owner: "Researcher",
              reviewBy: "2026-10-30",
              notes: "Cannot endorse unsupported dependency.",
            },
            { assumptionIds: ["A-P-G01-2"] },
          ),
        ),
      /blocks/,
    );
  }
  assert.deepEqual(ws.events[0].before, before);
  assert.equal(ws.events.at(-1).after.status, "withdrawn");
});
test("decision review is revision-bound, reasoned and stale after later linked changes", () => {
  let ws = fresh();
  const after = {
    status: "Investigating",
    owner: "Researcher",
    reviewBy: "2026-10-30",
    notes: "Both assumptions checked against original public market scope.",
  };
  ws = apply(
    ws,
    command(ws, "decision_saved", "D-G01", after, {
      assumptionIds: ["A-P-G01-1", "A-P-G01-2"],
    }),
  );
  assert.equal(ws.events.length, 3);
  assert.equal(
    decisionStatus(seed, activeState(seed, ws), "D-G01", "2026-09-30").label,
    "Reviewed locally",
  );
  const decisionEvent = structuredClone(ws.events.at(-1));
  ws = apply(ws, command(ws, "evidence_revision", "E-G02", edited(ws)));
  assert.equal(
    decisionStatus(seed, activeState(seed, ws), "D-G01").label,
    "Decision stale",
  );
  assert.deepEqual(ws.events[2], decisionEvent);
  assert.throws(
    () =>
      apply(
        ws,
        command(ws, "decision_saved", "D-G01", { ...after, notes: "" }),
      ),
    /reasoning/,
  );
});
test("profile configuration invalidates only that profile assumptions and preserves decision basis", () => {
  let ws = fresh();
  const s = activeState(seed, ws);
  ws = apply(
    ws,
    command(ws, "profile_update", s.profile.id, {
      ...s.profile,
      currency: "USD",
      useCase: "Example flow",
    }),
  );
  const next = activeState(seed, ws);
  assert.equal(
    Object.values(next.assumptions).filter(
      (a) => assumptionStatus(next, a.value.id).tone === "warn",
    ).length,
    6,
  );
  assert.deepEqual(next.evidence, s.evidence);
});
test("stale revisions and stale workspace heads reject without partial history", () => {
  const ws = fresh();
  const a = command(ws, "evidence_revision", "E-G02", edited(ws));
  const newer = apply(ws, a);
  assert.throws(
    () => apply(newer, { ...a, opId: uid("OP") }),
    /Workspace changed/,
  );
  assert.throws(
    () =>
      apply(newer, {
        ...a,
        opId: uid("OP"),
        expectedHead: workspaceHead(newer),
      }),
    /revision conflict/i,
  );
  assert.equal(ws.events.length, 0);
  assert.equal(newer.events.length, 1);
});
test("repeated operation is idempotent; changed intent with same operation ID is rejected", () => {
  const ws = fresh();
  const c = command(ws, "evidence_revision", "E-G02", edited(ws));
  const saved = apply(ws, c);
  const duplicate = commitOperation(seed, saved, c);
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.workspace, saved);
  assert.throws(
    () =>
      apply(saved, { ...c, after: { ...c.after, scope: "Different values" } }),
    /reused/,
  );
  const noOp = apply(
    saved,
    command(
      saved,
      "evidence_revision",
      "E-G02",
      activeState(seed, saved).evidence["E-G02"].value,
    ),
  );
  assert.deepEqual(noOp, saved);
});
test("add original source and new evidence with explicit affected dependencies", () => {
  let ws = fresh();
  const source = {
    ...seed.sources[1],
    id: "S-LOCAL",
    title: "A newly reviewed original source",
    url: "https://example.org/public-docs",
  };
  ws = apply(ws, command(ws, "source_added", source.id, source));
  const e = {
    ...activeState(seed, ws).evidence["E-G02"].value,
    id: "E-LOCAL",
    sourceIds: [source.id],
    statement: "New scope-qualified public context.",
  };
  assert.throws(
    () => apply(ws, command(ws, "evidence_added", e.id, e)),
    /selected assumptions/,
  );
  ws = apply(
    ws,
    command(ws, "evidence_added", e.id, e, { assumptionIds: ["A-P-G01-2"] }),
  );
  const s = activeState(seed, ws);
  assert.ok(s.assumptions["A-P-G01-2"].value.evidenceIds.includes(e.id));
  assert.equal(
    assumptionStatus(s, "A-P-G01-2").label,
    "Needs assumption review",
  );
  assert.equal(
    priorityStatus(s, "P-G03", "2026-09-30").label,
    "Baseline reviewed",
  );
});
test("generic v1 migration preserves notes, statuses, reviews and original activity without inferring v2 approval", () => {
  const old = blankWorkspace();
  old.decisions["D-G01"] = {
    status: "Investigating",
    owner: "Reviewer",
    reviewBy: "2026-10-30",
    notes: "Existing notes must survive.",
  };
  old.reviews["P-G01"] = {
    fingerprint: "abcdef12",
    reviewedAt: "2026-09-30T10:00:00Z",
    reviewBy: "2026-10-30",
    note: "Previous reviewer reasoning.",
  };
  old.activity.push({
    kind: "decision_edit",
    at: "2026-09-30T10:00:00Z",
    summary: "Actual old edit.",
  });
  const ws = migrateLegacy(seed, old);
  const s = activeState(seed, ws);
  assert.deepEqual(s.legacy, old);
  assert.equal(s.decisions["D-G01"].value.notes, old.decisions["D-G01"].notes);
  assert.equal(
    decisionStatus(seed, s, "D-G01").label,
    "Legacy decision retained",
  );
  assert.match(assumptionStatus(s, "A-P-G01-1").reason, /Legacy review/);
  const payload = {
    format: "stable-desk-workspace",
    dataset: seed,
    workspace: old,
  };
  const migrated = parseV2Import(JSON.stringify(payload));
  assert.equal(migrated.migrated, true);
  assert.deepEqual(activeState(seed, migrated.workspace).legacy, old);
});
test("export/import restores full replay, profile states and auditable history", () => {
  let ws = fresh();
  ws = apply(ws, command(ws, "evidence_revision", "E-G02", edited(ws)));
  const restored = parseV2Import(JSON.stringify(exportV2(seed, ws)));
  assert.deepEqual(restored.seed, seed);
  assert.deepEqual(restored.workspace, ws);
  assert.deepEqual(
    activeState(seed, restored.workspace),
    activeState(seed, ws),
  );
});
test("history validation rejects tampering, malformed imports, missing references and impossible timestamps", () => {
  let ws = fresh();
  ws = apply(ws, command(ws, "evidence_revision", "E-G02", edited(ws)));
  for (const mutate of [
    (p) => (p.workspace.events[0].seq = 2),
    (p) => (p.workspace.events[0].previousId = "wrong"),
    (p) => (p.workspace.events[0].before.scope = "Rewritten old values"),
    (p) => (p.workspace.events[0].after.sourceIds = ["missing"]),
    (p) => (p.workspace.events[0].at = "2099-01-01T00:00:00.000Z"),
    (p) => (p.workspace.events[0].id = "constructor"),
    (p) => (p.workspace.activeProfileId = "missing"),
    (p) => (p.workspace.datasetHash = "00000000"),
    (p) => p.workspace.events.push(p.workspace.events[0]),
  ]) {
    const payload = exportV2(seed, ws);
    mutate(payload);
    assert.throws(() => parseV2Import(JSON.stringify(payload)));
  }
  assert.throws(() => parseV2Import("{"), /not valid JSON/);
  assert.throws(() => parseV2Import(" ".repeat(IMPORT_LIMIT_BYTES + 1)), /4 MB/);
});
test("imports report typed errors and one 4 MiB limit", () => {
  assert.equal(IMPORT_LIMIT_BYTES, 4 * 1024 * 1024);
  for (const input of ["{}", '{"meta":null}', "[]", "null", '"text"'])
    assert.throws(
      () => parseV2Import(input),
      (error) => !/Cannot read properties|is not a function|undefined/.test(error.message),
      input,
    );
  assert.throws(() => parseV2Import("{}"), /Dataset meta must be an object/);
  assert.throws(() => parseV2Import(null), /JSON text/);
  assert.throws(() => parseV2Import(undefined), /JSON text/);
  assert.throws(() => parseV2Import("{"), /^Error: Import is not valid JSON\.$/);
  // The limit only loosened: 4,000,001 characters was refused before and is accepted now.
  const padded = JSON.stringify(exportV2(seed, fresh())).padEnd(4_000_001, " ");
  assert.equal(parseV2Import(padded).seed.meta.version, seed.meta.version);
});
test("a save that could not be reopened is refused before it is written", () => {
  const ws = fresh();
  const raw = serializeWorkspace(seed, ws);
  assert.ok(raw.length < IMPORT_LIMIT_BYTES);
  assert.equal(parseV2Import(raw).workspace.id, ws.id);
  assert.throws(() => serializeWorkspace(seed, ws, 1000), /exceed 4 MB/);
  assert.throws(() => serializeWorkspace(seed, ws, raw.length - 1), /nothing was saved/);
});
test("import merge accepts prefix continuations and rejects divergent or different identities", () => {
  const base = fresh();
  const a = apply(
    base,
    command(base, "evidence_revision", "E-G02", edited(base)),
  );
  const b = apply(
    base,
    command(base, "evidence_revision", "E-G02", {
      ...edited(base),
      scope: "Another branch",
    }),
  );
  assert.deepEqual(mergeWorkspace(seed, base, a), a);
  assert.deepEqual(mergeWorkspace(seed, a, base), a);
  assert.throws(() => mergeWorkspace(seed, a, b), /Divergent/);
  assert.throws(
    () => mergeWorkspace(seed, a, { ...a, id: uid("WS") }),
    /Different workspace/,
  );
});
test("source cadence and assumption deadlines remain distinct", () => {
  const s = activeState(seed, fresh());
  assert.equal(
    sourceFreshness(seed, s, "S-G02", "2026-10-31").label,
    "Check overdue",
  );
  assert.equal(
    assumptionStatus(s, "A-P-G01-2", "2026-10-31").label,
    "Review overdue",
  );
});

test("malformed seed review metadata and incomplete new-evidence operations are rejected", () => {
  for (const mutate of [
    (data) => {
      data.assumptions[0].reviewBy = "invalid";
    },
    (data) => {
      data.assumptions[0].evidenceSnapshot = "invented-approval";
    },
    (data) => {
      data.assumptions[0].evidenceReviewedAt = "2099-01-01";
    },
    (data) => {
      data.priorities[0].assumptionIds.push(
        data.priorities[0].assumptionIds[0],
      );
    },
    (data) => {
      data.priorities[0].assumptionIds.pop();
    },
    (data) => {
      data.evidence[0].status = "fictional-ready";
    },
    (data) => {
      data.profile.constraints = "unknown";
    },
  ]) {
    const data = structuredClone(seed);
    mutate(data);
    assert.throws(() => parseV2Import(JSON.stringify(data)));
  }
  const ws = fresh(),
    s = activeState(seed, ws),
    id = uid("E");
  const next = apply(
    ws,
    command(
      ws,
      "evidence_added",
      id,
      { ...s.evidence["E-G11"].value, id },
      { assumptionIds: ["A-P-G01-1"] },
    ),
  );
  const truncated = { ...next, events: next.events.slice(0, 1) };
  assert.throws(
    () => projectWorkspace(seed, truncated),
    /missing its explicit assumption/,
  );
  assert.equal(
    activeState(seed, next).assumptions["A-P-G01-1"].value.evidenceIds.includes(
      id,
    ),
    true,
  );
});

test("reverting profile or assumption text still requires review of the new revision", () => {
  let ws = fresh();
  const profile = structuredClone(activeState(seed, ws).profile);
  ws = apply(
    ws,
    command(
      ws,
      "decision_saved",
      "D-G01",
      {
        status: "Investigating",
        owner: "Researcher",
        reviewBy: "2026-10-30",
        notes: "Baseline context reviewed.",
      },
      { assumptionIds: ["A-P-G01-1", "A-P-G01-2"] },
    ),
  );
  ws = apply(
    ws,
    command(ws, "profile_update", profile.id, {
      ...profile,
      useCase: "Intended example use case.",
    }),
  );
  ws = apply(ws, command(ws, "profile_update", profile.id, profile));
  assert.equal(priorityStatus(activeState(seed, ws), "P-G01").tone, "warn");
  assert.equal(
    decisionStatus(seed, activeState(seed, ws), "D-G01").label,
    "Decision stale",
  );
  ws = fresh();
  const a = structuredClone(
    activeState(seed, ws).assumptions["A-P-G01-1"].value,
  );
  ws = apply(
    ws,
    command(ws, "assumption_update", a.id, {
      ...a,
      statement: "Revised hypothesis.",
    }),
  );
  ws = apply(ws, command(ws, "assumption_update", a.id, a));
  assert.equal(
    assumptionStatus(activeState(seed, ws), a.id).label,
    "Needs assumption review",
  );
});

test("an assessment deadline is enforced separately from its still-valid assumptions", () => {
  let ws = fresh();
  ws = apply(
    ws,
    command(ws, "decision_saved", "D-G01", {
      status: "Parked",
      owner: "Researcher",
      reviewBy: "2026-09-29",
      notes: "Retain an older due date; this assessment still needs follow-up.",
    }),
  );
  const s = activeState(seed, ws);
  assert.equal(
    priorityStatus(s, "P-G01", "2026-09-30").label,
    "Baseline reviewed",
  );
  assert.equal(
    decisionStatus(seed, s, "D-G01", "2026-09-30").label,
    "Decision review overdue",
  );
});

test("review queue includes due-today work at the UTC boundary without duplicating inherited decision warnings", () => {
  let ws = fresh();
  ws = apply(
    ws,
    command(ws, "decision_saved", "D-G01", {
      status: "Investigating",
      owner: "Researcher",
      reviewBy: "2026-10-30",
      notes: "Review this assessment when its own deadline arrives.",
    }),
  );
  const state = activeState(seed, ws);
  const before = structuredClone(state);
  assert.deepEqual(reviewQueue(seed, state, "2026-10-29"), []);
  const due = reviewQueue(seed, state, "2026-10-30");
  assert.equal(due.length, 17);
  assert.deepEqual(due.find((item) => item.id === "D-G01"), {
    kind: "decision",
    id: "D-G01",
    title: seed.priorities[0].title,
    label: "Decision review due today",
    reason:
      "This assessment is due for review today. Assumption and source deadlines are separate.",
    dueAt: "2026-10-30",
  });
  assert.equal(due.find((item) => item.id === "S-G02").label, "Check due today");
  assert.equal(
    due.find((item) => item.id === "A-P-G01-2").label,
    "Review due today",
  );
  assert.ok(due.every((item) => item.dueAt === "2026-10-30"));
  const overdue = reviewQueue(seed, state, "2026-10-31");
  assert.equal(overdue.length, 17);
  assert.equal(
    overdue.find((item) => item.id === "D-G01").label,
    "Decision review overdue",
  );
  assert.equal(overdue.filter((item) => item.kind === "decision").length, 1);
  assert.deepEqual(state, before);
  assert.throws(() => reviewQueue(seed, state, "2026-02-30"), /date/i);
});

test("review queue orders blocked coverage, changed bases, then the oldest deadlines with stable ties", () => {
  let ws = fresh();
  const at = "2026-09-30T12:00:00.000Z";
  for (const [id, reviewBy, assumptionIds] of [
    ["D-G01", "2026-10-30", []],
    ["D-G02", "2026-10-03", ["A-P-G02-1"]],
  ]) {
    ws = apply(
      ws,
      command(ws, "decision_saved", id, {
        status: "Investigating",
        owner: "Researcher",
        reviewBy,
        notes: "The assessment and selected assumptions have explicit deadlines.",
      }, { at, assumptionIds }),
    );
  }
  ws = apply(
    ws,
    command(ws, "evidence_revision", "E-G02", {
      ...edited(ws),
      status: "unknown",
    }, { at }),
  );
  ws = apply(
    ws,
    command(ws, "evidence_revision", "E-G07", edited(ws, "E-G07"), { at }),
  );
  for (const [id, outcome, reviewDays] of [
    ["S-G01", "unreachable", 30],
    ["S-G02", "unchanged", 1],
    ["S-G03", "unchanged", 5],
  ]) {
    ws = apply(
      ws,
      command(ws, "source_check", id, {
        sourceId: id,
        outcome,
        reviewDays,
        checkedAt: "2026-09-30",
        note: "Manual source observation, separate from assumption endorsement.",
        evidenceRevisionIds: [],
      }, { at }),
    );
  }
  const queue = reviewQueue(seed, activeState(seed, ws), "2026-10-05");
  assert.deepEqual(queue.map((item) => [item.id, item.label]), [
    ["A-P-G01-2", "Blocked by evidence"],
    ["S-G01", "Coverage unresolved"],
    ["A-P-G03-2", "Needs assumption review"],
    ["D-G01", "Decision stale"],
    ["S-G02", "Check overdue"],
    ["A-P-G02-1", "Review overdue"],
    ["D-G02", "Decision review overdue"],
    ["S-G03", "Check due today"],
  ]);
  assert.equal(queue[0].title, seed.assumptions[1].statement);
  assert.equal(queue[1].title, seed.sources[0].title);
  assert.equal(queue[1].dueAt, "2026-10-30");
  assert.deepEqual(
    queue.slice(4).map((item) => item.dueAt),
    ["2026-10-01", "2026-10-03", "2026-10-03", "2026-10-05"],
  );
});

test("review queue preserves assumption and decision work after source checks and isolates profiles", () => {
  let ws = fresh();
  ws = apply(
    ws,
    command(ws, "decision_saved", "D-G01", {
      status: "Investigating",
      owner: "Researcher",
      reviewBy: "2026-10-30",
      notes: "Keep this recorded basis when its source is checked again.",
    }),
  );
  ws = apply(ws, command(ws, "evidence_revision", "E-G02", edited(ws)));
  const originalQueue = reviewQueue(seed, activeState(seed, ws), "2026-10-05");
  assert.deepEqual(originalQueue.map((item) => item.id), ["A-P-G01-2", "D-G01"]);
  ws = apply(
    ws,
    command(ws, "source_check", "S-G02", {
      sourceId: "S-G02",
      checkedAt: "2026-09-30",
      reviewDays: 30,
      outcome: "unchanged",
      evidenceRevisionIds: [],
      note: "An unchanged source does not endorse a changed assumption or decision.",
    }),
  );
  assert.deepEqual(
    reviewQueue(seed, activeState(seed, ws), "2026-10-05"),
    originalQueue,
  );
  const originalId = ws.activeProfileId;
  const profile = {
    ...activeState(seed, ws).profile,
    id: uid("PROFILE"),
    name: "Separate research",
    ticker: "SEPARATE",
  };
  ws = apply(
    ws,
    command(ws, "profile_created", profile.id, profile, {
      profileId: profile.id,
    }),
  );
  ws.activeProfileId = profile.id;
  const otherQueue = reviewQueue(seed, activeState(seed, ws), "2026-10-05");
  assert.equal(otherQueue.length, seed.assumptions.length);
  assert.ok(
    otherQueue.every((item) => item.kind === "assumption" && item.dueAt === null),
  );
  ws.activeProfileId = originalId;
  assert.deepEqual(
    reviewQueue(seed, activeState(seed, ws), "2026-10-05"),
    originalQueue,
  );
});

test("review queue retains an independent legacy decision without claiming a new review basis", () => {
  const legacy = blankWorkspace();
  legacy.decisions["D-G01"] = {
    status: "Investigating",
    owner: "Researcher",
    reviewBy: "2026-10-30",
    notes: "Preserved legacy assessment.",
  };
  const state = activeState(seed, migrateLegacy(seed, legacy));
  const queue = reviewQueue(seed, state, "2026-10-05");
  assert.equal(queue.length, 1);
  assert.equal(queue[0].label, "Legacy decision retained");
  assert.equal(queue[0].dueAt, "2026-10-30");
  assert.equal(state.decisions["D-G01"].value.basis, null);
});

test("IDs fall back to getRandomValues where randomUUID is unavailable", () => {
  const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const fallback = uuid({ getRandomValues: (a) => a.fill(0xab) });
  assert.match(fallback, v4);
  assert.equal(fallback, "abababab-abab-4bab-abab-abababababab");
  assert.match(uuid({ getRandomValues: (a) => a.fill(0) }), v4);
  assert.match(uuid({ getRandomValues: (a) => a.fill(0xff) }), v4);
  // A secure context keeps using the platform generator.
  assert.equal(uuid({ randomUUID: () => "platform-value", getRandomValues: () => assert.fail() }), "platform-value");
  assert.match(uuid(), v4);
  // The fallback ID still satisfies the stored ID format and replays.
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const { getRandomValues } = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: (a) => getRandomValues.call(original.value ?? original.get.call(globalThis), a) },
  });
  try {
    const id = uid("WS");
    assert.match(id, /^WS-[0-9a-f-]{36}$/);
    const ws = createWorkspace(seed);
    assert.match(ws.id, /^WS-/);
    assert.equal(projectWorkspace(seed, ws).events.length, 0);
    assert.equal(parseV2Import(JSON.stringify(exportV2(seed, ws))).workspace.id, ws.id);
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});
