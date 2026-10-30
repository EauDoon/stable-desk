import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DESK_EXPORT_KEY,
  REVIEW_EXPORT_KEY,
  recordExport,
  readExport,
  exportStatus,
  deskIdentity,
  deskMarker,
  reviewIdentity,
  reviewMarker,
  deskExportLabel,
  reviewExportLabel,
} from "../src/export-status.js";
import { listArchives } from "../src/archive-store.js";
import { initialReview, applyReview, rolloverReview } from "../src/review-model.js";
import { prepareDataset, createWorkspace } from "../src/workspace.js";
import { TEST_NOW } from "./clock.js";
const seed = prepareDataset(
  JSON.parse(await readFile(new URL("../data/baseline.json", import.meta.url), "utf8")),
);
const ws = (ids, id = "WS-1") => ({
  ...createWorkspace(seed, id),
  events: ids.map((e) => ({ id: e, opId: `OP-${e}` })),
});

test("desk export status: none, current, changes since, other workspace, lost head", () => {
  const two = ws(["EV-1", "EV-2"]);
  assert.deepEqual(exportStatus(null, deskIdentity(two)), { exported: false });
  const marker = deskMarker(two, TEST_NOW);
  assert.deepEqual(marker, { id: "WS-1", head: "EV-2", events: 2, at: TEST_NOW });
  const current = exportStatus(marker, deskIdentity(two));
  assert.deepEqual(current, { exported: true, at: TEST_NOW, position: 2, since: 0 });
  assert.equal(deskExportLabel(current), "Exported from this browser 2026-10-15 12:00 UTC; no committed changes since.");
  const one = exportStatus(marker, deskIdentity(ws(["EV-1", "EV-2", "EV-3"])));
  assert.equal(one.since, 1);
  assert.equal(deskExportLabel(one), "1 committed change since the export downloaded 2026-10-15 12:00 UTC.");
  assert.equal(
    deskExportLabel(exportStatus(marker, deskIdentity(ws(["EV-1", "EV-2", "EV-3", "EV-4"])))),
    "2 committed changes since the export downloaded 2026-10-15 12:00 UTC.",
  );
  // Another workspace, or a history that no longer holds the exported head.
  assert.deepEqual(exportStatus(marker, deskIdentity(ws(["EV-1", "EV-2"], "WS-2"))), { exported: false });
  assert.deepEqual(exportStatus(marker, deskIdentity(ws(["EV-1", "EV-9"]))), { exported: false });
  assert.equal(deskExportLabel({ exported: false }), "Not exported from this browser yet.");
  // An export of an untouched baseline counts every later commit.
  const blank = deskMarker(ws([]), TEST_NOW);
  assert.equal(blank.head, "baseline");
  assert.equal(exportStatus(blank, deskIdentity(ws(["EV-1"]))).since, 1);
});

test("a commit that writes several events counts as one committed change", () => {
  const base = ws(["EV-1"]);
  const marker = deskMarker(base, TEST_NOW);
  const decision = {
    ...base,
    events: [
      ...base.events,
      { id: "EV-2", opId: "OP-decision" },
      { id: "EV-3", opId: "OP-decision" },
      { id: "EV-4", opId: "OP-decision" },
    ],
  };
  assert.deepEqual(deskIdentity(decision).heads, ["EV-1", "EV-4"]);
  assert.equal(exportStatus(marker, deskIdentity(decision)).since, 1);
  assert.equal(exportStatus(deskMarker(decision, TEST_NOW), deskIdentity(decision)).since, 0);
});

test("an unreadable or malformed marker reads as not exported", () => {
  const current = deskIdentity(ws(["EV-1"]));
  for (const marker of [
    "text",
    [],
    { id: "WS-1", head: "EV-1" },
    { id: "WS-1", head: "EV-1", at: "yesterday" },
    { id: 7, head: "EV-1", at: TEST_NOW },
  ])
    assert.deepEqual(exportStatus(marker, current), { exported: false });
  const storage = { getItem: () => "{broken" };
  assert.equal(readExport(storage, DESK_EXPORT_KEY), null);
  assert.equal(readExport({ getItem: () => null }, DESK_EXPORT_KEY), null);
});

test("recording an export never throws, even when storage refuses the write", () => {
  const records = new Map();
  const storage = { setItem: (k, v) => records.set(k, v), getItem: (k) => records.get(k) ?? null };
  const marker = deskMarker(ws(["EV-1"]), TEST_NOW);
  assert.equal(recordExport(storage, DESK_EXPORT_KEY, marker), true);
  assert.deepEqual(readExport(storage, DESK_EXPORT_KEY), marker);
  const full = {
    setItem() {
      throw new DOMException("Quota full", "QuotaExceededError");
    },
  };
  assert.equal(recordExport(full, DESK_EXPORT_KEY, marker), false);
  assert.equal(recordExport({}, DESK_EXPORT_KEY, marker), false);
});

test("the export keys are never treated as recovery copies", () => {
  const records = new Map([
    [DESK_EXPORT_KEY, "{}"],
    [REVIEW_EXPORT_KEY, "{}"],
  ]);
  const storage = {
    get length() { return records.size; },
    key: (i) => [...records.keys()][i] ?? null,
    getItem: (k) => records.get(k) ?? null,
  };
  assert.deepEqual(listArchives(storage), []);
});

test("review export status counts operations since and resets for a new period", () => {
  const text = (n) =>
    `Official stablecoin documentation. Merchants must examine business eligibility, country restrictions and supported tokens before using the payment product. Revision ${n}.`;
  const check = (p, n) =>
    applyReview(p, { type: "check", opId: `C-${p.version}`, expectedVersion: p.version, capture: { outcome: "ok", text: text(n) } }, "local-reviewer", TEST_NOW).state;
  const start = initialReview(seed);
  assert.equal(reviewExportLabel(exportStatus(null, reviewIdentity(start))), "not exported from this browser");
  let review = check(check(start, 1), 1);
  const marker = reviewMarker(review, TEST_NOW);
  assert.equal(marker.version, 2);
  assert.equal(
    reviewExportLabel(exportStatus(marker, reviewIdentity(review))),
    "last exported at version 2 (2026-10-15 12:00 UTC)",
  );
  review = check(review, 1);
  assert.equal(
    reviewExportLabel(exportStatus(marker, reviewIdentity(review))),
    "last exported at version 2 (2026-10-15 12:00 UTC), 1 operation since",
  );
  const period = rolloverReview(review, "local-reviewer", TEST_NOW);
  assert.deepEqual(exportStatus(marker, reviewIdentity(period)), { exported: false });
  assert.deepEqual(exportStatus(reviewMarker(review, TEST_NOW), reviewIdentity(period)), { exported: false });
});
