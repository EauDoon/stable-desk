import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewStore } from '../src/review-store.js';
import { initialReview, applyReview } from '../src/review-model.js';
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
