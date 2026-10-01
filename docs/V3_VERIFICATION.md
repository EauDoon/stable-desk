# Stable Desk v3 verification

October 1, 2026. This separates local implementation evidence from unverified hosted integration. The original public baseline and fictional provenance remain unchanged.

## Local acceptance

**42 model/API/database cases pass. 16 pilot Chromium browser cases pass (8 desktop, 8 mobile), plus all 46 original v2 browser cases.** Static build smoke covers both viewport sizes, actual local edits/reload and the unconfigured v3 page's failure closure. These counts describe local fixtures, not hosted integration.

- Model/API/adapter tests cover source baseline/unchanged/failed checks, exact candidate dates/hashes, acceptance/rejection, blocked synthetic/fact promotion, stale version/content/evidence, duplicate operation intent, history integrity, deterministic extraction, weekly windows and the 60-operation bound.
- SQLite fixtures verify atomic writes, recovery copies, independent owners and persistence after closing/reopening the database. Independent browser contexts simulate devices; these are local fixture sessions, not Supabase accounts.
- PGlite executes actual PostgreSQL migration/function/RLS statements with synthetic `auth.uid`/roles. It verifies repeatable migration, owner reads, anonymous denial, prohibited authenticated writes/RPC, stale CAS rejection and recovery persistence. This proves SQL behavior in a PostgreSQL engine fixture, not a hosted Supabase deployment or concurrent multi-connection load.
- API fixtures verify denied unauthenticated access, same-origin JSON checks, forged-owner rejection, server-only collection fields, interrupted login without cookie/state creation, HTTPS/approved-account requirements, secure HttpOnly cookie contract, authoritative provider-user lookup calls and server-only storage headers. Provider calls are stubbed; their real network/security behavior is gated.
- Desktop/mobile browser workflows exercise source-to-review adoption, exact assumption staleness in the shared desk, rejection, dated brief export, explicit backed-up v2 import with byte-identical local keys, separate-device persistence, unauthorized account isolation, sign-out failure closure, interrupted login/save, retained in-memory rationale and stale candidate rejection. Shared manual edits and prior recovery downloads are exercised separately. A delayed state response verifies that a stale shared draft waits for its current basis before committing; a synthetic expired session locks the view on refresh.
- Original 46 v2 browser regression cases pass, including local migration, interrupted drafts, revision/decision history, malformed/divergent imports, competing tabs, storage failure and recovery. They run against the default local mode, independently of the pilot fixture server.

Commands: `npm run validate`, `npm test`, `npm run test:pilot`, `npm run test:browser`, `npm run build`, `npm run package`, `npm run test:smoke`, `npm run audit:content`. Browser results and rendered screenshots are saved in `artifacts/`. No screenshot is a fabricated mockup. Static packaging includes local v2 plus an honestly unconfigured v3 page; server/API code is delivered through the source repository, not claimed to run inside the static ZIP.

## Hosted acceptance still blocked

No Supabase project, approved account, provider credential, external SQL application or v3 deployment exists from this work. Real password login/logout/session expiry, provider row/security configuration, Vercel function tracing/build, HTTPS cookies, shared hosted persistence and public-source extraction are unverified. The real bounded Stripe fetch returned an unresolved outcome with no HTTP status at `2026-10-01T05:24:28.855Z`; no evidence was adopted.

The supplied live v2 URL was not changed. This executor could not independently fetch that URL through the web tool, and the deployment lookup returned `INVALID_ARGUMENT`; this does not establish a production failure. Production source identity is reported by the maintainer, while local/remote Git base SHA is independently verified.

Review [the pilot contract and gates](V3_PILOT.md) before any provisioning/production action. No account/credential/OAuth permission or paid service was created, and no security settings or live data were changed. Earlier Git history still contains earlier project content; current deliverables are audited without history rewriting.
