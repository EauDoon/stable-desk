# Stable Desk verification record

## Import and preview-server follow-up, 02-10-2026

The research desk now discards delayed file reads after another file or recovery copy is selected, or the import dialog closes. Previously a slow first file could replace a newer selected workspace. Review import controls now disable during the existing operation lock instead of silently ignoring a second selection. Actual desktop/mobile browser regressions cover both paths, including invalid newer files and recovery choices.

The local server now resolves canonical file paths before reading, rejects hidden paths and decoded backslashes, and checks the exact local host and listening port in its default loopback mode. The explicit `--host 0.0.0.0` public-preview option remains supported. Both modes refuse supplied foreign origins and browser cross-site requests to source collection. A real-server test uses synthetic outside-root junction/symlink and hidden-directory files in both modes, then verifies the existing adapter contract with a stub external source. These fixes address reproduced local-server exposures, not evidence of compromise or hosted deployment validation.

Local checks: 65 Node tests, 76 Chromium desktop/mobile cases, baseline validation, build and both build-smoke viewports. Existing storage, unsigned-history, browser coverage and deployment limitations below still apply.

## Integrity-fix verification, 02-10-2026

This section supersedes contradictory v4 guarantees in the historical record below. The earlier adapter tests called the helper instead of the deployed wrapper; the earlier storage stress test never used its large capture or actual store. The old importer accepted v2 only, corrupt records could be initialized over, stale reset was unguarded, and the no-Web-Locks queue invoked a callback twice. These are reproduced defects, not evidence of hosted compromise.

The current candidate passes **65 Node model/store/HTTP tests** and **72 Chromium browser tests** (36 desktop at 1440 x 1000, 36 mobile at 390 x 844), plus baseline validation, static build, byte-compared packaging and both build-smoke viewports. After the final review-model completeness guard, all 26 review-browser cases were rerun successfully. The review tests now use each project's actual viewport. New artifacts go to ignored `test-results/`; checked-in `artifacts/` remain historical. The new GitHub workflow publishes commit/tree and runtime receipts with its outputs; local results do not imply that hosted CI has already passed.

- The actual store preserves malformed/foreign/empty live bytes, rejects stale resets and replacements, serializes the fallback exactly once, and retains the last durable state if quota prevents a live save. A 5 MiB simulated whole-origin UTF-16 quota includes an existing 256 Ki-character v2 record and near-20,000-character captures. It exercises the real store and archive eviction; it is not a universal browser quota guarantee. Recovery copies use content hashes so equal version numbers after reset remain distinguishable.
- Exported v4 histories restore through preview, backup and confirmation in a fresh browser. Tests compare the complete restored object, including desk events, journal, checks, candidates and snapshots. Omitted journal-linked records, malformed/oversized files and divergent or older histories are rejected. An independent reviewer found the omitted-record gap during this pass; reciprocal completeness checks now cover it.
- Two synthetic source changes exercise acceptance and rejection, then a real browser downloads the adopted v2 workspace and imports it through the desk UI. The changed claim, affected-assumption warning, stale decision and exact original decision events survive the handoff. This is workflow evidence, not two live public-source research cycles.
- HTTP tests invoke the actual hosted export over a local HTTP server and the real local server process with a stub upstream. DELETE/TRACE, non-JSON, declared/streamed oversized bodies and caller URL parameters are refused before collection. JSON/no-store/nosniff headers survive both adapters. Concurrent/repeated checks respect a 30-second per-process cooldown; upstream redirects and oversized source responses remain unresolved.
- Clean `npm ci --ignore-scripts` required synchronizing the previously stale lockfile with the already-declared Cheerio dependency. No direct dependency version was changed. Playwright defaults to its installed browser; no hard-coded Linux executable or disabled sandbox is added.

Limits: Chromium on Windows was exercised locally; Linux acceptance awaits the exact-commit workflow. Safari, Firefox, screen readers, hosted deployment identity and deployment-wide traffic budgets remain unverified. Browser tests use deterministic synthetic captures; HTTP adapter tests stub only the external source. No license, account, database, hosting configuration, paid service or manual deployment was added. Without Web Locks, cross-tab exact simultaneous writes can race; the fallback serializes only one tab. Local unsigned records cannot authenticate a reviewer or prevent a user from rewriting all history.

## Historical verification records


October 2, 2026 update (v4): the source-review surface was verified after the hosted path was removed. Details in the v4 section below; the v2 core record that follows is unchanged.

September 30, 2026. **v2.0 core release.** This records implementation verification; it is not financial assurance or a live source refresh. The public market seed is unchanged from the generic baseline. No real issuer relationship or commercial acceptance is inferred.

## Acceptance results

| Core acceptance case               | Implemented and verified                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent profile states         | Create/edit/switch two profiles; intended settings; explicit real-mode confirmation; no inherited local notes/reviews or verified relationships                                     |
| Honest manual checks               | Unchanged and unreachable records preserve publication/claim/review basis; source cadence separate; unresolved coverage visible                                                     |
| Exact revision impact              | Before/after preview; only dependent assumptions/decisions flagged; source-check and revision atomic; unknown/withdrawn claims retain history and block endorsement                 |
| Reasoned, revision-bound decisions | Required reasoning, selected assumption review, exact revision references, stale/overdue decisions, prior assessments retained and full export/import/reload                        |
| Responsive resilient loop          | Desktop/mobile editors, Escape, search/filter/detail/comparison, validation/errors, draft recovery, repeated saves, two-tab conflict/rebase, migration, backups and storage failure |

`npm run validate` passes seed/reference/provenance validation and workspace replay. **29 model tests pass. 46 Chromium browser tests pass: 23 at 1440 × 1000 and 23 at 390 × 844.** Source/document links render their exact expected targets. Page/dialog overflow checks pass; the four principal views report no JavaScript errors. Runtime workflows make no third-party collection/submission request. Fonts are local system fonts.

Model coverage includes valid and malformed seed records, provenance, HTTPS/date/reference errors, explicit dependencies, profile isolation, source-check semantics, atomic operations, stale revision/head rejection, repeated-operation idempotency, decision basis, withdrawal, legacy preservation, full-history replay, tampered/truncated/divergent imports, deadlines and reverting text without silently revalidating a review.

Browser coverage includes all original search/filter/detail/comparison features and the whole v2 maintenance loop. It exercises new source/evidence creation with mandatory assumption links, exact impact preview, genuine event inspection, stale decisions, blocked endorsement and dependency revision, interrupted drafts, repeated clicks, competing tabs and explicit rebase, malformed imports, v1 migration retaining exact notes/activity, reset/recovery restore, invalid-cache raw download, corruption during editing and quota-failure export of coherent in-memory work. Asynchronous saves/imports are checked after confirmation.

The build is validated independently. A smoke script serves `dist/` on a temporary local port, checks both viewport sizes and all four views, revises evidence through preview/commit, verifies reload persistence and records console errors/overflow. Packaging compares every archive member with `dist/` and repository bytes. Generated results are in `artifacts/browser-results.json`, `artifacts/build-smoke.json` and `artifacts/content-audit.json`; screenshots cover views, profiles, revision preview and history. Screenshots are rendered from the actual app, not fabricated or edited mockups.

## Evidence coverage and limitations

The deployment-configuration follow-up reran all 29 model tests, all 46 desktop/mobile browser tests, the validated build, byte-identical packaging and desktop/mobile build smoke checks. Static configuration selects Vercel's documented Other preset and `dist/` output without application changes. Vercel publication remains blocked: its connected deployment action is unavailable, CLI authentication is absent and CLI login cannot reach authorization from this environment. No hosted URL, successful Vercel build or live browser verification is inferred from local results. See [deployment status](DEPLOYMENT.md).

The seed contains ten organizations, ten primary sources, ten public-market evidence records, three synthetic records, six assumptions, three synthetic priorities/decisions and two genuine baseline/update entries. V2 records its schema/workflow release without inventing a monitored market change. Sources keep their original real product names/titles/URLs and null dates for undated pages. Fictional relationships have no relationship-evidence lineage; real-mode settings display unverified status.

The ten original pages were reviewed through the web research tool on the baseline date. A fresh `npm run check:links` attempt during v2 verification returned **ten `fetch failed` responses with no HTTP status; exit 2**. `artifacts/source-links.json` preserves the exact client outcomes. Browser target validation does not turn those failures into successful reachability or a new research review. Manual collection remains the supported method.

The content audit scans current tracked/new files, built files, unpacked ZIP and screenshot OCR. Current former subject/issuer/personal framing has zero findings. Git history is excluded: earlier commits retain prior content, with no force push, rewriting or deletion. Generic v1 storage remains preserved; earlier issuer-specific storage stays isolated.

Only Chromium was exercised; Safari/Firefox and screen-reader sessions remain untested. Web Locks serialize cooperating tabs where available; unsupported browsers have best-effort conflict detection and can race under exact simultaneous writes. The audit trail is local and unsigned, with unauthenticated reviewer labels and FNV change detectors. Imports/history have size caps. Exports exclude drafts/recovery copies and are the manual backup mechanism. No shared database, cloud sync, automatic collector, weighted ranking, AI chat, schedules, credentials, paid service, hosted deployment or outreach is included.

No current token issuance, adoption, reserves, live quotes/pools, real account eligibility, production rollout or private terms were verified. The next practical check is two manual review cycles on one selected use case before choosing a prioritization rubric or collection gate.

## v4 source review verification (October 2, 2026)

| Acceptance case | Result |
| --- | --- |
| No account, database or credentials | Verified by removal: `server/auth.mjs`, `server/config.mjs`, the Supabase store and `db/001-pilot.sql` no longer exist. `npm ci && npm run build` succeeds with an empty environment, and no shipped runtime file reads `process.env`. |
| Research desk unchanged | `diff` of `src/app.js` against the v2 file is exactly two lines: the added footer link to `review.html`, and a method-panel documentation link retargeted from the deleted `V2_PLAN.md` to `V4_REVIEW.md`. No desk behaviour changed. |
| Bounded, single-URL check | `api/check.js` holds no state and reads no environment variables. `?url=` is rejected with 400 and a non-JSON body with 415. Redirects are not followed, the response is capped at 1 MB and extracted text at 20,000 characters. |
| Review loop integrity | First capture is a baseline; identical capture is `unchanged`; a changed capture stages one candidate with both hashes; unreachable stays unresolved with a null hash. |
| Human decision required | An unchanged statement is refused, only `company_claim` or `analyst_inference` is accepted, rationale has a minimum length, and a stale candidate hash blocks acceptance. |
| No automatic endorsement | An accepted revision commits exactly one evidence event; affected assumptions report "Needs assumption review"; no decision status is changed by it. |
| Honest failure modes | Operation idempotency, opId reuse with changed intent, stale expected version, tampered journal continuity, inconsistent check history and the 60-operation bound are all refused. |
| Local persistence | Browser-local store keeps immutable prior copies, refuses a stale-version overwrite, preserves a corrupt or foreign value rather than overwriting it, and enforces the 4 MB and 20-copy bounds. Commits are serialized with the Web Locks API, matching the v2 desk, so two tabs cannot both pass the version check and silently discard one write. |
| Synchronous hashing | `src/sha256.js` was compared against `node:crypto` `createHash` over published vectors, all SHA-256 block-boundary lengths (55/56/63/64/65 bytes), multi-byte UTF-8 and 3,000 random strings, with no mismatch. |
| Weekly brief | Renders real check and review events with the source URL, SHA-256, adopted head, affected record IDs and the fictional-STABLE disclosure. A variable-scoping defect carried in from v3, where a journal event was read as if it were the review state, was found and fixed during this port. |

`npm run validate` passes. **56 model tests pass (29 v2, 27 v4).** **66 Chromium browser tests pass, 33 desktop at 1440 x 1000 and 33 mobile at 390 x 844**: the original 46 v2 cases unchanged, plus 18 new review-surface cases covering no-account startup, desk-to-review linking, baseline then candidate staging, adoption, unchanged-claim refusal, rejection, reload persistence, export, the weekly brief and an unreachable check. Build smoke passes on both viewports, including that the review surface opens with no sign-in form and no logout control. Packaging compared 24 archive members byte-identically with `dist/`, and the content audit reported **zero findings** across 70 current files, 24 build files, 24 ZIP members and 20 screenshot OCR scans.

An independent pre-merge review was run against this release. It returned FAIL on a mid-flight snapshot and raised four real findings. All four were reproduced and fixed rather than waved away, and the verification record was corrected where it overstated what had been proven.

| Reviewer finding | Outcome |
| --- | --- |
| Mobile horizontal overflow introduced by the added footer link (13px at 390px, breaking a pre-existing mobile compare test) | Reproduced and fixed. The footer row now wraps; overflow confirmed absent at 390px and 360px. The 320px overflow it also reported is pre-existing on the v2 commit and outside this change. |
| `docs/V2_PLAN.md` deleted while `tests/desk.spec.js` and the desk's own help dialog still linked to it | Reproduced and fixed. The dialog link now targets `V4_REVIEW.md` and the doc test asserts the v4 documents. |
| The 4 MB bound was charged to the sum of all archived copies, not to live state, so a realistic run died at operation 15 of 60 with live state at 0.54 MB and no way forward | Reproduced: it failed at op 15 of the documented 60. Fixed. The bound now applies to live state and to each copy separately, with a 3 MB retention budget that evicts older copies rather than refusing new work. The same workload now reaches the documented 60-operation bound. |
| `clear()` existed but no UI could reach it, and the "exactly one line" `app.js` claim became false once the method-panel link was retargeted | Both fixed. An explicit two-step reset downloads the current state first and requires confirmation, and the `app.js` claim now states two lines. |

Two defects were found and fixed during this port rather than shipped. First, a v3 variable-scoping bug in the weekly brief, which read a journal event as if it were the review state, would have thrown on any accepted review. Second, the footer link added to the desk caused 13px of horizontal overflow at 390px, which shifted a sticky element over a compare checkbox and broke a pre-existing mobile test; the footer row now wraps, and horizontal overflow was confirmed absent at 390px and 360px. A stale `docs/V2_PLAN.md` link inside the desk's own help dialog was also corrected to the v4 review document.

Limits: Safari and Firefox remain untested. The desk overflows horizontally at 320px, which is a pre-existing v2 condition reproduced identically on the v2 commit and outside this change. Browser-local storage is still not a backup, and there is still no cross-device synchronization. No hosted deployment of v4 has been performed or verified from this environment.
