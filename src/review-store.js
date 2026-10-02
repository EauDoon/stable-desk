import { validateReview, hash } from "./review-model.js";
import { canonical } from "./workspace.js";
const KEY = "stable-desk:review";
const HISTORY_KEY = "stable-desk:review-history";
const MAX_HISTORY_BYTES = 3 * 1024 * 1024;
const size = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
let queue = Promise.resolve();
const withLock = (fn) => {
  if (globalThis.navigator?.locks)
    return navigator.locks.request("stable-desk-review-write", fn);
  // Without Web Locks this serializes only this tab. Export before switching tabs.
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
};
const history = () => {
  const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  if (!Array.isArray(value)) throw new Error("Unreadable recovery history.");
  return value;
};
const same = (a, b) => canonical(a) === canonical(b);
function save(current, next) {
  validateReview(next);
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch (error) {
    if (error.name !== "QuotaExceededError") throw error;
    // Recovery copies are expendable; the durable live state is never removed.
    localStorage.removeItem(HISTORY_KEY);
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      throw new Error("Storage is full. Last saved review is intact. Export it, free space and retry; your draft is retained.");
    }
  }
  if (current) {
    try {
      const kept = [];
      let used = 0;
      for (const copy of [{ version: current.version, at: new Date().toISOString(), body: current }, ...history()]) {
        const bytes = size(copy);
        if (kept.length < 20 && used + bytes <= MAX_HISTORY_BYTES) {
          kept.push(copy);
          used += bytes;
        }
      }
      while (kept.length) {
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
          break;
        } catch {
          kept.pop();
        }
      }
    } catch {
      // An unreadable archive stays untouched; a successful live save stays saved.
    }
  }
  return next;
}
export const reviewStore = {
  raw() { return localStorage.getItem(KEY); },
  read() {
    const raw = this.raw();
    if (raw === null) return null;
    try { return validateReview(JSON.parse(raw)); }
    catch { throw new Error("Saved review is unreadable. Download the raw record before explicitly discarding it; nothing was overwritten."); }
  },
  assertCurrent(expected) {
    const current = this.read();
    if (!same(current, expected))
      throw new Error("Stored review changed; reload and review again. Your draft is retained.");
    return current;
  },
  write(expected, next) {
    return withLock(() => {
      const current = this.assertCurrent(expected);
      if (!current || next.version !== current.version + 1)
        throw new Error("Invalid next review version.");
      return save(current, next);
    });
  },
  replace(expected, next) {
    return withLock(() => {
      const current = this.assertCurrent(expected);
      validateReview(next);
      if (current && (!same(current.desk.dataset, next.desk.dataset) ||
          current.desk.workspace.id !== next.desk.workspace.id ||
          !same(current.journal, next.journal.slice(0, current.version)) ||
          !same(current.desk.workspace.events, next.desk.workspace.events.slice(0, current.desk.workspace.events.length)) ||
          (current.version === next.version && !same(current, next))))
        throw new Error("Backup diverges from or predates this review. Export and explicitly reset before restoring a different history.");
      return save(current, next);
    });
  },
  clear(expectedRaw) {
    return withLock(() => {
      if (this.raw() !== expectedRaw)
        throw new Error("Stored review changed; reload and download it again before reset.");
      localStorage.removeItem(KEY);
    });
  },
  backups() { return history().map((copy) => ({ version: copy.version, key: hash(copy.body) })); },
  recovery(key) {
    const found = history().find((copy) => hash(copy.body) === key);
    return found ? validateReview(found.body) : null;
  },
};
