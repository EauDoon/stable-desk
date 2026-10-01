import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareDataset,
  activeState,
  assumptionStatus,
  workspaceHead,
} from "../src/workspace.js";
import {
  initialPilot,
  applyPilot,
  decodeDesk,
  validatePilot,
  weeklyBrief,
  WATCH,
} from "../server/pilot-model.mjs";
import { meaningfulText, collect } from "../server/collector.mjs";
import { FixtureStore, SupabaseStore } from "../server/store.mjs";
import { FixtureAuth, SupabaseAuth } from "../server/auth.mjs";
import { createAPI } from "../server/api.mjs";
const seed = prepareDataset(
  JSON.parse(
    await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
  ),
);
const at = "2026-10-01T05:00:00.000Z",
  actor = "user:11111111-1111-4111-8111-111111111111";
const text = (n) =>
  `Official stablecoin documentation. Merchants must examine business eligibility, country restrictions and supported tokens before using the payment product. Revision ${n}.`;
const check = (p, n, id = `CHECK-${n}`) =>
  applyPilot(
    p,
    {
      type: "check",
      opId: id,
      expectedVersion: p.version,
      capture: { outcome: "ok", text: text(n) },
    },
    actor,
    at,
  ).state;
const proposed = () => check(check(initialPilot(seed), 1), 2);
function review(p, type = "accepted", extra = {}) {
  const c = p.candidates.at(-1);
  return {
    type,
    opId: "REVIEW-1",
    expectedVersion: p.version,
    candidateId: c.id,
    expectedCandidateHash: c.afterHash,
    statement:
      "Stripe describes updated stablecoin payment eligibility. This public company claim does not establish fictional STABLE acceptance.",
    classification: "company_claim",
    rationale:
      "Reviewed exact public text change; independent rollout verification remains unresolved.",
    ...extra,
  };
}
test("first capture establishes honest baseline; unchanged/failed checks never adopt evidence", () => {
  let p = initialPilot(seed),
    head = workspaceHead(p.desk.workspace);
  assert.equal(p.checks.length, 0);
  p = check(p, 1);
  assert.equal(p.checks[0].outcome, "baseline");
  p = check(p, 1, "SAME");
  assert.equal(p.checks[1].outcome, "unchanged");
  p = applyPilot(
    p,
    {
      type: "check",
      opId: "FAILED",
      expectedVersion: p.version,
      capture: { outcome: "unreachable", status: 403 },
    },
    actor,
    at,
  ).state;
  assert.equal(p.candidates.length, 0);
  assert.equal(workspaceHead(p.desk.workspace), head);
  assert.equal(p.checks[2].status, 403);
});
test("source difference creates dated candidate; accept records atomic claim/check and exact assumption impact", () => {
  let p = proposed();
  const original = decodeDesk(p.desk),
    before = activeState(original.seed, original.workspace);
  assert.equal(p.candidates.length, 1);
  assert.equal(p.desk.workspace.events.length, 0);
  p = applyPilot(p, review(p), actor, at).state;
  assert.equal(p.candidates[0].status, "accepted");
  assert.equal(p.desk.workspace.events.length, 2);
  const parsed = decodeDesk(p.desk),
    after = activeState(parsed.seed, parsed.workspace);
  assert.notEqual(
    after.evidence["E-G02"].revision,
    before.evidence["E-G02"].revision,
  );
  assert.match(assumptionStatus(after, "A-P-G01-2").label, /review/i);
  assert.deepEqual(
    after.assumptions["A-P-G02-2"].review,
    before.assumptions["A-P-G02-2"].review,
  );
  assert.equal(p.journal.at(-1).actor, actor);
  assert.match(after.checks.at(-1).note, /SHA-256/);
  validatePilot(p);
});
test("reject preserves all adopted evidence and decisions; repeated identical review is idempotent", () => {
  const p = proposed(),
    command = review(p, "rejected");
  const r = applyPilot(p, command, actor, at);
  assert.deepEqual(r.state.desk, p.desk);
  assert.equal(applyPilot(r.state, command, actor, at).duplicate, true);
  assert.throws(
    () =>
      applyPilot(
        r.state,
        { ...command, rationale: "different rationale" },
        actor,
        at,
      ),
    /changed intent/,
  );
  assert.throws(
    () => applyPilot(r.state, command, "user:other", at),
    /changed intent/,
  );
});
test("stale workspace/source/evidence rejects adoption, newer capture supersedes pending candidate", () => {
  let p = proposed(),
    command = review(p);
  assert.throws(
    () => applyPilot(p, { ...command, expectedVersion: 0 }, actor, at),
    /changed/,
  );
  assert.throws(
    () =>
      applyPilot(p, { ...command, expectedCandidateHash: "old" }, actor, at),
    /stale/,
  );
  p = check(p, 3);
  assert.equal(p.candidates[0].status, "superseded");
  assert.throws(
    () => applyPilot(p, { ...command, expectedVersion: p.version }, actor, at),
    /already reviewed/,
  );
});
test("monitor cannot promote synthetic evidence; malformed/tampered/reordered/oversize histories fail", () => {
  const p = proposed();
  assert.throws(
    () =>
      applyPilot(
        p,
        review(p, "accepted", { classification: "synthetic_example" }),
        actor,
        at,
      ),
    /classification/,
  );
  for (const mutate of [
    (x) => x.journal.reverse(),
    (x) => (x.candidates[0].afterText += "tamper"),
    (x) => x.version++,
    (x) => (x.journal[0].actor = "intruder"),
  ]) {
    const x = structuredClone(p);
    mutate(x);
    assert.throws(() => validatePilot(x));
  }
  assert.throws(() => validatePilot({ schemaVersion: 3 }));
  assert.throws(() => initialPilot(seed, "{bad JSON"));
});
test("weekly brief uses exact window and source dates; unreviewed candidates never become adopted conclusions", () => {
  const p = proposed(),
    brief = weeklyBrief(p, "2026-10-02T05:00:00.000Z");
  assert.match(brief, /2 source checks; 0 accepted/);
  assert.match(brief, /1 candidates pending/);
  assert.match(brief, /https:\/\/docs.stripe.com/);
  assert.match(brief, /STABLE.*fictional/);
  assert.match(weeklyBrief(p, "2026-10-10T05:00:00.000Z"), /0 source checks/);
  const adopted = applyPilot(p, review(p), actor, at).state;
  const acceptedBrief = weeklyBrief(adopted, "2026-10-02T05:00:00.000Z");
  assert.match(acceptedBrief, /1 accepted revisions/);
  assert.match(acceptedBrief, /E-G02/);
  assert.match(acceptedBrief, /A-P-G01-2/);
  assert.match(acceptedBrief, /D-G01/);
  assert.match(acceptedBrief, /no decision was automatically endorsed/);
});
test("meaningful content excludes navigation/script changes; unsupported layout/media/redirects are unresolved", async () => {
  const html = (nav) =>
    `<html><nav>${nav}</nav><main><h1>Stablecoin payments</h1><p>${text(1)}</p><script>hostile()</script></main></html>`;
  assert.equal(meaningfulText(html("old")), meaningfulText(html("new")));
  assert.throws(() => meaningfulText("<h1>Login required</h1>"));
  let url, options;
  const result = await collect(async (u, o) => {
    url = u;
    options = o;
    return new Response(html("test"), {
      headers: { "content-type": "text/html" },
    });
  });
  assert.equal(url, WATCH.url);
  assert.equal(options.redirect, "manual");
  assert.equal(result.outcome, "ok");
  for (const status of [301, 403, 429, 500])
    assert.equal(
      (await collect(async () => new Response("", { status }))).outcome,
      "unreachable",
    );
  assert.equal(
    (
      await collect(async () => {
        throw new Error("timeout");
      })
    ).status,
    null,
  );
});
test("fixture storage persists across restart, isolates owners, saves recovery, and rejects CAS conflicts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "desk-v3-")),
    path = join(dir, "state.sqlite");
  let db = new FixtureStore(path);
  try {
    const p = initialPilot(seed);
    await db.write("owner-a", -1, p);
    assert.equal(db.read("owner-b"), null);
    const next = check(p, 1);
    await db.write("owner-a", 0, next);
    await assert.rejects(db.write("owner-a", 0, next), /Concurrent/);
    assert.deepEqual(db.backups("owner-a"), [0]);
    assert.equal(db.recovery("owner-b", 0), null);
    db.close();
    db = new FixtureStore(path);
    assert.equal(db.read("owner-a").version, 1);
    assert.deepEqual(db.recovery("owner-a", 0).desk, p.desk);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
function client(api, origin = "http://localhost") {
  let cookie = "";
  return async (action, body = null, extra = {}) => {
    const response = await api(
      new Request(`${origin}/api/desk?action=${action}`, {
        method: body ? "POST" : "GET",
        headers: {
          cookie,
          ...(body ? { "content-type": "application/json", origin } : {}),
          ...extra,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    if (response.headers.has("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  };
}
test("API fails closed without config; protected reads/writes reject unauthorized/cross-site/forged owner", async () => {
  let n = 0;
  const db = new FixtureStore(":memory:"),
    api = createAPI({
      store: db,
      auth: new FixtureAuth(),
      fixture: true,
      collector: async () => ({ outcome: "ok", text: text(++n) }),
    }),
    a = client(api),
    b = client(api);
  try {
    assert.equal((await client(createAPI({}))("state")).status, 503);
    assert.equal((await a("state")).status, 401);
    assert.equal(
      (await a("login", { email: "reader-a@example.invalid", password: "bad" }))
        .status,
      401,
    );
    const login = await a("login", {
      email: "reader-a@example.invalid",
      password: "fixture-only",
    });
    assert.match(login.cookie, /HttpOnly; SameSite=Strict/);
    assert.equal(login.body.token, undefined);
    assert.equal(
      (await a("init", {}, { origin: "https://evil.invalid" })).status,
      403,
    );
    assert.equal((await a("init", {})).status, 200);
    assert.equal((await a("init", {})).body.duplicate, true);
    assert.equal(
      (
        await a("operate", {
          type: "check",
          opId: "FORGE",
          expectedVersion: 0,
          owner: "other",
        })
      ).status,
      403,
    );
    await b("login", {
      email: "reader-b@example.invalid",
      password: "fixture-only",
    });
    assert.equal((await b("state")).body.pilot, null);
    assert.deepEqual((await b("recovery")).body.versions, []);
    assert.equal(
      (
        await a("operate", {
          type: "check",
          opId: "FAKE",
          expectedVersion: 0,
          capture: { text: "fake" },
        })
      ).status,
      400,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await a("operate", {
            type: "check",
            opId: `FETCH-${i}`,
            expectedVersion: i,
          })
        ).status,
        200,
      );
    const state = (await a("state")).body.pilot;
    assert.equal(
      (
        await a("operate", {
          type: "check",
          opId: "FETCH-1",
          expectedVersion: 1,
        })
      ).body.duplicate,
      true,
    );
    assert.equal(n, 2);
    const accepted = await a("operate", review(state));
    assert.equal(accepted.status, 200);
    assert.equal((await a("operate", review(state))).body.duplicate, true);
    assert.equal(
      (await a("operate", { type: "check", opId: "STALE", expectedVersion: 0 }))
        .status,
      409,
    );
    assert.equal((await a("logout", {})).status, 200);
    assert.equal((await a("state")).status, 401);
  } finally {
    db.close();
  }
});
test("interrupted login creates no cookie/state; Supabase auth verifies identities server-side and store sends only server credentials", async () => {
  const db = new FixtureStore(":memory:");
  try {
    const result = await client(
      createAPI({
        store: db,
        auth: {
          login: async () => {
            throw new Error("network interrupted");
          },
        },
        fixture: true,
      }),
    )("login", { email: "reader-a@example.invalid", password: "fixture-only" });
    assert.equal(result.cookie, null);
    assert.equal(db.read("owner"), null);
    let called;
    const auth = new SupabaseAuth(
      { url: "https://example.supabase.co", anonKey: "fixture-public-key" },
      async (url, options) => {
        called = { url, options };
        return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
      },
    );
    await auth.user("fixture-token");
    assert.match(called.url, /auth\/v1\/user$/);
    assert.equal(called.options.headers.Authorization, "Bearer fixture-token");
    const store = new SupabaseStore(
      { url: "https://example.supabase.co", serviceKey: "fixture-server-key" },
      async (url, options) => {
        called = { url, options };
        return Response.json([]);
      },
    );
    await store.read("11111111-1111-4111-8111-111111111111");
    assert.equal(called.options.headers.apikey, "fixture-server-key");
  } finally {
    db.close();
  }
});
test("hosted-mode contract requires HTTPS, approved identity and secure HttpOnly cookie; no fixture selection via requests", async () => {
  const db = new FixtureStore(":memory:"),
    api = createAPI({
      store: db,
      auth: new FixtureAuth(),
      allowedOwners: ["11111111-1111-4111-8111-111111111111"],
    }),
    insecure = client(api),
    a = client(api, "https://pilot.example.invalid"),
    b = client(api, "https://pilot.example.invalid");
  try {
    assert.equal(
      (
        await insecure("login", {
          email: "reader-a@example.invalid",
          password: "fixture-only",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await b("login", {
          email: "reader-b@example.invalid",
          password: "fixture-only",
        })
      ).status,
      403,
    );
    const allowed = await a("login", {
      email: "reader-a@example.invalid",
      password: "fixture-only",
    });
    assert.match(allowed.cookie, /__Host-stable-desk-session/);
    assert.match(allowed.cookie, /; Secure/);
    assert.equal(allowed.body.fixture, false);
    assert.equal((await a("init", {})).status, 200);
  } finally {
    db.close();
  }
});
test("60-operation pilot bound and stale adopted evidence cannot silently accept an old candidate", () => {
  let p = proposed(),
    parsed = decodeDesk(p.desk),
    state = activeState(parsed.seed, parsed.workspace);
  p = applyPilot(
    p,
    {
      type: "command",
      opId: "MANUAL-EDIT",
      expectedVersion: p.version,
      command: {
        type: "evidence_revision",
        recordId: "E-G02",
        profileId: parsed.workspace.activeProfileId,
        opId: "EDIT-E-G02",
        expectedHead: workspaceHead(parsed.workspace),
        expectedRevision: state.evidence["E-G02"].revision,
        after: {
          ...state.evidence["E-G02"].value,
          scope: "Manually revised scope after examining public context.",
        },
        rationale:
          "Manual research review of scope; not a monitored source adoption.",
      },
    },
    actor,
    at,
  ).state;
  assert.throws(() => applyPilot(p, review(p), actor, at), /Evidence changed/);
  for (let i = p.version; i < 60; i++) p = check(p, 2, `BOUND-${i}`);
  assert.equal(p.version, 60);
  assert.throws(() => check(p, 2, "OVER-LIMIT"), /60 operations/);
});
