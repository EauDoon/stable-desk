# Stable Desk verification record

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
