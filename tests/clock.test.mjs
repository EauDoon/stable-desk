import test from "node:test";
import assert from "node:assert/strict";
import { shiftedDate, TEST_NOW } from "./clock.js";

test("a shifted clock reads the target date and keeps ticking", () => {
  const Shifted = shiftedDate(Date, "2030-01-01T00:00:00.000Z");
  const target = Date.parse("2030-01-01T00:00:00.000Z");
  const first = Shifted.now();
  assert.ok(first >= target && first - target < 5000);
  const created = new Shifted();
  assert.ok(created.getTime() >= first);
  assert.equal(created.toISOString().slice(0, 10), "2030-01-01");
  assert.ok(new Shifted() instanceof Date);
});

test("a shifted clock leaves explicit dates, parse and UTC alone", () => {
  const Shifted = shiftedDate(Date, "2030-01-01T00:00:00.000Z");
  assert.equal(new Shifted(TEST_NOW).toISOString(), TEST_NOW);
  assert.equal(new Shifted(0).getTime(), 0);
  assert.equal(new Shifted(2026, 9, 15).getFullYear(), 2026);
  assert.equal(Shifted.parse(TEST_NOW), Date.parse(TEST_NOW));
  assert.equal(Shifted.UTC(2026, 9, 30), Date.UTC(2026, 9, 30));
});

test("an invalid SHIFT_NOW is refused with its value", () => {
  assert.throws(
    () => shiftedDate(Date, "not a date"),
    /SHIFT_NOW must be an ISO date, got "not a date"\./,
  );
});

test("under npm run test:clock the whole suite reads the shifted date", () => {
  const at = globalThis.__stableDeskShiftedTo;
  if (!at) return; // Plain `npm test` runs on the real clock.
  const target = Date.parse(at);
  assert.ok(Math.abs(Date.now() - target) < 60000);
  assert.ok(Math.abs(new Date().getTime() - target) < 60000);
});
