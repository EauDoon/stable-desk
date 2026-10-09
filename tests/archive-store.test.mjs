import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_PREFIX,
  ARCHIVE_MAX_COPIES,
  ARCHIVE_MAX_BYTES,
  STORAGE_FULL,
  listArchives,
  writeArchive,
  setEvictingArchives,
  pruneArchives,
  deleteArchive,
} from "../src/archive-store.js";

// A Storage-shaped fake that counts UTF-16 bytes against a quota, like
// browsers do, and throws the same DOMException when a write would not fit.
function storage(limit = Infinity) {
  const records = new Map();
  return {
    records,
    get length() { return records.size; },
    key: (i) => [...records.keys()][i] ?? null,
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => { records.delete(key); },
    setItem(key, value) {
      const trial = new Map(records).set(key, String(value));
      if ([...trial].reduce((n, [k, v]) => n + 2 * (k.length + v.length), 0) > limit)
        throw new DOMException("Quota full", "QuotaExceededError");
      records.set(key, String(value));
    },
  };
}
const others = {
  "stable-desk:v2": "live",
  "stable-desk:drafts-v2": "{}",
  "stable-desk:generic-v1": "legacy",
  "stable-desk:v1": "older",
  "stable-desk:review": "review",
  "stable-desk:review-history": "[]",
};
const seedOthers = (s) => { for (const [k, v] of Object.entries(others)) s.setItem(k, v); };
const assertOthersIntact = (s) => {
  for (const [k, v] of Object.entries(others)) assert.equal(s.getItem(k), v, k);
};

test("archive keys keep their format and list newest first by timestamp", () => {
  const s = storage();
  seedOthers(s);
  const keys = [900, 10_000, 5_000].map((now) => writeArchive(s, `copy-${now}`, { now }));
  for (const key of keys)
    assert.match(key, /^stable-desk:archive:\d+:BACKUP-[0-9a-f-]{36}$/);
  assert.deepEqual(listArchives(s).map((k) => s.getItem(k)), ["copy-10000", "copy-5000", "copy-900"]);
});

test("pruning keeps at most ten copies, newest first", () => {
  const s = storage();
  seedOthers(s);
  for (let i = 1; i <= 13; i++) writeArchive(s, `copy-${i}`, { now: i });
  const removed = pruneArchives(s);
  assert.equal(removed.length, 3);
  assert.equal(listArchives(s).length, ARCHIVE_MAX_COPIES);
  assert.equal(s.getItem(listArchives(s)[0]), "copy-13");
  assert.equal(s.getItem(listArchives(s).at(-1)), "copy-4");
  assertOthersIntact(s);
});

test("pruning honours the byte budget but always keeps the newest copy", () => {
  const s = storage();
  seedOthers(s);
  const big = "x".repeat(ARCHIVE_MAX_BYTES / 2); // twice the budget once UTF-16 counted
  writeArchive(s, "small-old", { now: 1 });
  writeArchive(s, big, { now: 2 });
  assert.deepEqual(pruneArchives(s).map((k) => k.split(":")[2]), ["1"]);
  assert.equal(listArchives(s).length, 1);
  assert.equal(s.getItem(listArchives(s)[0]), big);
  // Copies just written for a replacement are kept even when over budget.
  const keep = [writeArchive(s, big, { now: 3 })];
  pruneArchives(s, { keep });
  assert.equal(listArchives(s).length, 1);
  assert.equal(listArchives(s)[0], keep[0]);
  const both = [writeArchive(s, big, { now: 4 }), writeArchive(s, big, { now: 5 })];
  pruneArchives(s, { keep: both });
  assert.deepEqual(listArchives(s), [both[1], both[0]]);
  assertOthersIntact(s);
});

test("a full quota evicts the oldest copies only, then reports a clear error", () => {
  const s = storage(400_000);
  seedOthers(s);
  for (let i = 1; i <= 4; i++) writeArchive(s, "x".repeat(40_000), { now: i });
  const key = writeArchive(s, "y".repeat(60_000), { now: 5 });
  assert.equal(s.getItem(key).length, 60_000);
  assert.ok(listArchives(s).length < 5);
  assert.equal(listArchives(s)[0], key);
  assertOthersIntact(s);
  // The live write may evict older copies, never the copies it was given to keep.
  const keep = [key];
  setEvictingArchives(s, "stable-desk:v2", "z".repeat(100_000), keep);
  assert.equal(s.getItem("stable-desk:v2").length, 100_000);
  assert.deepEqual(listArchives(s), [key]);
  assert.throws(
    () => setEvictingArchives(s, "stable-desk:v2", "z".repeat(150_000), keep),
    (error) => error.message === STORAGE_FULL,
  );
  assert.equal(s.getItem("stable-desk:v2").length, 100_000);
  assert.deepEqual(listArchives(s), [key]);
  assert.throws(() => writeArchive(s, "w".repeat(250_000), { now: 6, keep }), /Storage is full/);
});

test("non-quota storage errors are not swallowed", () => {
  const s = storage();
  writeArchive(s, "old", { now: 1 });
  s.setItem = () => { throw new TypeError("blocked"); };
  assert.throws(() => writeArchive(s, "new"), TypeError);
  assert.equal(listArchives(s).length, 1);
});

test("deletion removes exactly one recovery copy and refuses other keys", () => {
  const s = storage();
  seedOthers(s);
  const [a, b] = [1, 2].map((now) => writeArchive(s, `copy-${now}`, { now }));
  deleteArchive(s, a);
  assert.deepEqual(listArchives(s), [b]);
  for (const key of [...Object.keys(others), "stable-desk:archiveX", ARCHIVE_PREFIX.slice(0, -1), undefined])
    assert.throws(() => deleteArchive(s, key), /Only recovery copies/);
  assertOthersIntact(s);
});
