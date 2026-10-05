import {
  validateDataset,
  validateWorkspace as validateLegacyWorkspace,
  DECISION_STATUSES,
  EVIDENCE_TYPES,
  validDate,
  safeUrl,
} from "./model.js";

export const WORKSPACE_VERSION = 2;
export const CHECK_OUTCOMES = ["unchanged", "content_revised", "unreachable"];
const copy = (value) => structuredClone(value);
const plain = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validId = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9-]{1,100}$/.test(value) &&
  !["constructor", "prototype"].includes(value);
const text = (value, max = 10000) =>
  typeof value === "string" && !!value.trim() && value.length <= max;
const list = (value, nonempty = false) =>
  Array.isArray(value) &&
  (!nonempty || value.length > 0) &&
  value.length <= 100 &&
  value.every((v) => text(v, 1000)) &&
  new Set(value).size === value.length;
const equal = (a, b) => canonical(a) === canonical(b);
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
export const uid = (prefix) => `${prefix}-${globalThis.crypto.randomUUID()}`;
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (plain(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function digest(value) {
  const input = canonical(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++)
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
const revision = (value) => `base-${digest(value)}`;
export function normalizeProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    ticker: profile.ticker,
    mode: profile.mode,
    issuer: profile.issuer ?? null,
    currency: profile.currency ?? null,
    markets: profile.markets ?? [],
    networks: profile.networks ?? [],
    useCase: profile.useCase ?? null,
    constraints: profile.constraints ?? [
      "Eligibility unknown",
      "Redemption terms unknown",
    ],
  };
}
export function prepareDataset(input) {
  const data = copy(input);
  const errors = validateDataset(data);
  assert(!errors.length, errors.slice(0, 5).join(" "));
  data.profile = normalizeProfile(data.profile);
  validateProfile(data.profile);
  if (!data.assumptions) {
    data.assumptions = data.priorities.flatMap((p) =>
      p.assumptions.map((statement, i) => ({
        id: `A-${p.id}-${i + 1}`,
        priorityId: p.id,
        statement,
        evidenceIds: [...p.evidenceIds],
        evidenceSnapshot: null,
        evidenceReviewedAt: p.evidenceReviewedAt,
        reviewBy: p.reviewBy,
      })),
    );
    for (const p of data.priorities)
      p.assumptionIds = data.assumptions
        .filter((a) => a.priorityId === p.id)
        .map((a) => a.id);
  }
  data.meta.schemaVersion = 2;
  return data;
}
function validateProfile(p) {
  assert(
    plain(p) &&
      validId(p.id) &&
      text(p.name, 80) &&
      /^[A-Z0-9]{2,12}$/.test(p.ticker ?? ""),
    "Invalid profile identity/name/ticker.",
  );
  assert(
    ["fictional_demo", "researched_profile"].includes(p.mode),
    "Invalid profile mode.",
  );
  assert(p.issuer === null || text(p.issuer, 200), "Invalid issuer subject.");
  assert(
    p.mode !== "fictional_demo" || p.issuer === null,
    "A fictional profile cannot claim a real issuer.",
  );
  assert(
    p.currency === null || text(p.currency, 80),
    "Invalid reference currency.",
  );
  assert(
    list(p.markets) && list(p.networks) && list(p.constraints),
    "Invalid intended markets, networks or constraints.",
  );
  assert(p.useCase === null || text(p.useCase, 3000), "Invalid use case.");
  assert(
    equal(p, normalizeProfile(p)),
    "Unexpected profile fields or missing explicit unknowns.",
  );
}
function validateSource(s, today) {
  assert(
    plain(s) &&
      validId(s.id) &&
      ["title", "publisher", "dateNote", "locator"].every((k) => text(s[k])),
    "Invalid source record.",
  );
  assert(
    safeUrl(s.url) && s.kind === "primary",
    "Source must have an original public HTTPS URL and primary provenance.",
  );
  assert(
    validDate(s.accessedAt) && s.accessedAt <= today,
    "Invalid source access date.",
  );
  assert(
    s.publishedAt === null ||
      (validDate(s.publishedAt) && s.publishedAt <= today),
    "Invalid source publication date.",
  );
  assert(
    s.eventDate === null ||
      ((validDate(s.eventDate) ||
        /^\d{4}-(0[1-9]|1[0-2])$/.test(s.eventDate)) &&
        s.eventDate <= today),
    "Invalid source event date.",
  );
}
function validateEvidence(e, state, today) {
  assert(
    plain(e) &&
      validId(e.id) &&
      ["statement", "scope", "independentCheck"].every((k) => text(e[k])),
    "Invalid evidence record.",
  );
  assert(
    Object.hasOwn(EVIDENCE_TYPES, e.type) &&
      ["active", "unknown", "withdrawn"].includes(e.status),
    "Invalid evidence classification/status.",
  );
  const synthetic = e.type === "synthetic_example";
  assert(
    e.subject === (synthetic ? "fictional_profile" : "public_market") &&
      e.sourceRole === (synthetic ? "context_only" : "supports_statement"),
    "Synthetic examples cannot be promoted into public market facts.",
  );
  assert(
    list(e.sourceIds, true) &&
      e.sourceIds.every((id) => Object.hasOwn(state.sources, id)),
    "Unresolved evidence source references.",
  );
  assert(
    list(e.organizationIds, true) &&
      e.organizationIds.every((id) => state.organizationIds.includes(id)),
    "Unresolved evidence organization references.",
  );
  assert(validDate(e.asOf) && e.asOf <= today, "Invalid evidence as-of date.");
}
function baseState(seed, profile) {
  const sources = Object.fromEntries(
    seed.sources.map((s) => [s.id, { value: copy(s), revision: revision(s) }]),
  );
  const evidence = Object.fromEntries(
    seed.evidence.map((e) => {
      const value = { ...copy(e), status: e.status ?? "active" };
      return [e.id, { value, revision: revision(value) }];
    }),
  );
  const assumptions = Object.fromEntries(
    seed.assumptions.map((a) => [
      a.id,
      {
        value: copy(a),
        revision: revision({
          id: a.id,
          priorityId: a.priorityId,
          statement: a.statement,
          evidenceIds: a.evidenceIds,
        }),
        review: null,
      },
    ]),
  );
  const decisions = Object.fromEntries(
    seed.decisions.map((d) => [
      d.id,
      {
        value: {
          status: d.status,
          owner: d.owner,
          reviewBy: d.reviewBy,
          notes: d.notes,
          basis: null,
        },
        revision: revision(d),
      },
    ]),
  );
  return {
    profile: copy(profile),
    profileRevision: revision(profile),
    sources,
    evidence,
    assumptions,
    decisions,
    checks: [],
    legacy: null,
    organizationIds: seed.organizations.map((o) => o.id),
  };
}
export function assumptionFingerprint(state, id) {
  const a = state.assumptions[id]?.value;
  assert(a, `Unknown assumption ${id}.`);
  const evidence = a.evidenceIds.map((eid) => state.evidence[eid]);
  const sourceIds = [
    ...new Set(evidence.flatMap((e) => e.value.sourceIds)),
  ].sort();
  return digest({
    profile: state.profile,
    profileRevision: state.profileRevision,
    assumptionRevision: state.assumptions[id].revision,
    assumption: {
      id: a.id,
      priorityId: a.priorityId,
      statement: a.statement,
      evidenceIds: a.evidenceIds,
    },
    evidence,
    sources: sourceIds.map((sid) => state.sources[sid]),
  });
}
function initialProjection(seed) {
  const profile = normalizeProfile(seed.profile);
  const state = baseState(seed, profile);
  for (const a of Object.values(state.assumptions)) {
    a.review = {
      fingerprint: a.value.evidenceSnapshot ?? null,
      reviewedAt: `${a.value.evidenceReviewedAt}T00:00:00.000Z`,
      reviewBy: a.value.reviewBy,
      note: "Initial synthetic baseline context reviewed.",
      actor: "Baseline",
      eventId: null,
    };
  }
  return {
    profiles: { [profile.id]: state },
    events: [],
    operations: new Set(),
  };
}
export function createWorkspace(seed, id = uid("WS")) {
  return {
    schemaVersion: 2,
    id,
    datasetHash: digest(seed),
    activeProfileId: seed.profile.id,
    events: [],
  };
}
export const workspaceHead = (ws) => ws.events.at(-1)?.id ?? "baseline";
function expected(state, kind, id) {
  if (kind === "profile_update")
    return { value: state.profile, revision: state.profileRevision };
  if (kind === "source_check")
    return { value: null, revision: state.sources[id]?.revision };
  if (kind === "assumption_review")
    return {
      value: state.assumptions[id]?.review,
      revision: state.assumptions[id]?.revision,
    };
  if (kind === "legacy_import") return { value: null, revision: "legacy-none" };
  const group = {
    evidence_revision: "evidence",
    assumption_update: "assumptions",
    decision_saved: "decisions",
  }[kind];
  return state[group]?.[id];
}
function applyEvent(projection, event, seed) {
  const today = event.at.slice(0, 10);
  if (event.type === "profile_created") {
    assert(
      event.profileId === event.recordId &&
        !Object.hasOwn(projection.profiles, event.profileId),
      "Duplicate profile.",
    );
    assert(
      event.before === null && event.expectedRevision === "absent",
      "Invalid profile creation basis.",
    );
    validateProfile(event.after);
    assert(event.after.id === event.profileId, "Profile ID mismatch.");
    if (event.after.mode === "researched_profile")
      assert(
        event.confirmedResearchMode === true,
        "Real research mode needs explicit confirmation.",
      );
    const state = baseState(seed, event.after);
    projection.profiles[event.profileId] = state;
    return;
  }
  assert(
    Object.hasOwn(projection.profiles, event.profileId),
    "Unresolved event profile.",
  );
  const state = projection.profiles[event.profileId];
  if (["source_added", "evidence_added"].includes(event.type)) {
    const group = event.type === "source_added" ? "sources" : "evidence";
    assert(
      !Object.hasOwn(state[group], event.recordId) &&
        event.before === null &&
        event.expectedRevision === "absent",
      "Record already exists or invalid addition basis.",
    );
    assert(event.after.id === event.recordId, "Record ID mismatch.");
    if (group === "sources") validateSource(event.after, today);
    else validateEvidence(event.after, state, today);
    state[group][event.recordId] = {
      value: copy(event.after),
      revision: event.id,
    };
    return;
  }
  const basis = expected(state, event.type, event.recordId);
  assert(
    basis &&
      basis.revision === event.expectedRevision &&
      equal(basis.value, event.before),
    "Revision conflict or inconsistent before values. Reload the latest record and preview again.",
  );
  if (event.type === "profile_update") {
    validateProfile(event.after);
    assert(
      event.after.id === event.profileId && event.recordId === event.profileId,
      "Profile identity cannot change.",
    );
    if (
      event.after.mode === "researched_profile" &&
      state.profile.mode !== "researched_profile"
    )
      assert(
        event.confirmedResearchMode === true,
        "Real research mode needs explicit confirmation.",
      );
    state.profile = copy(event.after);
    state.profileRevision = event.id;
  } else if (event.type === "evidence_revision") {
    validateEvidence(event.after, state, today);
    assert(event.after.id === event.recordId, "Evidence ID cannot change.");
    assert(
      (event.before.type === "synthetic_example") ===
        (event.after.type === "synthetic_example"),
      "Synthetic provenance cannot be converted into factual evidence.",
    );
    state.evidence[event.recordId] = {
      value: copy(event.after),
      revision: event.id,
    };
  } else if (event.type === "assumption_update") {
    const a = event.after;
    assert(
      a.id === event.recordId &&
        a.priorityId === event.before.priorityId &&
        text(a.statement) &&
        list(a.evidenceIds, true) &&
        a.evidenceIds.every((id) => Object.hasOwn(state.evidence, id)),
      "Invalid assumption or dependency references.",
    );
    state.assumptions[event.recordId] = {
      value: copy(a),
      revision: event.id,
      review: state.assumptions[event.recordId].review,
    };
  } else if (event.type === "source_check") {
    const c = event.after;
    assert(
      plain(c) &&
        c.sourceId === event.recordId &&
        CHECK_OUTCOMES.includes(c.outcome) &&
        validDate(c.checkedAt) &&
        c.checkedAt <= today &&
        Number.isInteger(c.reviewDays) &&
        c.reviewDays >= 1 &&
        c.reviewDays <= 365 &&
        text(c.note),
      "Invalid source check, date or cadence.",
    );
    if (c.outcome === "content_revised") {
      assert(
        list(c.evidenceRevisionIds, true),
        "Content revised must identify actual evidence revisions.",
      );
      for (const id of c.evidenceRevisionIds) {
        const revisionEvent = projection.events.find((e) => e.id === id);
        assert(
          revisionEvent &&
            revisionEvent.opId === event.opId &&
            ["evidence_revision", "evidence_added"].includes(
              revisionEvent.type,
            ) &&
            revisionEvent.after.sourceIds.includes(c.sourceId),
          "Revised source check must accompany a linked evidence revision in the same operation.",
        );
      }
    } else
      assert(
        !c.evidenceRevisionIds?.length,
        "An unchanged/unreachable check cannot claim evidence revisions.",
      );
    state.checks.push({
      ...copy(c),
      eventId: event.id,
      at: event.at,
      actor: event.actor,
    });
  } else if (event.type === "assumption_review") {
    const r = event.after;
    assert(
      plain(r) &&
        r.fingerprint === assumptionFingerprint(state, event.recordId) &&
        validDate(r.reviewBy) &&
        r.reviewBy >= today &&
        text(r.note) &&
        r.reviewedAt === event.at &&
        r.actor === event.actor &&
        r.eventId === event.id,
      "Assumption review does not match the current revision or date.",
    );
    assert(
      !state.assumptions[event.recordId].value.evidenceIds.some(
        (id) => state.evidence[id].value.status !== "active",
      ),
      "Unknown or withdrawn evidence blocks assumption endorsement. Revise its dependencies first.",
    );
    state.assumptions[event.recordId].review = copy(r);
  } else if (event.type === "decision_saved") {
    const d = event.after;
    assert(
      DECISION_STATUSES.includes(d.status) &&
        typeof d.owner === "string" &&
        d.owner.length <= 200 &&
        validDate(d.reviewBy) &&
        text(d.notes),
      "A decision needs valid status, owner, date and reasoning.",
    );
    const priority = seed.decisions.find(
      (d) => d.id === event.recordId,
    )?.priorityId;
    const ids = Object.values(state.assumptions)
      .filter((a) => a.value.priorityId === priority)
      .map((a) => a.value.id);
    assert(
      plain(d.basis) && equal(Object.keys(d.basis).sort(), ids.sort()),
      "Decision basis must include all linked assumptions.",
    );
    for (const id of ids)
      assert(
        equal(d.basis[id], assumptionBasis(state, id)),
        "Decision cites an inconsistent assumption revision.",
      );
    state.decisions[event.recordId] = { value: copy(d), revision: event.id };
  } else if (event.type === "legacy_import") {
    assert(
      state.legacy === null &&
        !validateLegacyWorkspace(event.after, seed).length,
      "Invalid or repeated legacy workspace.",
    );
    state.legacy = copy(event.after);
    for (const [id, d] of Object.entries(event.after.decisions))
      state.decisions[id] = {
        value: { ...copy(d), basis: null },
        revision: event.id,
      };
    for (const [priorityId, review] of Object.entries(event.after.reviews))
      for (const a of Object.values(state.assumptions))
        if (a.value.priorityId === priorityId)
          a.review = { ...copy(review), legacy: true, eventId: event.id };
  } else throw new Error("Unknown audit event type.");
}
export function projectWorkspace(seed, ws) {
  assert(
    plain(ws) &&
      ws.schemaVersion === 2 &&
      validId(ws.id) &&
      ws.datasetHash === digest(seed) &&
      Array.isArray(ws.events) &&
      ws.events.length <= 5000,
    "Invalid workspace or dataset history identity.",
  );
  const projection = initialProjection(seed);
  const ids = new Set();
  let previous = "baseline";
  let previousTime = "";
  let lastOperation = null;
  const operations = new Map();
  for (let i = 0; i < ws.events.length; i++) {
    const e = ws.events[i];
    assert(
      plain(e) &&
        validId(e.id) &&
        validId(e.opId) &&
        !ids.has(e.id) &&
        e.seq === i + 1 &&
        e.previousId === previous &&
        validId(e.profileId) &&
        validId(e.recordId) &&
        text(e.actor, 200) &&
        text(e.rationale) &&
        typeof e.expectedRevision === "string",
      "Malformed audit event or inconsistent sequence.",
    );
    assert(
      typeof e.at === "string" &&
        !Number.isNaN(Date.parse(e.at)) &&
        new Date(e.at).toISOString() === e.at &&
        e.at >= previousTime &&
        Date.parse(e.at) <= Date.now() + 300000,
      "Invalid audit event timestamp.",
    );
    assert(
      Object.hasOwn(e, "before") && Object.hasOwn(e, "after"),
      "Missing revision history values.",
    );
    assert(
      /^[0-9a-f]{8}$/.test(e.intentHash ?? ""),
      "Missing operation intent.",
    );
    if (operations.has(e.opId))
      assert(
        lastOperation === e.opId && operations.get(e.opId) === e.intentHash,
        "Repeated or inconsistent operation group.",
      );
    operations.set(e.opId, e.intentHash);
    lastOperation = e.opId;
    applyEvent(projection, e, seed);
    projection.events.push(e);
    projection.operations.add(e.opId);
    ids.add(e.id);
    previous = e.id;
    previousTime = e.at;
  }
  for (const event of ws.events.filter((e) => e.type === "evidence_added")) {
    assert(
      ws.events.some(
        (e) =>
          e.opId === event.opId &&
          e.type === "assumption_update" &&
          e.after.evidenceIds.includes(event.recordId) &&
          !e.before.evidenceIds.includes(event.recordId),
      ),
      "New evidence operation is missing its explicit assumption dependency revision.",
    );
  }
  assert(
    Object.hasOwn(projection.profiles, ws.activeProfileId),
    "Active profile does not exist.",
  );
  return projection;
}
export function validateV2Workspace(seed, ws) {
  try {
    projectWorkspace(seed, ws);
    return [];
  } catch (error) {
    return [error.message];
  }
}
export const activeState = (seed, ws) =>
  projectWorkspace(seed, ws).profiles[ws.activeProfileId];
export function assumptionBasis(state, id) {
  const a = state.assumptions[id];
  return {
    fingerprint: assumptionFingerprint(state, id),
    assumptionRevision: a.revision,
    evidenceRevisions: Object.fromEntries(
      a.value.evidenceIds.map((eid) => [eid, state.evidence[eid].revision]),
    ),
    reviewEventId: a.review?.eventId ?? null,
  };
}
export function assumptionStatus(
  state,
  id,
  today = new Date().toISOString().slice(0, 10),
) {
  const a = state.assumptions[id];
  const bad = a.value.evidenceIds.filter(
    (id) => state.evidence[id].value.status !== "active",
  );
  if (bad.length)
    return {
      label: "Blocked by evidence",
      tone: "warn",
      reason: `Unknown/withdrawn evidence: ${bad.join(", ")}. Reconsider the assumption or dependencies.`,
    };
  if (
    !a.review ||
    a.review.legacy ||
    a.review.fingerprint !== assumptionFingerprint(state, id)
  )
    return {
      label: "Needs assumption review",
      tone: "warn",
      reason: a.review?.legacy
        ? "Legacy review retained; the v2 dependency map needs explicit review."
        : "Profile, claim or dependency changed; review this assumption against the current revision.",
    };
  if (today > a.review.reviewBy)
    return {
      label: "Review overdue",
      tone: "warn",
      reason: `Assumption review was due ${a.review.reviewBy}.`,
    };
  return {
    label: a.review.eventId ? "Reviewed locally" : "Baseline reviewed",
    tone: "good",
    reason: `Reviewed dependency revision; next review ${a.review.reviewBy}. Source freshness is separate.`,
  };
}
export function priorityStatus(state, priorityId, today) {
  const assumptions = Object.values(state.assumptions).filter(
    (a) => a.value.priorityId === priorityId,
  );
  const states = assumptions.map((a) =>
    assumptionStatus(state, a.value.id, today),
  );
  return (
    states.find((s) => s.label === "Blocked by evidence") ??
    states.find((s) => s.tone === "warn") ??
    states.find((s) => s.label === "Reviewed locally") ??
    states[0]
  );
}
export function decisionStatus(seed, state, id, today) {
  const d = state.decisions[id].value;
  const p = seed.decisions.find((d) => d.id === id).priorityId;
  const current = Object.values(state.assumptions).filter(
    (a) => a.value.priorityId === p,
  );
  if (
    d.basis &&
    current.some(
      (a) =>
        d.basis[a.value.id]?.fingerprint !==
        assumptionFingerprint(state, a.value.id),
    )
  )
    return {
      label: "Decision stale",
      tone: "warn",
      reason:
        "Its recorded evidence/assumption basis has changed. The prior decision remains in history.",
    };
  const currentDate = today ?? new Date().toISOString().slice(0, 10);
  if (d.basis && currentDate > d.reviewBy)
    return {
      label: "Decision review overdue",
      tone: "warn",
      reason: `This assessment was due for review ${d.reviewBy}. Assumption and source deadlines are separate.`,
    };
  const status = priorityStatus(state, p, today);
  if (
    d.basis === null &&
    state.decisions[id].revision !==
      revision(seed.decisions.find((d) => d.id === id))
  )
    return {
      label: "Legacy decision retained",
      tone: "warn",
      reason: "Notes/status preserved; no v2 revision basis was inferred.",
    };
  return status;
}
export function sourceFreshness(
  seed,
  state,
  id,
  today = new Date().toISOString().slice(0, 10),
) {
  const source = state.sources[id].value;
  const latest = state.checks.filter((c) => c.sourceId === id).at(-1);
  const lastChecked = latest?.checkedAt ?? source.accessedAt;
  const due = new Date(`${lastChecked}T00:00:00Z`);
  due.setUTCDate(
    due.getUTCDate() + (latest?.reviewDays ?? seed.meta.reviewDays),
  );
  const dueAt = due.toISOString().slice(0, 10);
  return {
    label:
      latest?.outcome === "unreachable"
        ? "Coverage unresolved"
        : today > dueAt
          ? "Check overdue"
          : latest
            ? "Check recorded"
            : "Baseline accessed",
    tone: latest?.outcome === "unreachable" || today > dueAt ? "warn" : "",
    lastChecked,
    dueAt,
    outcome: latest?.outcome ?? "baseline_access",
    actor: latest?.actor ?? "Baseline",
  };
}
export function reviewQueue(
  seed,
  state,
  today = new Date().toISOString().slice(0, 10),
) {
  assert(validDate(today), "Invalid review queue date.");
  const items = [];
  const add = (kind, id, title, label, reason, dueAt, rank) =>
    items.push({ kind, id, title, label, reason, dueAt, rank });
  for (const [id, source] of Object.entries(state.sources)) {
    const status = sourceFreshness(seed, state, id, today);
    const unresolved = status.label === "Coverage unresolved";
    if (unresolved || status.dueAt <= today)
      add(
        "source",
        id,
        source.value.title,
        unresolved || status.dueAt !== today ? status.label : "Check due today",
        unresolved
          ? "The latest manual source check was unreachable. Resolve coverage before relying on this source."
          : `Source check ${status.dueAt === today ? "is due today" : `was due ${status.dueAt}`}. Checking a source does not review its assumptions or decisions.`,
        status.dueAt,
        unresolved ? 0 : 2,
      );
  }
  for (const [id, assumption] of Object.entries(state.assumptions)) {
    const status = assumptionStatus(state, id, today);
    const dueAt = assumption.review?.reviewBy ?? null;
    if (status.tone === "warn" || dueAt === today)
      add(
        "assumption",
        id,
        assumption.value.statement,
        status.tone === "warn" ? status.label : "Review due today",
        status.tone === "warn"
          ? status.reason
          : "This assumption is due for review today against its current dependencies.",
        dueAt,
        status.label === "Blocked by evidence"
          ? 0
          : status.label === "Needs assumption review"
            ? 1
            : 2,
      );
  }
  for (const [id, decision] of Object.entries(state.decisions)) {
    const status = decisionStatus(seed, state, id, today);
    const independent = [
      "Decision stale",
      "Decision review overdue",
      "Legacy decision retained",
    ].includes(status.label);
    if (
      independent ||
      (decision.value.basis && decision.value.reviewBy === today)
    ) {
      const priorityId = seed.decisions.find((d) => d.id === id).priorityId;
      add(
        "decision",
        id,
        seed.priorities.find((p) => p.id === priorityId).title,
        independent ? status.label : "Decision review due today",
        independent
          ? status.reason
          : "This assessment is due for review today. Assumption and source deadlines are separate.",
        decision.value.reviewBy,
        independent && status.label !== "Decision review overdue" ? 1 : 2,
      );
    }
  }
  // Coverage blockers first, then changed bases, then deadlines from oldest to newest.
  return items
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.rank === 2 ? a.dueAt.localeCompare(b.dueAt) : 0) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id),
    )
    .map(({ rank, ...item }) => item);
}
export function materializeDataset(seed, ws) {
  const state = activeState(seed, ws);
  const data = copy(seed);
  data.profile = copy(state.profile);
  data.sources = Object.values(state.sources).map((s) => copy(s.value));
  data.evidence = Object.values(state.evidence).map((e) => ({
    ...copy(e.value),
    revisionId: e.revision,
  }));
  data.assumptions = Object.values(state.assumptions).map((a) => copy(a.value));
  for (const p of data.priorities) {
    p.assumptions = data.assumptions
      .filter((a) => a.priorityId === p.id)
      .map((a) => a.statement);
    p.evidenceIds = [
      ...new Set([
        ...p.evidenceIds,
        ...data.assumptions
          .filter((a) => a.priorityId === p.id)
          .flatMap((a) => a.evidenceIds),
      ]),
    ];
  }
  for (const o of data.organizations)
    o.evidenceIds = [
      ...new Set([
        ...o.evidenceIds,
        ...data.evidence
          .filter((e) => e.organizationIds.includes(o.id))
          .map((e) => e.id),
      ]),
    ];
  return data;
}
export function previewEvidence(seed, ws, id, after) {
  const state = activeState(seed, ws),
    before = state.evidence[id]?.value;
  assert(before, "Unknown evidence record.");
  validateEvidence(after, state, new Date().toISOString().slice(0, 10));
  const fields = Object.keys(after)
    .filter((k) => !equal(before[k], after[k]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
  const affected = Object.values(state.assumptions)
    .filter((a) => a.value.evidenceIds.includes(id))
    .map((a) => ({
      id: a.value.id,
      statement: a.value.statement,
      priorityId: a.value.priorityId,
      decisionIds: seed.decisions
        .filter((d) => d.priorityId === a.value.priorityId)
        .map((d) => d.id),
    }));
  return { fields, affected, expectedRevision: state.evidence[id].revision };
}
export function commitOperation(seed, ws, command) {
  const projection = projectWorkspace(seed, ws);
  assert(
    validId(command.opId) &&
      text(command.actor, 200) &&
      text(command.rationale),
    "Operation needs ID, reviewer and rationale.",
  );
  const intentHash = digest({
    type: command.type,
    profileId: command.profileId,
    recordId: command.recordId,
    after: command.after,
    assumptionIds: command.assumptionIds ?? [],
    check: command.check ?? null,
    actor: command.actor,
    rationale: command.rationale,
    confirmedResearchMode: command.confirmedResearchMode === true,
  });
  if (projection.operations.has(command.opId)) {
    assert(
      ws.events.find((e) => e.opId === command.opId).intentHash === intentHash,
      "Operation ID reused with different edits; create a fresh preview.",
    );
    return { workspace: copy(ws), duplicate: true };
  }
  assert(
    command.expectedHead === workspaceHead(ws),
    "Workspace changed since this draft opened. Reload latest before saving; your draft is retained.",
  );
  const next = copy(ws);
  const at = command.at ?? new Date().toISOString();
  const append = (
    type,
    recordId,
    after,
    expectedRevision,
    before,
    extra = {},
  ) => {
    const event = {
      id: uid("EV"),
      opId: command.opId,
      seq: next.events.length + 1,
      previousId: workspaceHead(next),
      intentHash,
      at,
      actor: command.actor,
      rationale: command.rationale,
      type,
      profileId: command.profileId,
      recordId,
      expectedRevision,
      before: copy(before),
      after: copy(after),
      ...extra,
    };
    applyEvent(projection, event, seed);
    projection.events.push(event);
    next.events.push(event);
    return event.id;
  };
  if (command.type === "profile_created")
    append(
      command.type,
      command.profileId,
      normalizeProfile(command.after),
      "absent",
      null,
      { confirmedResearchMode: command.confirmedResearchMode === true },
    );
  else {
    const state = projection.profiles[command.profileId];
    assert(state, "Unknown profile.");
    if (command.type === "decision_saved") {
      const selected = command.assumptionIds ?? [];
      assert(
        list(selected) &&
          selected.every(
            (id) =>
              state.assumptions[id]?.value.priorityId ===
              seed.decisions.find((d) => d.id === command.recordId)?.priorityId,
          ),
        "Invalid assumption review selection.",
      );
      for (const id of selected) {
        const a = state.assumptions[id];
        const eventId = uid("EV");
        // Review IDs are generated once so the stored review and event match.
        const r = {
          fingerprint: assumptionFingerprint(state, id),
          reviewedAt: at,
          reviewBy: command.after.reviewBy,
          note: command.after.notes,
          actor: command.actor,
          eventId,
        };
        const e = {
          id: eventId,
          opId: command.opId,
          seq: next.events.length + 1,
          previousId: workspaceHead(next),
          intentHash,
          at,
          actor: command.actor,
          rationale: command.rationale,
          type: "assumption_review",
          profileId: command.profileId,
          recordId: id,
          expectedRevision: a.revision,
          before: copy(a.review),
          after: r,
        };
        applyEvent(projection, e, seed);
        projection.events.push(e);
        next.events.push(e);
      }
      const base = state.decisions[command.recordId];
      assert(
        base?.revision === command.expectedRevision,
        "Decision revision conflict.",
      );
      const priorityId = seed.decisions.find(
        (d) => d.id === command.recordId,
      ).priorityId;
      const basis = Object.fromEntries(
        Object.values(state.assumptions)
          .filter((a) => a.value.priorityId === priorityId)
          .map((a) => [a.value.id, assumptionBasis(state, a.value.id)]),
      );
      const after = { ...command.after, basis };
      if (!equal(after, base.value))
        append(
          "decision_saved",
          command.recordId,
          after,
          base.revision,
          base.value,
        );
    } else if (command.type === "evidence_added") {
      validateEvidence(command.after, state, at.slice(0, 10));
      const ids = command.assumptionIds ?? [];
      assert(
        list(ids, true) && ids.every((id) => state.assumptions[id]),
        "New evidence must be linked to selected assumptions.",
      );
      append("evidence_added", command.recordId, command.after, "absent", null);
      for (const id of ids) {
        const a = state.assumptions[id];
        append(
          "assumption_update",
          id,
          {
            ...a.value,
            evidenceIds: [
              ...new Set([...a.value.evidenceIds, command.recordId]),
            ],
          },
          a.revision,
          a.value,
        );
      }
    } else if (command.type === "source_added")
      append("source_added", command.recordId, command.after, "absent", null);
    else {
      const base = expected(state, command.type, command.recordId);
      assert(
        base && base.revision === command.expectedRevision,
        "Record revision conflict. Restore or refresh the retained draft.",
      );
      if (
        !equal(base.value, command.after) ||
        command.type === "source_check"
      ) {
        const id = append(
          command.type,
          command.recordId,
          command.after,
          base.revision,
          base.value,
          { confirmedResearchMode: command.confirmedResearchMode === true },
        );
        if (command.type === "evidence_revision" && command.check) {
          assert(
            command.after.sourceIds.includes(command.check.sourceId),
            "Source check must be linked to the revised evidence.",
          );
          const s = state.sources[command.check.sourceId];
          append(
            "source_check",
            command.check.sourceId,
            {
              ...command.check,
              outcome: "content_revised",
              evidenceRevisionIds: [id],
            },
            s.revision,
            null,
          );
        }
      }
    }
  }
  projectWorkspace(seed, next);
  return { workspace: next, duplicate: false };
}
export function migrateLegacy(seed, legacy, id = uid("WS")) {
  const errors = validateLegacyWorkspace(legacy, seed);
  assert(!errors.length, errors.join(" "));
  const ws = createWorkspace(seed, id);
  if (
    Object.keys(legacy.decisions).length ||
    Object.keys(legacy.reviews).length ||
    legacy.activity.length
  )
    return commitOperation(seed, ws, {
      type: "legacy_import",
      profileId: ws.activeProfileId,
      recordId: "legacy-workspace",
      expectedRevision: "legacy-none",
      after: copy(legacy),
      actor: "Migration",
      rationale:
        "Preserve generic v1 assessments, review notes and original activity without inventing a v2 revision basis.",
      opId: uid("OP"),
      expectedHead: workspaceHead(ws),
    }).workspace;
  return ws;
}
export function exportV2(seed, ws) {
  projectWorkspace(seed, ws);
  return {
    format: "stable-desk-workspace",
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    dataset: copy(seed),
    workspace: copy(ws),
  };
}
export function parseV2Import(input) {
  assert(
    typeof input === "string" && input.length <= 4_000_000,
    "Import is limited to 4 MB.",
  );
  const parsed = JSON.parse(input);
  assert(plain(parsed), "Import must be an object.");
  const seed = prepareDataset(
    parsed.format === "stable-desk-workspace" ? parsed.dataset : parsed,
  );
  if (parsed.format !== "stable-desk-workspace")
    return { seed, workspace: createWorkspace(seed), migrated: false };
  const ws =
    parsed.workspace?.schemaVersion === 2
      ? copy(parsed.workspace)
      : migrateLegacy(seed, parsed.workspace);
  projectWorkspace(seed, ws);
  return {
    seed,
    workspace: ws,
    migrated: parsed.workspace.schemaVersion !== 2,
  };
}
export function mergeWorkspace(seed, current, incoming) {
  projectWorkspace(seed, current);
  projectWorkspace(seed, incoming);
  assert(
    current.id === incoming.id,
    "Different workspace identity; open separately after archiving current work.",
  );
  const length = Math.min(current.events.length, incoming.events.length);
  for (let i = 0; i < length; i++)
    assert(
      equal(current.events[i], incoming.events[i]),
      "Divergent revision history. Import cannot silently overwrite a conflicting branch.",
    );
  return copy(
    incoming.events.length > current.events.length ? incoming : current,
  );
}
