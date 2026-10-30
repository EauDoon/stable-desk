import { sha256 } from "./sha256.js";
import {
  activeState,
  commitOperation,
  createWorkspace,
  exportV2,
  parseV2Import,
  workspaceHead,
  canonical,
  uuid,
  IMPORT_LIMIT_BYTES,
} from "./workspace.js";

export const WATCH = Object.freeze({
  id: "S-G02",
  evidenceId: "E-G02",
  url: "https://docs.stripe.com/payments/stablecoin-payments",
  title: "Stripe stablecoin payments",
  selector: 'main, article, [role="main"]',
});
export const REVIEW_MAX_EVENTS = 60;
export const hash = (value) =>
  sha256(typeof value === "string" ? value : canonical(value));
export const decodeDesk = (value) =>
  parseV2Import(typeof value === "string" ? value : JSON.stringify(value));
export class ReviewError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const requireThat = (value, message, status = 400) => {
  if (!value) throw new ReviewError(message, status);
};
const record = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function initialReview(seed, imported = null) {
  const record = imported
    ? decodeDesk(imported)
    : { seed, workspace: createWorkspace(seed) };
  return {
    schemaVersion: 4,
    version: 0,
    desk: exportV2(record.seed, record.workspace),
    snapshots: {},
    checks: [],
    candidates: [],
    journal: [],
  };
}
export function validateReview(value) {
  requireThat(
    value?.schemaVersion === 4 &&
      Number.isSafeInteger(value.version) &&
      value.version >= 0,
    "Unsupported review backup.",
  );
  decodeDesk(value.desk);
  requireThat(
    Array.isArray(value.journal) &&
      value.version === value.journal.length &&
      value.journal.length <= REVIEW_MAX_EVENTS &&
      value.journal.every(record),
    "Invalid review history.",
  );
  requireThat(
    Array.isArray(value.checks) &&
      value.checks.every(record) &&
      Array.isArray(value.candidates) &&
      record(value.snapshots),
    "Incomplete review state.",
  );
  requireThat(value.candidates.every(record), "Invalid candidate.");
  requireThat(
    Object.values(value.snapshots).every(record),
    "Invalid source snapshot.",
  );
  const ops = new Set(),
    ids = new Set();
  let previous = "baseline";
  for (const event of value.journal) {
    const { eventHash, ...body } = event;
    requireThat(
      eventHash === hash(body) &&
        event.previousHash === previous &&
        !ops.has(event.opId) &&
        event.seq === ops.size + 1,
      "Review history continuity failed.",
    );
    requireThat(
      typeof event.actor === "string" && !Number.isNaN(Date.parse(event.at)),
      "Invalid review event.",
    );
    ops.add(event.opId);
    previous = eventHash;
  }
  for (const snapshot of Object.values(value.snapshots))
    requireThat(
      snapshot.sourceId === WATCH.id &&
        snapshot.url === WATCH.url &&
        typeof snapshot.text === "string" &&
        snapshot.hash === hash(snapshot.text) &&
        snapshot.text.length <= 20000,
      "Invalid source snapshot.",
    );
  for (const check of value.checks)
    requireThat(
      check.sourceId === WATCH.id &&
        check.url === WATCH.url &&
        ["baseline", "changed", "unchanged", "unreachable"].includes(
          check.outcome,
        ) &&
        !Number.isNaN(Date.parse(check.at)) &&
        value.journal.some(
          (e) =>
            e.type === "check" &&
            e.checkId === check.id &&
            e.at === check.at &&
            e.actor === check.actor &&
            e.outcome === check.outcome,
        ),
      "Source check history is inconsistent.",
    );
  for (const candidate of value.candidates) {
    requireThat(
      !ids.has(candidate.id) &&
        ["pending", "accepted", "rejected", "superseded"].includes(
          candidate.status,
        ),
      "Invalid candidate.",
    );
    ids.add(candidate.id);
    requireThat(
      candidate.sourceId === WATCH.id &&
        candidate.url === WATCH.url &&
        candidate.afterHash === hash(candidate.afterText) &&
        candidate.beforeHash === hash(candidate.beforeText),
      "Candidate citation integrity failed.",
    );
    requireThat(
      candidate.profileId &&
        candidate.evidenceId === WATCH.evidenceId &&
        typeof candidate.beforeText === "string" &&
        typeof candidate.afterText === "string" &&
        candidate.beforeText.length <= 20000 &&
        candidate.afterText.length <= 20000 &&
        !Number.isNaN(Date.parse(candidate.fetchedAt)) &&
        !Number.isNaN(Date.parse(candidate.previousFetchedAt)) &&
        value.journal.some(
          (e) =>
            e.type === "check" &&
            e.candidateId === candidate.id &&
            e.at === candidate.fetchedAt,
        ),
      "Invalid candidate target.",
    );
    if (candidate.status === "accepted" || candidate.status === "rejected")
      requireThat(
        value.journal.some(
          (e) =>
            e.candidateId === candidate.id &&
            e.type === candidate.status &&
            e.actor === candidate.reviewedBy &&
            e.at === candidate.reviewedAt &&
            (candidate.status !== "accepted" ||
              value.desk.workspace.events.some((v) => v.id === e.adoptedHead)),
        ),
        "Missing review history.",
      );
  }
  // Restore must preserve both sides of the journal links, not merely validate
  // whichever derived records happen to remain in the imported file.
  for (const event of value.journal) {
    requireThat(["check", "accepted", "rejected", "command"].includes(event.type), "Invalid review event type.");
    if (event.type === "check") {
      requireThat(value.checks.filter((check) => check.id === event.checkId).length === 1,
        "Missing or duplicate source check record.");
      if (event.outcome === "changed")
        requireThat(value.candidates.some((candidate) => candidate.id === event.candidateId),
          "Missing source candidate record.");
    }
    if (event.type === "accepted" || event.type === "rejected")
      requireThat(value.candidates.some((candidate) => candidate.id === event.candidateId &&
        candidate.status === event.type && candidate.afterHash === event.sourceHash),
        "Missing or inconsistent reviewed candidate.");
  }
  const latest = new Map();
  for (const check of value.checks)
    if (check.outcome !== "unreachable") latest.set(`${check.profileId}:${WATCH.id}`, check);
  requireThat(Object.keys(value.snapshots).length === latest.size, "Incomplete source snapshots.");
  for (const [key, check] of latest) {
    const snapshot = value.snapshots[key];
    requireThat(snapshot && snapshot.profileId === check.profileId &&
      snapshot.at === check.at && snapshot.hash === check.hash,
      "Missing or inconsistent latest source snapshot.");
  }
  requireThat(
    new TextEncoder().encode(JSON.stringify(value)).length <= IMPORT_LIMIT_BYTES,
    "Review history exceeds the 4 MB limit; export a review backup, then choose Start new review period to continue.",
  );
  return value;
}
export function applyReview(
  current,
  input,
  actor,
  now = new Date().toISOString(),
) {
  validateReview(current);
  requireThat(
    typeof input.opId === "string" && /^[a-zA-Z0-9_-]{1,150}$/.test(input.opId),
    "Operation ID required.",
  );
  const intentHash = hash(input);
  const prior = current.journal.find((e) => e.opId === input.opId);
  if (prior) {
    requireThat(
      prior.intentHash === intentHash && prior.actor === actor,
      "Operation ID reused with changed intent.",
      409,
    );
    return { state: current, duplicate: true };
  }
  requireThat(
    input.expectedVersion === current.version,
    "Workspace changed. Reload and review again; your draft is retained.",
    409,
  );
  requireThat(
    current.version < REVIEW_MAX_EVENTS,
    "Bounded review limit of 60 operations reached. Export a review backup, then choose Start new review period to continue from the current snapshots and pending candidates.",
  );
  const next = structuredClone(current),
    parsed = decodeDesk(next.desk),
    { seed, workspace } = parsed;
  const active = activeState(seed, workspace),
    profileId = workspace.activeProfileId,
    key = `${profileId}:${WATCH.id}`;
  const details = {};
  if (input.type === "check") {
    const capture = input.capture;
    requireThat(
      active.sources[WATCH.id]?.value.url === WATCH.url,
      "This profile does not match the approved source URL.",
    );
    requireThat(
      capture && ["ok", "unreachable"].includes(capture.outcome),
      "Invalid collection result.",
    );
    const check = {
      id: uuid(),
      sourceId: WATCH.id,
      url: WATCH.url,
      profileId,
      at: now,
      actor,
      outcome: capture.outcome,
      status: capture.status ?? null,
      note: capture.note ?? "",
      hash: null,
    };
    if (capture.outcome === "ok") {
      requireThat(
        typeof capture.text === "string" &&
          capture.text.length >= 80 &&
          capture.text.length <= 20000,
        "Source text is empty or exceeds the review bound.",
      );
      const contentHash = hash(capture.text),
        old = next.snapshots[key];
      check.hash = contentHash;
      check.outcome = !old
        ? "baseline"
        : old.hash === contentHash
          ? "unchanged"
          : "changed";
      if (old && old.hash !== contentHash) {
        for (const c of next.candidates.filter(
          (c) => c.profileId === profileId && c.status === "pending",
        ))
          c.status = "superseded";
        const evidence = active.evidence[WATCH.evidenceId];
        requireThat(
          evidence?.value.subject === "public_market" &&
            evidence.value.sourceIds.includes(WATCH.id),
          "Approved public-market evidence target is unavailable.",
        );
        const candidate = {
          id: uuid(),
          sourceId: WATCH.id,
          evidenceId: WATCH.evidenceId,
          url: WATCH.url,
          title: WATCH.title,
          profileId,
          fetchedAt: now,
          previousFetchedAt: old.at,
          beforeHash: old.hash,
          afterHash: contentHash,
          beforeText: old.text,
          afterText: capture.text,
          evidenceRevision: evidence.revision,
          workspaceHead: workspaceHead(workspace),
          status: "pending",
          suggestedStatement: null,
          note: "Source text changed. A human must write and classify the adopted claim; this is not an AI conclusion.",
        };
        next.candidates.push(candidate);
        details.candidateId = candidate.id;
      }
      next.snapshots[key] = {
        sourceId: WATCH.id,
        url: WATCH.url,
        profileId,
        at: now,
        hash: contentHash,
        text: capture.text,
      };
    }
    next.checks.push(check);
    details.checkId = check.id;
    details.outcome = check.outcome;
  } else if (input.type === "accepted" || input.type === "rejected") {
    const c = next.candidates.find((c) => c.id === input.candidateId);
    requireThat(
      c && c.status === "pending" && c.profileId === profileId,
      "Candidate is unavailable or already reviewed.",
      409,
    );
    requireThat(
      input.expectedCandidateHash === c.afterHash &&
        next.snapshots[key]?.hash === c.afterHash,
      "Source candidate is stale.",
      409,
    );
    requireThat(
      typeof input.rationale === "string" &&
        input.rationale.trim().length >= 8 &&
        input.rationale.length <= 2000,
      "Explain the review decision.",
    );
    if (input.type === "accepted") {
      const e = active.evidence[c.evidenceId];
      requireThat(
        workspaceHead(workspace) === c.workspaceHead &&
          e.revision === c.evidenceRevision,
        "Evidence changed since collection. Reject this candidate or perform a new source check/review.",
        409,
      );
      requireThat(
        typeof input.statement === "string" &&
          input.statement.trim().length >= 15 &&
          input.statement.length <= 3000,
        "Write the reviewed claim.",
      );
      requireThat(
        input.statement.trim() !== e.value.statement,
        "Unchanged claims must be rejected as no material change.",
      );
      requireThat(
        ["company_claim", "analyst_inference"].includes(input.classification),
        "Choose a supported claim classification: company claim or analyst inference. Single-source monitoring does not independently verify facts.",
      );
      const date = now.slice(0, 10);
      const result = commitOperation(seed, workspace, {
        type: "evidence_revision",
        recordId: c.evidenceId,
        profileId,
        expectedHead: c.workspaceHead,
        expectedRevision: c.evidenceRevision,
        opId: `REVIEW-${input.opId}`,
        actor,
        rationale: input.rationale,
        at: now,
        after: {
          ...e.value,
          statement: input.statement.trim(),
          type: input.classification,
          asOf: date,
          status: "active",
        },
        check: {
          sourceId: WATCH.id,
          checkedAt: date,
          note: `${input.rationale} Snapshot SHA-256 ${c.afterHash}; fetched ${c.fetchedAt}.`,
          reviewDays: 7,
        },
      });
      next.desk = exportV2(seed, result.workspace);
      details.adoptedHead = workspaceHead(result.workspace);
      details.evidenceId = c.evidenceId;
      details.affectedAssumptionIds = Object.values(active.assumptions)
        .filter((a) => a.value.evidenceIds.includes(c.evidenceId))
        .map((a) => a.value.id);
      const affectedPriorities = new Set(
        details.affectedAssumptionIds.map(
          (id) => active.assumptions[id].value.priorityId,
        ),
      );
      details.affectedDecisionIds = seed.decisions
        .filter((d) => affectedPriorities.has(d.priorityId))
        .map((d) => d.id);
    }
    c.status = input.type;
    c.reviewedAt = now;
    c.reviewedBy = actor;
    c.rationale = input.rationale;
    details.candidateId = c.id;
    details.sourceHash = c.afterHash;
  } else if (input.type === "command") {
    requireThat(
      input.command && !["legacy_import"].includes(input.command.type),
      "Unsupported shared command.",
    );
    const command = { ...input.command, actor, at: now };
    const result = commitOperation(seed, workspace, command);
    result.workspace.activeProfileId = command.profileId;
    next.desk = exportV2(seed, result.workspace);
    details.adoptedHead = workspaceHead(result.workspace);
  } else throw new ReviewError("Unknown review operation.");
  const event = {
    seq: next.version + 1,
    opId: input.opId,
    intentHash,
    previousHash: next.journal.at(-1)?.eventHash ?? "baseline",
    at: now,
    actor,
    type: input.type,
    ...details,
  };
  event.eventHash = hash(event);
  next.journal.push(event);
  next.version++;
  return { state: validateReview(next), duplicate: false };
}
// Start a new review period from a full one. The live state is bounded (60
// operations, 4 MB) and every check and decision counts, so a review that is
// checked regularly reaches the bound. Resetting would discard the monitoring
// snapshot, and the next capture would then be a new baseline that hides any
// page change since the last check. Instead the new period carries forward,
// per profile with a snapshot:
// - the pending candidate, unchanged, with one carried "changed" check dated
//   at its fetch, so it can still be accepted or rejected; or
// - one carried "baseline" check holding the latest snapshot, so the next
//   capture is compared with it.
// The adopted desk is kept byte for byte. Every carried check and journal
// event names the period it came from in `carriedFrom`, inside the hashed
// event body. Reviewed candidates and the old journal stay in the previous
// period's backup and recovery copies. The result is a plain schema 4 state:
// version 4.2 validates it and continues it as it is.
export function rolloverReview(review, actor, now = new Date().toISOString()) {
  validateReview(review);
  requireThat(review.version > 0, "Nothing to carry into a new review period.");
  requireThat(
    typeof actor === "string" && actor.length > 0 && actor.length <= 200,
    "Reviewer label required.",
  );
  requireThat(Number.isFinite(Date.parse(now)), "Invalid new period date.");
  const carriedFrom = {
    version: review.version,
    eventHash: review.journal.at(-1).eventHash,
    rolledOverAt: now,
    rolledOverBy: actor,
  };
  const next = {
    schemaVersion: 4,
    version: 0,
    desk: structuredClone(review.desk),
    snapshots: {},
    checks: [],
    candidates: [],
    journal: [],
  };
  for (const key of Object.keys(review.snapshots).sort()) {
    const snapshot = review.snapshots[key];
    const pending = review.candidates.find(
      (c) =>
        c.status === "pending" && `${c.profileId}:${WATCH.id}` === key,
    );
    // The check that produced what is carried: the candidate's own check, or
    // the latest successful check, which the snapshot must match.
    const source = pending
      ? review.checks.find(
          (c) =>
            c.id ===
            review.journal.find(
              (e) => e.type === "check" && e.candidateId === pending.id,
            )?.checkId,
        )
      : review.checks
          .filter(
            (c) =>
              `${c.profileId}:${WATCH.id}` === key && c.outcome !== "unreachable",
          )
          .at(-1);
    requireThat(
      source &&
        (pending
          ? pending.afterHash === snapshot.hash && source.hash === snapshot.hash
          : source.hash === snapshot.hash && source.at === snapshot.at),
      "Review snapshot does not match its latest check.",
    );
    const at = pending ? pending.fetchedAt : snapshot.at;
    const check = {
      id: uuid(),
      sourceId: WATCH.id,
      url: WATCH.url,
      profileId: snapshot.profileId,
      at,
      actor: source.actor,
      outcome: pending ? "changed" : "baseline",
      status: source.status ?? null,
      note: `Carried forward from the previous review period (version ${review.version}, journal head ${carriedFrom.eventHash}); fetched ${at}.`,
      hash: snapshot.hash,
      carriedFrom,
    };
    const event = {
      seq: next.journal.length + 1,
      opId: `ROLLOVER-${uuid()}`,
      previousHash: next.journal.at(-1)?.eventHash ?? "baseline",
      at,
      actor: source.actor,
      type: "check",
      checkId: check.id,
      outcome: check.outcome,
      ...(pending ? { candidateId: pending.id } : {}),
      carriedFrom,
    };
    event.intentHash = hash({ type: "rollover", key, carriedFrom });
    event.eventHash = hash(event);
    next.checks.push(check);
    next.journal.push(event);
    if (pending) next.candidates.push(structuredClone(pending));
    // A pending candidate's text is the snapshot; date the snapshot at its
    // fetch so it matches the carried check, as every period requires.
    next.snapshots[key] = { ...snapshot, at };
  }
  next.version = next.journal.length;
  return validateReview(next);
}
// Every candidate that has left the inbox (accepted, rejected or superseded),
// newest first, with the text a reviewer saw and what was decided. Order is
// the journal's, which stays exact when timestamps tie: the review event, or
// for a superseded candidate the later check that replaced it. The adopted
// claim is read straight from the stored desk events by the journal's
// adoptedHead, so listing never replays the desk. Text is returned raw: the
// view escapes it.
export function reviewedCandidates(review) {
  const events = review.desk.workspace.events,
    journal = review.journal;
  const profileOf = new Map(review.candidates.map((c) => [c.id, c.profileId]));
  const leftInbox = (c) => {
    if (c.status !== "superseded")
      return journal.findIndex(
        (e) => e.type === c.status && e.candidateId === c.id,
      );
    const created = journal.findIndex(
      (e) => e.type === "check" && e.candidateId === c.id,
    );
    const next = journal.findIndex(
      (e, i) =>
        i > created &&
        e.type === "check" &&
        e.candidateId &&
        profileOf.get(e.candidateId) === c.profileId,
    );
    return next === -1 ? created : next;
  };
  return review.candidates
    .filter((c) => c.status !== "pending")
    .map((c) => [leftInbox(c), c])
    .sort((a, b) => b[0] - a[0])
    .map(([, c]) => {
      const event =
        c.status === "accepted"
          ? review.journal.find(
              (e) => e.type === "accepted" && e.candidateId === c.id,
            )
          : null;
      const head = event && events.find((v) => v.id === event.adoptedHead);
      const revision =
        head &&
        events.find(
          (v) =>
            v.opId === head.opId &&
            v.type === "evidence_revision" &&
            v.recordId === c.evidenceId,
        );
      return {
        id: c.id,
        status: c.status,
        evidenceId: c.evidenceId,
        url: c.url,
        previousFetchedAt: c.previousFetchedAt,
        fetchedAt: c.fetchedAt,
        beforeHash: c.beforeHash,
        afterHash: c.afterHash,
        beforeText: c.beforeText,
        afterText: c.afterText,
        reviewedAt: c.reviewedAt ?? null,
        reviewedBy: c.reviewedBy ?? null,
        rationale: c.rationale ?? null,
        adoptedHead: event?.adoptedHead ?? null,
        adoptedStatement: revision?.after.statement ?? null,
        adoptedClassification: revision?.after.type ?? null,
      };
    });
}
// Reviewer labels and rationales come from local input or an imported backup.
// Keep each on one Markdown line and inert: no headings, lists, links,
// emphasis, code or HTML can be opened from inside them.
export function mdInline(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_[\]<>]/g, (c) => "\\" + c);
}
export function weeklyBrief(review, now = new Date().toISOString()) {
  validateReview(review);
  requireThat(
    typeof now === "string" && Number.isFinite(Date.parse(now)),
    "Invalid brief date.",
  );
  const end = Date.parse(now),
    start = end - 7 * 86400000;
  const recent = (value) =>
    Date.parse(value.at) >= start && Date.parse(value.at) <= end;
  // A carried check repeats an earlier fetch into a new review period. It is
  // listed as carried and never counted as a source check of this week.
  const checks = review.checks.filter(recent),
    fresh = checks.filter((c) => !c.carriedFrom),
    reviews = review.journal.filter(
      (e) => recent(e) && ["accepted", "rejected"].includes(e.type),
    );
  const { seed, workspace } = decodeDesk(review.desk);
  const lines = [
    `# Stable Desk weekly change brief`,
    ``,
    `Seven-day UTC window: ${new Date(start).toISOString()} to ${now}. Generated on demand; no scheduled delivery.`,
    ``,
    `Generic Stablecoin (STABLE) remains fictional. Public product changes establish no STABLE partnership or payment adoption.`,
    ``,
    `${fresh.length} source checks; ${reviews.filter((e) => e.type === "accepted").length} accepted revisions; ${reviews.filter((e) => e.type === "rejected").length} rejected candidates; ${review.candidates.filter((c) => c.status === "pending").length} candidates pending across history.`,
    ``,
  ];
  for (const check of checks)
    lines.push(
      `- ${check.at}: ${check.outcome}${check.carriedFrom ? `, carried forward from review period version ${mdInline(check.carriedFrom.version)} (not a new fetch)` : ""} — [official source](${check.url}), ${check.hash ? `SHA-256 ${check.hash}` : `HTTP ${check.status ?? "unresolved"}`}.`,
    );
  for (const event of reviews) {
    const c = review.candidates.find((c) => c.id === event.candidateId);
    lines.push(
      `- ${event.at}: ${event.type} by ${mdInline(event.actor)}; ${mdInline(c.rationale).replace(/\.$/, "")}. [Source](${c.url}), fetched ${c.fetchedAt}, candidate ${c.id}.`,
    );
    if (event.type === "accepted")
      lines.push(
        `  Adopted evidence ${event.evidenceId ?? c.evidenceId}; source SHA-256 ${c.afterHash}; head ${event.adoptedHead}. Review affected assumptions ${event.affectedAssumptionIds?.join(", ") || "in Decisions"} and decisions ${event.affectedDecisionIds?.join(", ") || "on the linked evidence basis"}; no decision was automatically endorsed.`,
      );
  }
  lines.push(
    "",
    "## Review next",
    ...review.candidates
      .filter((c) => c.status === "pending")
      .map(
        (c) =>
          `- Review candidate ${c.id}: [${c.title}](${c.url}), fetched ${c.fetchedAt}. Adopted evidence is unchanged until acceptance.`,
      ),
    "",
    `Adopted workspace head: ${workspaceHead(workspace)}. Recheck affected assumptions in Decisions after an accepted revision.`,
    `Public baseline as of ${seed.meta.asOf}; a monitor fetch does not independently verify company claims.`,
    "",
  );
  return lines.join("\n");
}
