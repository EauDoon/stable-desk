import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("real PostgreSQL engine fixture: owner RLS, prohibited client writes, atomic CAS and recovery", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`,
    );
    await db.exec(
      await readFile(new URL("../db/001-pilot.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(new URL("../db/001-pilot.sql", import.meta.url), "utf8"),
    );
    const owner = "11111111-1111-4111-8111-111111111111";
    await db.exec("set role service_role");
    await db.query("select stable_desk_v3_write($1,-1,$2)", [
      owner,
      { schemaVersion: 3, version: 0 },
    ]);
    await db.query("select stable_desk_v3_write($1,0,$2)", [
      owner,
      { schemaVersion: 3, version: 1 },
    ]);
    await assert.rejects(
      db.query("select stable_desk_v3_write($1,0,$2)", [
        owner,
        { schemaVersion: 3, version: 1 },
      ]),
      /conflict/,
    );
    assert.equal(
      (await db.query("select * from stable_desk_v3_recovery")).rows.length,
      1,
    );
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    assert.equal(
      (await db.query("select * from stable_desk_v3")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("update stable_desk_v3 set version=999"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select stable_desk_v3_write($1,1,$2)", [
        owner,
        { schemaVersion: 3, version: 2 },
      ]),
      /permission denied/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      "22222222-2222-4222-8222-222222222222",
    ]);
    assert.equal(
      (await db.query("select * from stable_desk_v3")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from stable_desk_v3_recovery")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from stable_desk_v3"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
