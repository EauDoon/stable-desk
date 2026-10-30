import {
  projectWorkspace,
  createWorkspace,
  workspaceHead,
  canonical,
} from "./workspace.js";
import { mdInline } from "./review-model.js";

// A readable Markdown record of one profile's committed desk changes, and of
// the records that now differ from the repository baseline: the checklist a
// maintainer works through before promoting reviewed public context into
// data/baseline.json (docs/UPDATING.md). It reads the workspace and writes
// nothing. Every user value goes through mdInline and always follows fixed
// text inside a list item, so no value can open a heading, list, link or HTML.
const show = (value) =>
  value === null || value === undefined
    ? "none"
    : mdInline(typeof value === "string" ? value : canonical(value));
const quoted = (value) =>
  typeof value === "string" ? `"${mdInline(value)}"` : show(value);
const same = (a, b) => canonical(a ?? null) === canonical(b ?? null);
const changedFields = (before, after) =>
  [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .sort()
    .filter((key) => !same(before?.[key], after?.[key]));

function eventLines(event) {
  const head = `- #${event.seq} ${event.at}: ${mdInline(event.type.replaceAll("_", " "))} of ${mdInline(event.recordId)} by ${mdInline(event.actor)}. Rationale: ${mdInline(event.rationale)}`;
  if (event.type === "legacy_import")
    return [
      head,
      `  - Generic v1 notes, reviews and activity preserved (${Object.keys(event.after?.decisions ?? {}).length} decisions, ${(event.after?.activity ?? []).length} activity entries); see the export for their text.`,
    ];
  const before =
    event.before && typeof event.before === "object" ? event.before : null;
  const after = event.after && typeof event.after === "object" ? event.after : {};
  const lines = [head];
  for (const key of changedFields(before, after)) {
    if (key === "basis") {
      lines.push(
        `  - Field basis: recorded for assumptions ${Object.keys(after.basis ?? {}).map(mdInline).join(", ") || "none"}.`,
      );
      continue;
    }
    lines.push(
      before
        ? `  - Field ${mdInline(key)}: ${quoted(before[key])} -> ${quoted(after[key])}`
        : `  - Field ${mdInline(key)}: ${quoted(after[key])}`,
    );
  }
  return lines;
}

function differences(seed, state) {
  const baseline = projectWorkspace(seed, createWorkspace(seed)).profiles[
    seed.profile.id
  ];
  const lines = [];
  if (!same(state.profile, baseline.profile))
    lines.push(
      state.profile.id === baseline.profile.id
        ? `- Profile ${mdInline(state.profile.id)}: ${changedFields(baseline.profile, state.profile).map(mdInline).join(", ")}`
        : `- Profile ${mdInline(state.profile.id)}: a local profile, not the repository's default profile ${mdInline(baseline.profile.id)}.`,
    );
  for (const [group, label] of [
    ["sources", "Source"],
    ["evidence", "Evidence"],
    ["assumptions", "Assumption"],
  ])
    for (const id of Object.keys(state[group]).sort()) {
      const now = state[group][id].value,
        then = baseline[group][id]?.value;
      if (!then) lines.push(`- ${label} ${mdInline(id)}: new record.`);
      else if (!same(now, then))
        lines.push(
          `- ${label} ${mdInline(id)}: ${changedFields(then, now).map(mdInline).join(", ")}`,
        );
    }
  return lines;
}

export function changeReport(
  seed,
  ws,
  { profileId = ws.activeProfileId, generatedAt = new Date().toISOString() } = {},
) {
  const projection = projectWorkspace(seed, ws);
  const state = projection.profiles[profileId];
  if (!state) throw new Error(`Unknown profile ${profileId}.`);
  const events = ws.events.filter((e) => e.profileId === profileId);
  const diff = differences(seed, state);
  const p = state.profile;
  return [
    "# Stable Desk change report",
    "",
    `- Workspace: ${mdInline(ws.id)}`,
    `- Workspace head: ${mdInline(workspaceHead(ws))}`,
    `- Dataset: ${mdInline(seed.meta.version)}, public baseline as of ${mdInline(seed.meta.asOf)}`,
    `- Profile: ${mdInline(p.name)} (${mdInline(p.ticker)}), ${p.mode === "fictional_demo" ? "fictional demo" : "real research subject, unverified"}, ${mdInline(p.id)}`,
    `- Generated: ${mdInline(generatedAt)}`,
    "",
    "Reviewer labels are local and unauthenticated. This record is read from a browser-local workspace and is not signed. Generic Stablecoin (STABLE) is fictional, and a configured research subject stays unverified. Nothing here verifies a claim or approves a commercial action.",
    "",
    `## Committed changes (${events.length})`,
    "",
    ...(events.length
      ? events.flatMap(eventLines)
      : ["- No committed changes for this profile."]),
    "",
    `## Differences from the repository baseline (${diff.length})`,
    "",
    "Records whose current value differs from data/baseline.json. Review each one before promoting it; docs/UPDATING.md describes the steps.",
    "",
    ...(diff.length ? diff : ["- None. This profile matches the repository baseline."]),
    "",
  ].join("\n");
}
