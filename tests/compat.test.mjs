import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseV2Import,
  activeState,
  projectWorkspace,
  serializeWorkspace,
} from "../src/workspace.js";
import { validateReview, applyReview, weeklyBrief } from "../src/review-model.js";
import { listArchives, pruneArchives } from "../src/archive-store.js";

// Both fixtures were generated on 09-10-2026 by the v4.1.0 modules (commit
// 436f5e1), in exactly the form v4.1 writes to browser storage:
// - v4.1-desk-workspace.json is a `stable-desk:v2` value: a reviewed decision,
//   a claim revision with its source check, an unchanged check and a second
//   profile (7 events).
// - v4.1-source-review.json is a `stable-desk:review` value: a baseline, an
//   accepted and a rejected change and an unreachable check (version 6).
// Data already saved in users' browsers and exports must keep loading.
const deskRaw = await readFile(new URL("./compat/v4.1-desk-workspace.json", import.meta.url), "utf8");
const reviewRaw = await readFile(new URL("./compat/v4.1-source-review.json", import.meta.url), "utf8");

test("a desk workspace saved by v4.1 loads, replays and re-saves unchanged", () => {
  const original = JSON.parse(deskRaw);
  const { seed, workspace } = parseV2Import(deskRaw);
  assert.deepEqual(workspace, original.workspace);
  assert.equal(workspace.events.length, 7);
  assert.equal(Object.keys(projectWorkspace(seed, workspace).profiles).length, 2);
  const state = activeState(seed, workspace);
  assert.match(state.decisions["D-G01"].value.notes, /Compatibility fixture/);
  assert.match(state.evidence["E-G09"].value.scope, /Compatibility fixture qualification/);
  const resaved = JSON.parse(serializeWorkspace(seed, workspace));
  assert.deepEqual(resaved.workspace, original.workspace);
  assert.deepEqual(resaved.dataset, original.dataset);
  assert.equal(resaved.schemaVersion, 2);
});

test("a source review saved by v4.1 validates and accepts new work", () => {
  const review = validateReview(JSON.parse(reviewRaw));
  assert.equal(review.schemaVersion, 4);
  assert.equal(review.version, 6);
  assert.deepEqual(review.candidates.map((c) => c.status), ["accepted", "rejected"]);
  const next = applyReview(
    review,
    {
      type: "check",
      opId: "REVIEW-after-upgrade",
      expectedVersion: review.version,
      capture: {
        outcome: "ok",
        status: 200,
        text: "Official stablecoin documentation. Merchants must examine business eligibility, country restrictions and supported tokens before using the payment product. After the upgrade.",
      },
    },
    "local-reviewer",
    "2026-10-09T10:00:00.000Z",
  ).state;
  assert.equal(next.version, 7);
  assert.deepEqual(next.journal.slice(0, 6), review.journal);
  const brief = weeklyBrief(next, "2026-10-09T12:00:00.000Z");
  assert.match(brief, /accepted by local-reviewer; The page now states merchant eligibility explicitly\. \[Source\]/);
  assert.match(brief, /rejected by local-reviewer; Irrelevant page churn; the claim is unaffected\. \[Source\]/);
});

test("a v4.1 recovery copy keeps its key, is listed and is never pruned as the only copy", () => {
  const records = new Map([
    ["stable-desk:v2", deskRaw],
    ["stable-desk:archive:1759568400000:BACKUP-00000000-0000-4000-8000-000000000000", deskRaw],
  ]);
  const storage = {
    get length() { return records.size; },
    key: (i) => [...records.keys()][i] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
  const [key] = listArchives(storage);
  assert.equal(key, "stable-desk:archive:1759568400000:BACKUP-00000000-0000-4000-8000-000000000000");
  assert.deepEqual(pruneArchives(storage), []);
  assert.equal(parseV2Import(storage.getItem(key)).workspace.events.length, 7);
});
