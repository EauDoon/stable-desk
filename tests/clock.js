// The fixed "now" for unit and browser tests. The public dataset is dated
// 2026-09-30 and every seeded review deadline is 2026-10-30, so a review that
// keeps a seeded deadline is only valid on or before that date. Tests that
// read the wall clock instead started failing on 2026-10-31 (UTC). This date
// sits inside that window and after the v4.1 compatibility fixtures
// (tests/compat/, last written 2026-10-08).
export const TEST_NOW = "2026-10-15T12:00:00.000Z";
