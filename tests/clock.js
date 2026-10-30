// The fixed "now" for unit and browser tests. The public dataset is dated
// 2026-09-30 and every seeded review deadline is 2026-10-30, so a review that
// keeps a seeded deadline is only valid on or before that date. Tests that
// read the wall clock instead started failing on 2026-10-31 (UTC). This date
// sits inside that window and after the v4.1 compatibility fixtures
// (tests/compat/, last written 2026-10-08).
export const TEST_NOW = "2026-10-15T12:00:00.000Z";

// A Date class whose wall clock reads `at` (an ISO date) when created and
// keeps ticking from there. Explicit dates, Date.parse and Date.UTC are
// unchanged. `npm run test:clock` installs it before the unit suite through
// tests/shift-clock.mjs, so a test that reads today's date instead of
// TEST_NOW fails in CI rather than on a future calendar day.
export function shiftedDate(RealDate, at) {
  const target = RealDate.parse(at);
  if (!Number.isFinite(target))
    throw new Error(`SHIFT_NOW must be an ISO date, got ${JSON.stringify(at)}.`);
  const offset = target - RealDate.now();
  return class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  };
}
