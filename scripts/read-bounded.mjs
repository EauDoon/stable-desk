import { constants } from "node:fs";
import { open } from "node:fs/promises";

/** Read at most limit + 1 bytes, even if a file grows after stat. */
export async function readBoundedUtf8(path, limit) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid byte limit.");
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error("Import must be a regular file.");
    if (info.size > limit) throw new Error("Import exceeds 4 MB.");
    const chunks = [];
    let total = 0;
    while (total <= limit) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > limit) throw new Error("Import exceeds 4 MB.");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, total));
  } finally {
    await file.close();
  }
}
