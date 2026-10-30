import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewStore } from '../src/review-store.js';
import { initialReview, applyReview, rolloverReview } from '../src/review-model.js';
import { prepareDataset } from '../src/workspace.js';
const KEY = 'stable-desk:review';
const seed = prepareDataset(JSON.parse(readFileSync(new URL('../data/baseline.json', import.meta.url))));
let records, limit, writes;
beforeEach(() => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  records = new Map(); limit = Infinity; writes = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => records.get(key) ?? null,
    removeItem: key => records.delete(key),
    setItem(key, value) {
      const trial = new Map(records).set(key, value);
      if ([...trial].reduce((n, [k, v]) => n + 2 * (k.length + v.length), 0) > limit)
        throw new DOMException('Quota full', 'QuotaExceededError');
      records.set(key, value);
      if (key === KEY) writes++;
    },
  }});
});
const next = (state, n, large = false) => applyReview(state, {
  type: 'check', opId: `CHECK-${n}`, expectedVersion: state.version,
  capture: { outcome: 'ok', text: `${'Official stablecoin merchant eligibility documentation. '.repeat(large ? 350 : 3)}Revision ${n}` },
}, 'test-reviewer').state;

test('invalid, foreign and empty saved bytes cannot be initialized over', async () => {
  for (const raw of ['{broken', '{"schemaVersion":9}', '']) {
    records.set(KEY, raw);
    assert.throws(() => reviewStore.read(), /unreadable/);
    await assert.rejects(reviewStore.replace(null, initialReview(seed)), /unreadable/);
    assert.equal(reviewStore.raw(), raw);
    await assert.rejects(reviewStore.clear(raw + 'stale'), /changed/);
    await reviewStore.clear(raw);
    assert.equal(reviewStore.raw(), null);
  }
});

test('fallback commits once, serializes competing writes and survives rejection', async () => {
  const state = await reviewStore.replace(null, initialReview(seed));
  const one = next(state, 1), two = next(state, 2);
  const results = await Promise.allSettled([reviewStore.write(state, one), reviewStore.write(state, two)]);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 2);
  await reviewStore.write(one, next(one, 3));
  assert.equal(writes, 3);
});

test('reset cannot erase a newer review and keeps recovery copies', async () => {
  const state = await reviewStore.replace(null, initialReview(seed));
  const raw = reviewStore.raw();
  const newer = await reviewStore.write(state, next(state, 1));
  await assert.rejects(reviewStore.clear(raw), /changed/);
  assert.deepEqual(reviewStore.read(), newer);
  const versions = reviewStore.backups();
  assert.deepEqual(reviewStore.recovery(versions[0].key), state);
  await reviewStore.clear(reviewStore.raw());
  assert.deepEqual(reviewStore.backups(), versions);
});

test('restores full histories but refuses divergent or older histories', async () => {
  const start = initialReview(seed), state = next(start, 1);
  await reviewStore.replace(null, state);
  assert.deepEqual(reviewStore.read(), state);
  await assert.rejects(reviewStore.replace(state, start), /diverges/);
  await assert.rejects(reviewStore.replace(state, next(start, 2)), /diverges/);
  await assert.rejects(reviewStore.replace(start, state), /changed/);
  assert.deepEqual(reviewStore.read(), state);
});

test('restore rejects histories that omit journal-linked checks, candidates or snapshots', async () => {
  const state = next(initialReview(seed), 1), extension = next(state, 2);
  await reviewStore.replace(null, state);
  const raw = reviewStore.raw();
  for (const missing of ['checks', 'candidates', 'snapshots']) {
    const truncated = structuredClone(extension);
    truncated[missing] = missing === 'snapshots' ? {} : [];
    await assert.rejects(reviewStore.replace(state, truncated), /Missing|Incomplete/);
    assert.equal(reviewStore.raw(), raw);
  }
});

test('real store with 20k captures respects whole-origin quota and preserves durable state on failure', async () => {
  limit = 5 * 1024 * 1024;
  records.set('stable-desk:v2', 'v'.repeat(256 * 1024));
  let state = await reviewStore.replace(null, initialReview(seed));
  for (let i = 1; i <= 60; i++) {
    const raw = reviewStore.raw();
    try { state = await reviewStore.write(state, next(state, i, true)); }
    catch (error) {
      assert.match(error.message, /Storage is full/);
      assert.equal(reviewStore.raw(), raw);
      break;
    }
  }
  assert.ok(state.version > 40, `only ${state.version} near-limit captures survived`);
  assert.ok(reviewStore.backups().length < 20);
  assert.equal(records.get('stable-desk:v2'), 'v'.repeat(256 * 1024));
  const raw = reviewStore.raw();
  limit = 1;
  if (state.version < 60) await assert.rejects(reviewStore.write(state, next(state, 61)), /Storage is full/);
  else await assert.rejects(reviewStore.replace(state, state), /Storage is full/);
  assert.equal(reviewStore.raw(), raw);
});

const unreachable = (state, n) => applyReview(state, {
  type: 'check', opId: `DOWN-${n}`, expectedVersion: state.version,
  capture: { outcome: 'unreachable', status: 503, note: 'Down.' },
}, 'test-reviewer').state;

test('a new review period replaces the stored one, archives it and accepts new work', async () => {
  const start = await reviewStore.replace(null, initialReview(seed));
  const full = await reviewStore.write(start, next(start, 1));
  const period = rolloverReview(full, 'test-reviewer');
  const saved = await reviewStore.rollover(full, period);
  assert.deepEqual(reviewStore.read(), period);
  assert.deepEqual(saved, period);
  // The old period is the newest recovery copy.
  assert.deepEqual(reviewStore.recovery(reviewStore.backups()[0].key), full);
  const after = await reviewStore.write(period, next(period, 1));
  assert.equal(after.version, 2);
  assert.equal(after.checks.at(-1).outcome, 'unchanged');
});

test('a new review period is refused over a changed, different or unrelated review', async () => {
  const start = initialReview(seed), one = next(start, 1), two = next(one, 2);
  await reviewStore.replace(null, two);
  const raw = reviewStore.raw();
  // Stale expectation: the period was started from an older state.
  await assert.rejects(reviewStore.rollover(one, rolloverReview(one, 'test-reviewer')), /changed/);
  // A period that names another head.
  await assert.rejects(reviewStore.rollover(two, rolloverReview(one, 'test-reviewer')), /does not continue/);
  // A changed desk.
  const otherDesk = rolloverReview(two, 'test-reviewer');
  otherDesk.desk = initialReview(seed).desk;
  await assert.rejects(reviewStore.rollover(two, otherDesk), /does not continue/);
  // An empty period while snapshots exist would drop the monitoring baseline.
  await assert.rejects(reviewStore.rollover(two, initialReview(seed)), /does not continue/);
  assert.equal(reviewStore.raw(), raw);
});

test('a review with only unreachable checks starts an empty period', async () => {
  const start = await reviewStore.replace(null, initialReview(seed));
  const down = await reviewStore.write(start, unreachable(start, 1));
  const period = rolloverReview(down, 'test-reviewer');
  assert.equal(period.version, 0);
  assert.deepEqual(await reviewStore.rollover(down, period), period);
});

test('a backup of the next review period restores over the period it continues', async () => {
  const one = next(initialReview(seed), 1), two = next(one, 2);
  await reviewStore.replace(null, two);
  const period = next(rolloverReview(two, 'test-reviewer'), 3);
  // Another browser still holds period one at version 2: the newer period's
  // backup continues it, so it restores.
  assert.deepEqual(await reviewStore.replace(two, period), period);
  // The older period's backup no longer restores over the new one.
  await assert.rejects(reviewStore.replace(period, two), /diverges/);
  // Nor does a period that continues another history.
  await reviewStore.clear(reviewStore.raw());
  await reviewStore.replace(null, one);
  await assert.rejects(reviewStore.replace(one, period), /diverges/);
  assert.deepEqual(reviewStore.read(), one);
});
