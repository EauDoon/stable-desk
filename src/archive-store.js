import { uid } from "./workspace.js";

// Desk recovery copies: the saved workspace JSON, archived under
// `stable-desk:archive:<Date.now()>:<uid>` before an import or reset replaces
// it. They share one origin quota with the live workspace, drafts and the
// source-review history (which keeps up to 20 copies or 3 MiB), so they are
// bounded more tightly here. Only keys with this prefix are ever evicted.
export const ARCHIVE_PREFIX = "stable-desk:archive:";
export const ARCHIVE_MAX_COPIES = 10;
// Browsers count stored strings as UTF-16, so the budget is (key + value) * 2.
export const ARCHIVE_MAX_BYTES = 2 * 1024 * 1024;
export const STORAGE_FULL =
  "Storage is full. Export your workspace, delete old recovery copies and retry; nothing was replaced.";

export const isQuotaError = (error) =>
  error?.name === "QuotaExceededError" ||
  error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
  error?.code === 22 ||
  error?.code === 1014;
const stamp = (key) =>
  Number(key.slice(ARCHIVE_PREFIX.length).split(":")[0]) || 0;
const bytes = (key, value) => 2 * (key.length + (value?.length ?? 0));

// Newest first. Keys sort by their numeric timestamp, then by key.
export function listArchives(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (typeof key === "string" && key.startsWith(ARCHIVE_PREFIX)) keys.push(key);
  }
  return keys.sort(
    (a, b) => stamp(b) - stamp(a) || (a < b ? 1 : a > b ? -1 : 0),
  );
}

// Writes one key, evicting the oldest recovery copies (never `keep`, never a
// non-archive key) while the origin quota refuses it.
export function setEvictingArchives(storage, key, value, keep = []) {
  const protectedKeys = new Set([...keep, key]);
  for (;;) {
    try {
      storage.setItem(key, value);
      return key;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      const oldest = listArchives(storage)
        .filter((k) => !protectedKeys.has(k))
        .at(-1);
      if (!oldest) throw new Error(STORAGE_FULL);
      storage.removeItem(oldest);
    }
  }
}

export function writeArchive(storage, raw, { now = Date.now(), keep = [] } = {}) {
  return setEvictingArchives(
    storage,
    `${ARCHIVE_PREFIX}${now}:${uid("BACKUP")}`,
    raw,
    keep,
  );
}

// Keeps the newest copy and every key in `keep`, then older copies, newest
// first, while there are at most ARCHIVE_MAX_COPIES and they fit
// ARCHIVE_MAX_BYTES together. Everything older than the first copy that does
// not fit is removed.
export function pruneArchives(storage, { keep = [] } = {}) {
  const kept = new Set(keep);
  const removed = [];
  let count = 0,
    used = 0,
    full = false;
  listArchives(storage).forEach((key, index) => {
    const size = bytes(key, storage.getItem(key));
    full ||=
      index > 0 &&
      !kept.has(key) &&
      (count >= ARCHIVE_MAX_COPIES || used + size > ARCHIVE_MAX_BYTES);
    if (full && !kept.has(key)) {
      storage.removeItem(key);
      removed.push(key);
      return;
    }
    count++;
    used += size;
  });
  return removed;
}

export function deleteArchive(storage, key) {
  if (typeof key !== "string" || !key.startsWith(ARCHIVE_PREFIX))
    throw new Error("Only recovery copies can be deleted here.");
  storage.removeItem(key);
}
