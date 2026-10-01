# 10 — Actual change log and recovery

First recorded executor/time checkpoint: **2026-10-01 05:04:06 UTC**. This is the observation start, not an exact prompt-receipt time. `artifacts/v3-pilot-log.json` records elapsed wall time/checkpoints, including implementation, verification, coordination and waits; it is not a throughput benchmark.

- 05:07:19 UTC observation: base/branch inspected; independent implementation begun; provider configuration absent.
- 05:09:35 UTC observation: source-to-review model and bounded extraction implemented.
- 05:21:35 UTC observation: first run passed 39/40 model/API/database cases. One cloned review object was incorrectly compared by reference; corrected to structural equality. PostgreSQL RLS/CAS tests passed.
- 05:24:28.855 UTC: actual official-page collection unresolved, zero content/adoption; saved `v3-source-check.json`.
- First browser run: 6 passes/4 failures, caused by the fixture rejecting its root URL. Fixed the local fixture server. Second: 8 passes/2 failures, caused by a test selecting button instead of link for Decisions. Corrected locator. Third: all 10 pilot cases pass; all original 46 v2 browser regressions pass.
- 05:32:19 UTC observation: expanded 42 model tests pass, including HTTPS/approved-owner controls and the 60-operation bound. Shared manual edits and recovery-copy downloads then expanded browser coverage to 12 passing cases.
- Parent supplied the Blitz contract; added four records and a representative duplicate-DELTA/fresh-session continuation test. All 14 pilot browser cases pass; per-run timestamps/checkpoint hashes are retained in their artifacts.

Interventions/rework are the actual corrections above and parent scope/contract clarification. Automatic Playwright retries are disabled. New/changed guards required new test runs; earlier failures are not hidden by retries. Injected outages/source revisions are synthetic, not claims of external provider recovery.

Recovery evidence: database close/reopen persistence; atomic CAS rejection without partial adoption; immutable prior-state copies; PostgreSQL client-write denial; byte-identical v2 keys after import; browser download of a prior copy; review rationale retained through an aborted save; and an independent session resuming the exact checkpoint without replaying writes. Destructive full-v3 restore is unavailable; inspect backups and record forward revisions to retain history.

Unresolved: real hosted auth/database, provider limits, Vercel function build, official-page access and production rollout. No paid resource, new credential/grant or production/security setting changed. User usefulness/adoption and comparative speed/cost remain unmeasured.

Final continuation checkpoint (2026-10-01T06:02:21.507532+00:00): parent corrected a superseded v2 deployment response. Resumed saved v3 work, fixed asynchronous shared-draft rebase and expired-refresh locking, and verified 42 model/API/database, 16 pilot browser and 46 v2 regression cases. Delayed-fetch/session failures are synthetic. Formatter cache failure recovered using `/tmp`; no extra permissions or provider changes. Weekly briefs now preserve exact affected assumption/decision IDs and adopted heads.
