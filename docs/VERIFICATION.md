# Stable Desk verification record

September 30, 2026. Initial release tests are recorded here after execution. The deliverable uses public primary-source research and deterministic/browser checks; no independent multi-agent review panel or financial/regulatory assurance is claimed.

Executed results: `npm run validate` passed for 10 organizations, 17 sources, 20 evidence records and 3 priorities; `npm test` passed 7 model tests; `npm run test:browser` passed all 16 tests (8 desktop, 8 mobile); `npm run build` produced the validated static app.

The build validates schema version, enums, dates, HTTPS source URLs, unique IDs and all evidence/organization/priority/decision references. Model tests exercise compound evidence search, invalid imports, changed/new evidence, review deadlines and export round trips.

Chromium browser tests run at desktop 1440 × 1000 and mobile 390 × 844. They exercise all three views, search/filter/empty states, organization/source/priority detail, Escape dismissal, 2–3 organization comparisons, decision persistence after reload, exported workspace restoration, evidence-change review flags, reasoned review, import rejection and escaped untrusted prose. Tests also validate rendered source URL targets and local documentation links. Screenshots are generated for all views and priority detail; images are inspected separately from interaction assertions.

Screenshots of Opportunities, Changes, Decisions and mobile priority detail were inspected: content is readable, cards stack on mobile, and page/dialog overflow checks passed. Browser tests found and resolved a navigation accessible-name issue and a missing explicit decision-status label. The final run had no reported JavaScript page errors.

The `check:links` script performs unauthenticated public GET requests, separately from the research tool's page access. `artifacts/source-links.json` contains exact responses and timestamps. In this cloud executor, all 17 direct GETs returned `fetch failed` with no HTTP status; a separate curl attempt also could not complete. This client-level network limitation prevents claiming independent HTTP reachability. All retained source pages were successfully opened through the web research tool, and browser tests confirmed all 17 rendered URL targets match the source records. An HTTP 403/429/timeout is likewise not silently counted as a valid live response or as a dead link.

Remaining coverage: Safari/Firefox, screen-reader use, independently audited adoption data, authenticated product eligibility, executing quote/redemption flows, deployed hosting and cross-device synchronization have not been tested. The app is a dated research tool; no financial trades, payments, messages or subscriptions were made.
