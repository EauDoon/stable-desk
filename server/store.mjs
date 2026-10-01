import { DatabaseSync } from "node:sqlite";
import { PilotError, validatePilot } from "./pilot-model.mjs";
// Local fixture adapter only. Vercel never selects this adapter or a writable local file.
export class FixtureStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS spaces (owner TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS recovery (owner TEXT, version INTEGER, body TEXT NOT NULL, PRIMARY KEY(owner,version));",
    );
  }
  read(owner) {
    const row = this.db
      .prepare("SELECT body FROM spaces WHERE owner=?")
      .get(owner);
    return row ? validatePilot(JSON.parse(row.body)) : null;
  }
  backups(owner) {
    return this.db
      .prepare(
        "SELECT version FROM recovery WHERE owner=? ORDER BY version DESC",
      )
      .all(owner)
      .map((r) => r.version);
  }
  recovery(owner, version) {
    const row = this.db
      .prepare("SELECT body FROM recovery WHERE owner=? AND version=?")
      .get(owner, version);
    return row ? validatePilot(JSON.parse(row.body)) : null;
  }
  async write(owner, expected, next) {
    validatePilot(next);
    if (next.version !== expected + 1)
      throw new PilotError("Invalid next shared version.", 409);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.read(owner);
      if ((current?.version ?? -1) !== expected)
        throw new PilotError(
          "Concurrent update; reload and review again.",
          409,
        );
      if (current)
        this.db
          .prepare("INSERT INTO recovery VALUES (?,?,?)")
          .run(owner, current.version, JSON.stringify(current));
      this.db
        .prepare(
          "INSERT INTO spaces VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET version=excluded.version,body=excluded.body",
        )
        .run(owner, next.version, JSON.stringify(next));
      this.db.exec("COMMIT");
      return next;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
export class SupabaseStore {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }
  async request(path, body) {
    const response = await this.fetcher(`${this.config.url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        apikey: this.config.serviceKey,
        Authorization: `Bearer ${this.config.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      if ([409, 412].includes(response.status))
        throw new PilotError(
          "Concurrent update; reload and review again.",
          409,
        );
      throw new PilotError(
        "Persistent storage is unavailable. Your draft is retained; no success is claimed.",
        503,
      );
    }
    return response.json();
  }
  async read(owner) {
    const rows = await this.request(
      `stable_desk_v3?owner=eq.${encodeURIComponent(owner)}&select=body`,
    );
    return rows[0] ? validatePilot(rows[0].body) : null;
  }
  async backups(owner) {
    const rows = await this.request(
      `stable_desk_v3_recovery?owner=eq.${encodeURIComponent(owner)}&select=version&order=version.desc`,
    );
    return rows.map((r) => r.version);
  }
  async recovery(owner, version) {
    const rows = await this.request(
      `stable_desk_v3_recovery?owner=eq.${encodeURIComponent(owner)}&version=eq.${Number(version)}&select=body`,
    );
    return rows[0] ? validatePilot(rows[0].body) : null;
  }
  async write(owner, expected, next) {
    validatePilot(next);
    return this.request("rpc/stable_desk_v3_write", {
      p_owner: owner,
      p_expected: expected,
      p_body: next,
    });
  }
}
