import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolveSupabaseConfig } from "../server/config.mjs";
import { SupabaseAuth } from "../server/auth.mjs";
import { SupabaseStore } from "../server/store.mjs";
import { createAPI } from "../server/api.mjs";
import { initialPilot } from "../server/pilot-model.mjs";
import { prepareDataset } from "../src/workspace.js";

// Nonfunctional transport fixtures only; no generated or configured credentials.
const owner = "11111111-1111-4111-8111-111111111111";
const publicKey = "sb_publishable_NONFUNCTIONAL_PUBLIC_TEST_ONLY";
const secretKey = "sb_secret_NONFUNCTIONAL_SERVER_TEST_ONLY";
const legacyPublic = "eyJfixture.publicTestOnly.notASignature";
const legacyServer = "eyJfixture.serverTestOnly.notASignature";
const base = {
  SUPABASE_URL: "https://fixture.supabase.co",
  PILOT_OWNER_ID: owner,
};
const modernEnv = {
  ...base,
  SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SECRET_KEY: secretKey,
};
const legacyEnv = {
  ...base,
  SUPABASE_ANON_KEY: legacyPublic,
  SUPABASE_SERVICE_ROLE_KEY: legacyServer,
};

test("modern key settings take precedence; legacy and mixed migrations work; wrong or empty modern values fail closed", () => {
  const modern = resolveSupabaseConfig({ ...legacyEnv, ...modernEnv });
  assert.equal(modern.anonKey, publicKey);
  assert.equal(modern.serviceKey, secretKey);
  assert.equal(modern.serverKeyKind, "modern");
  const legacy = resolveSupabaseConfig(legacyEnv);
  assert.equal(legacy.anonKey, legacyPublic);
  assert.equal(legacy.serviceKey, legacyServer);
  assert.equal(legacy.serverKeyKind, "legacy");
  assert.equal(
    resolveSupabaseConfig({ ...legacyEnv, SUPABASE_SECRET_KEY: secretKey })
      .publicKeyKind,
    "legacy",
  );
  assert.equal(
    resolveSupabaseConfig({ ...legacyEnv, SUPABASE_PUBLISHABLE_KEY: publicKey })
      .serverKeyKind,
    "legacy",
  );
  for (const env of [
    {},
    { ...modernEnv, SUPABASE_URL: "https://attacker.example.invalid" },
    { ...modernEnv, PILOT_OWNER_ID: "------------------------------------" },
    { ...legacyEnv, SUPABASE_SECRET_KEY: "" },
    { ...legacyEnv, SUPABASE_PUBLISHABLE_KEY: "invalid" },
    { ...modernEnv, SUPABASE_PUBLISHABLE_KEY: secretKey },
    { ...modernEnv, SUPABASE_SECRET_KEY: publicKey },
    { ...modernEnv, SUPABASE_SECRET_KEY: secretKey + "\n" },
    { ...legacyEnv, SUPABASE_SERVICE_ROLE_KEY: secretKey },
  ])
    assert.equal(resolveSupabaseConfig(env), null);
});

test("modern Auth uses publishable apikey and verified user bearer only; legacy Auth transport remains supported", async () => {
  for (const env of [modernEnv, legacyEnv]) {
    const config = resolveSupabaseConfig(env),
      calls = [];
    const auth = new SupabaseAuth(config, async (url, options) => {
      calls.push({ url, options });
      if (url.includes("token?"))
        return Response.json({
          user: { id: owner },
          access_token: "nonfunctional-user-session",
          expires_in: 3600,
        });
      if (url.endsWith("logout")) return new Response(null, { status: 204 });
      return Response.json({ id: owner });
    });
    const session = await auth.login(
      "reader@example.invalid",
      "nonfunctional-password",
    );
    assert.equal(calls[0].options.headers.apikey, config.anonKey);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.deepEqual(await auth.user(session.token), { id: owner });
    await auth.logout(session.token);
    for (const call of calls.slice(1)) {
      assert.equal(call.options.headers.apikey, config.anonKey);
      assert.equal(
        call.options.headers.Authorization,
        "Bearer nonfunctional-user-session",
      );
      assert.ok(!JSON.stringify(call).includes(secretKey));
    }
  }
  let called = false;
  const wrong = new SupabaseAuth(
    { url: base.SUPABASE_URL, anonKey: secretKey },
    async () => {
      called = true;
    },
  );
  await assert.rejects(
    wrong.login("reader@example.invalid", "fixture-only"),
    /key configuration/,
  );
  assert.equal(called, false);
});

test("modern persistent reads/RPC/recovery use secret apikey without bearer; legacy JWT transport retains bearer", async () => {
  const seed = prepareDataset(
    JSON.parse(
      await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
    ),
  );
  for (const env of [modernEnv, legacyEnv]) {
    const config = resolveSupabaseConfig(env),
      calls = [];
    const store = new SupabaseStore(config, async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        options.method === "POST" ? JSON.parse(options.body).p_body : [],
      );
    });
    assert.equal(await store.read(owner), null);
    assert.deepEqual(await store.backups(owner), []);
    assert.equal(await store.recovery(owner, 0), null);
    await store.write(owner, -1, initialPilot(seed));
    for (const call of calls) {
      assert.equal(call.options.headers.apikey, config.serviceKey);
      assert.equal(
        call.options.headers.Authorization,
        config.serverKeyKind === "modern"
          ? undefined
          : `Bearer ${legacyServer}`,
      );
      assert.equal(call.options.headers.Cookie, undefined);
      assert.ok(
        !JSON.stringify(call.options.body ?? "").includes(config.serviceKey),
      );
    }
    assert.match(calls.at(-1).url, /rpc\/stable_desk_v3_write$/);
    assert.equal(JSON.parse(calls.at(-1).options.body).p_owner, owner);
  }
  let called = false;
  const wrong = new SupabaseStore(
    { url: base.SUPABASE_URL, serviceKey: publicKey },
    async () => {
      called = true;
    },
  );
  await assert.rejects(wrong.read(owner), /key configuration/);
  assert.equal(called, false);
});

test("public status and provider failure responses expose no configured key values", async () => {
  const config = resolveSupabaseConfig(modernEnv);
  const failure = async () =>
    Response.json({ error: secretKey }, { status: 503 });
  const auth = new SupabaseAuth(config, failure),
    store = new SupabaseStore(config, failure);
  const api = createAPI({ auth, store, allowedOwners: [owner] });
  const status = await api(
    new Request("https://pilot.example.invalid/api/desk?action=status"),
  );
  const login = await api(
    new Request("https://pilot.example.invalid/api/desk?action=login", {
      method: "POST",
      headers: {
        origin: "https://pilot.example.invalid",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "reader@example.invalid",
        password: "fixture-only",
      }),
    }),
  );
  assert.equal(login.status, 503);
  const responses = (await status.text()) + (await login.text());
  for (const key of [publicKey, secretKey]) assert.ok(!responses.includes(key));
  await assert.rejects(
    store.read(owner),
    (error) => error.status === 503 && !error.message.includes(secretKey),
  );
});

test("static build with synthetic server-key environment excludes key bytes and server/API modules", async () => {
  const root = new URL("../", import.meta.url);
  execFileSync(process.execPath, ["scripts/build.mjs"], {
    cwd: root,
    env: { ...process.env, ...modernEnv, ...legacyEnv },
    stdio: "pipe",
  });
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(
        entry.name + (entry.isDirectory() ? "/" : ""),
        directory,
      );
      if (entry.isDirectory()) await inspect(path);
      else {
        const bytes = await readFile(path);
        for (const key of [publicKey, secretKey, legacyPublic, legacyServer])
          assert.ok(!bytes.includes(key));
      }
    }
  }
  await inspect(new URL("dist/", root));
  for (const path of [
    "dist/api/desk.js",
    "dist/server/config.mjs",
    "dist/server/auth.mjs",
    "dist/server/store.mjs",
  ])
    await assert.rejects(access(new URL(path, root)), { code: "ENOENT" });
});
