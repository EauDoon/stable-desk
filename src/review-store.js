import { validateReview } from "./review-model.js";
// Browser-local review store. Persistence is localStorage, matching the v2 desk:
// no server, no account, no cross-device synchronization. Export is the only
// way to move work between devices, and the only backup.
const KEY = "stable-desk:review";
const HISTORY_KEY = "stable-desk:review-history";
const MAX_HISTORY = 20;
const MAX_BYTES = 4 * 1024 * 1024;
// The 4 MB bound applies to the LIVE state, and separately to each stored copy.
// Charging the budget to the sum of all copies wedged a real run at operation
// 15 of 60 while live state used only 0.54 MB, which contradicted the
// documented operation bound and left no honest way forward.
const MAX_COPY_BYTES = 4 * 1024 * 1024;
// Total budget for archived copies, leaving headroom for the live state and
// the rest of the origin's storage. Real browser quotas are typically ~5 MB.
const MAX_HISTORY_BYTES = 3 * 1024 * 1024;
const encoder = new TextEncoder();
const size = (value) => encoder.encode(JSON.stringify(value)).length;
const readJSON = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const requireRoom = (value, bound = MAX_BYTES, what = "Review state") => {
  if (size(value) > bound)
    throw new Error(
      `${what} exceeds the 4 MB limit. Export and review retention before continuing.`,
    );
};
// Serialize commits across cooperating tabs, mirroring the v2 desk. Without
// this, two tabs can both pass the version check and the later write silently
// discards the earlier one. Browsers without the Web Locks API fall back to a
// best-effort in-tab queue, exactly as the v2 desk does.
const queue = [];
const withLock = (fn) =>
  navigator.locks
    ? navigator.locks.request("stable-desk-review-write", fn)
    : new Promise((resolve, reject) => {
        const run = () =>
          Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
              const next = queue.shift();
              if (next) next();
            });
        queue.push(run);
        if (queue.length === 1) run();
      });

export const reviewStore = {
  read() {
    const value = readJSON(KEY);
    if (!value) return null;
    try {
      return validateReview(value);
    } catch {
      // A corrupt or foreign key must not silently overwrite real work.
      return null;
    }
  },
  write(expected, next) {
    return withLock(() => this.commit(expected, next));
  },
  commit(expected, next) {
    validateReview(next);
    if (next.version !== expected + 1)
      throw new Error("Invalid next review version.");
    const current = this.read();
    if ((current?.version ?? -1) !== expected)
      throw new Error("Stored review changed; reload and review again.");
    if (current) {
      // Archiving is best effort under a real total-storage budget. Copies are
      // added newest first while they fit; the rest are dropped, and the live
      // commit proceeds regardless. Refusing to record new work because older
      // copies are large would be a worse lie than retaining fewer copies.
      const history = readJSON(HISTORY_KEY) ?? [];
      const kept = [];
      let used = 0;
      for (const candidate of [
        { version: current.version, at: new Date().toISOString(), body: current },
        ...history,
      ]) {
        if (kept.length >= MAX_HISTORY) break;
        const bytes = size(candidate);
        if (bytes > MAX_COPY_BYTES || used + bytes > MAX_HISTORY_BYTES) continue;
        kept.push(candidate);
        used += bytes;
      }
      localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
    }
    requireRoom(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  },
  backups() {
    return (readJSON(HISTORY_KEY) ?? []).map((h) => h.version);
  },
  recovery(version) {
    const found = (readJSON(HISTORY_KEY) ?? []).find(
      (h) => h.version === Number(version),
    );
    return found ? validateReview(found.body) : null;
  },
  // Replacement is explicit and never automatic: the caller must pass the
  // current version, so a stale tab cannot overwrite newer work.
  replace(expected, next) {
    return withLock(() => {
      validateReview(next);
      if ((this.read()?.version ?? -1) !== expected)
        throw new Error("Stored review changed; reload before replacing.");
      return this.commit(expected, next);
    });
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
