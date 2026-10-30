// Preload for `npm run test:clock`: runs the unit suite with the wall clock
// moved to SHIFT_NOW (default 2030-01-01, years past every seeded deadline).
// node --test passes --import on to each test file's process.
import { shiftedDate } from "./clock.js";
const at = process.env.SHIFT_NOW || "2030-01-01T00:00:00.000Z";
globalThis.Date = shiftedDate(Date, at);
globalThis.__stableDeskShiftedTo = at;
