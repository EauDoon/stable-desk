// Whether the current local work has been downloaded since its last change.
// Browser storage is not a backup, so both pages show how far the work has
// moved since the last export from this browser. A marker records only what
// was downloaded, never whether the file was kept. These keys are read by
// this module alone; they are never exported, archived or evicted.
export const DESK_EXPORT_KEY = "stable-desk:last-export";
export const REVIEW_EXPORT_KEY = "stable-desk:review-export";

// A failed or blocked write never affects the download it follows.
export function recordExport(storage, key, marker) {
  try {
    storage.setItem(key, JSON.stringify(marker));
    return true;
  } catch {
    return false;
  }
}
export function readExport(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}

// The markers and the identities they are compared with. `heads` lists the
// committed history in order; a marker counts only if its head is still in it.
// A desk commit can write several events under one operation ID (a decision
// with its assumption reviews), so the desk counts operations: each head is
// the last event of one operation.
export const deskIdentity = (workspace) => ({
  id: workspace.id,
  heads: workspace.events
    .filter((e, i, all) => all[i + 1]?.opId !== e.opId || i === all.length - 1)
    .map((e) => e.id),
});
export const deskMarker = (workspace, at = new Date().toISOString()) => ({
  id: workspace.id,
  head: workspace.events.at(-1)?.id ?? "baseline",
  events: workspace.events.length,
  at,
});
// A new review period has a new first event, so it reads as not exported.
const reviewId = (review) =>
  `${review.desk.workspace.id}:${review.journal[0]?.eventHash ?? "empty"}`;
export const reviewIdentity = (review) => ({
  id: reviewId(review),
  heads: review.journal.map((e) => e.eventHash),
});
export const reviewMarker = (review, at = new Date().toISOString()) => ({
  id: reviewId(review),
  head: review.journal.at(-1)?.eventHash ?? "baseline",
  version: review.version,
  at,
});

// { exported: false } or { exported: true, at, since, position }: `since`
// counts committed entries after the exported head.
export function exportStatus(marker, current) {
  const valid =
    !!marker &&
    typeof marker === "object" &&
    !Array.isArray(marker) &&
    typeof marker.id === "string" &&
    typeof marker.head === "string" &&
    typeof marker.at === "string" &&
    Number.isFinite(Date.parse(marker.at));
  if (!valid || marker.id !== current.id) return { exported: false };
  const position =
    marker.head === "baseline" ? 0 : current.heads.indexOf(marker.head) + 1;
  if (marker.head !== "baseline" && position === 0) return { exported: false };
  return {
    exported: true,
    at: marker.at,
    position,
    since: current.heads.length - position,
  };
}
const when = (at) =>
  `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function deskExportLabel(status) {
  if (!status.exported) return "Not exported from this browser yet.";
  return status.since
    ? `${plural(status.since, "committed change")} since the export downloaded ${when(status.at)}.`
    : `Exported from this browser ${when(status.at)}; no committed changes since.`;
}
export function reviewExportLabel(status) {
  if (!status.exported) return "not exported from this browser";
  return `last exported at version ${status.position} (${when(status.at)})${status.since ? `, ${plural(status.since, "operation")} since` : ""}`;
}
