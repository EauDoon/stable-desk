# Stable Desk architecture and coverage

The default local desk retains v2's static ES-module architecture: semantic HTML, responsive CSS, browser-local data and a local Node preview server. That mode has no backend/account/database dependency or AI endpoint and makes no third-party collection request. v4 adds a separate source-review surface with one stateless fetch function and browser-local state; read [its architecture and evidence boundaries](V4_REVIEW.md). It has no account, database or credential dependency. System fonts remain local.

| File | Responsibility |
| --- | --- |
| `src/model.js` | Seed/reference/provenance validation, organization filters and retained v1 compatibility helpers |
| `src/workspace.js` | v2 commands, immutable events, strict replay, profiles, exact dependencies, freshness, decision basis, migration, import/export, the shared 4 MiB import and save limit, and ID generation with a non-secure-origin fallback |
| `src/archive-store.js` | Desk recovery copies under `stable-desk:archive:`: newest-first listing, quota eviction of the oldest copies only, retention bounds and single-copy deletion |
| `src/workflow-ui.js` | Scoped manual editor forms, assumption cards, revision previews and history markup |
| `src/app.js` | Four views, native dialogs, escaped rendering, drafts, browser persistence, locks, conflict/rebase, recovery and focus on view change |
| `src/version.js` | The application version, mirroring `package.json` for the no-bundler static site |
| `src/styles.css` | Responsive visual system; no external fonts |
| `src/review-model.js` | v4 versioned review state, hash-chained journal, bounded collection outcomes, candidate staging, idempotency and the weekly brief with inert reviewer text |
| `src/review-store.js` | Browser-local review persistence with immutable prior copies and explicit-only replacement |
| `src/index-review.js` | The single import surface for the review page: the review model, its store and the workspace functions it needs |
| `src/sha256.js` | Synchronous SHA-256 so the model hashes identically in the browser and in Node tests |
| `src/review.js` | Review inbox, source diff, acceptance form, brief, backup and recovery downloads, and focus restoration across re-renders |
| `src/review.css` | Source-review layout on top of the desk styles |
| `src/review-client.js` | The single network call: bounded source fetch |
| `server/api.mjs` | Stateless same-origin check endpoint; refuses browser cross-site requests (by `Sec-Fetch-Site`, or an `Origin` that matches neither `Host` nor `X-Forwarded-Host`), caller-supplied URLs and non-JSON bodies |
| `server/http.mjs` | Node adapter shared by the hosted function and the local server; always answers JSON with no-store and nosniff headers, including for a malformed body |
| `server/collector.mjs` | Bounded extraction of one allowlisted page: no redirects, 8s timeout, 1 MB response, 20k text cap; unread bodies are released |
| `api/check.js` | Serverless entry for the check endpoint; no state, no environment variables |
| `data/baseline.json` | Schema-v2 fictional seed with original public context and six stable assumptions |
| `vercel.json` | Vercel build settings and the single source of the security headers (Content-Security-Policy, framing, referrer, permissions) |
| `scripts/build.mjs` | Validates the seed and replay, then copies the app, data, docs, `CHANGELOG.md` and `LICENSE` into `dist/` |
| `scripts/validate.mjs` | Seed validation and workspace replay (`npm run validate`) |
| `scripts/package.py` | Byte-compared ZIP of `dist/` |
| `scripts/audit-content.py` | Content audit of current files, the build and the ZIP against guarded terms read from a local file outside the repository |
| `scripts/check-links.mjs` | Unauthenticated public GET of each source; reports to ignored `test-results/` |
| `scripts/check-version.mjs` | Agreement of `package.json`, the lockfile, `src/version.js`, `CHANGELOG.md` and a release tag, and no stray version literals |
| `scripts/release-notes.mjs` | One version's `CHANGELOG.md` section as release notes |
| `scripts/server.mjs` | Dev and preview server with strict arguments, the same check endpoint behind a stricter loopback origin guard, and the `vercel.json` headers |
| `scripts/smoke.mjs` | Build smoke against `dist/` on both viewports, failing on JavaScript errors and policy violations |

The build validates the seed and replay, then copies app/data/docs, the changelog and the license to `dist/`. Packaging compares every ZIP member with the build and its repository source. The dev server is a preview utility, not a production service.

The hosted site and the local server send the same security headers from `vercel.json`: a Content-Security-Policy of `default-src 'self'` with no inline script or style, `object-src 'none'`, `base-uri 'none'` and `frame-ancestors 'none'`, plus nosniff, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy` and `X-Frame-Options: DENY`. The app sets its only dynamic style (the compare grid's column count) through CSSOM, which the policy does not govern. The check endpoint's cross-site refusal lives in `server/api.mjs`, so the hosted function and the local server share it; the local server also keeps its exact loopback origin check.

v4.1 keeps the same dependencies and storage formats. `reviewQueue` in `src/workspace.js` derives active-profile work from the existing freshness, assumption and decision rules. It orders coverage/evidence blockers, changed bases, then chronological deadlines, with stable kind/ID tie breaks. It includes work due today in UTC and does not duplicate decision warnings inherited only from assumptions. The Evidence view filters these rows and routes to the existing manual editors; nothing is collected, scored or endorsed by the queue.

## Data and lineage

| Record       | Meaning                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile      | Stable ID, fictional or explicitly enabled real research mode, name/ticker, optional issuer subject and intended currency/markets/networks/use case/constraints. Unknown values remain explicit.          |
| Source       | Original public HTTPS URL, title, publisher, publication/event/access dates, location and caveats. Checks do not rewrite publication dates.                                                               |
| Evidence     | Public market fact/company claim/inference, or synthetic example; original source IDs, scope, as-of date, organizations and active/unknown/withdrawn status. Context-only citations never prove demo fit. |
| Assumption   | Stable ID, priority ID, statement, exact evidence IDs and reviewed dependency snapshot. No newly linked evidence is silently endorsed.                                                                    |
| Decision     | Research status, owner, notes, review date and recorded basis for every linked assumption: fingerprint, assumption revision, evidence revisions and review event ID.                                      |
| Event        | ID, operation ID/intent, sequence/previous-event ID, actual timestamp, profile/record IDs, reviewer label, rationale, expected revision and complete before/after values.                                 |
| Source check | Unchanged/revised/unreachable outcome, actual checked date, source-specific cadence, note, reviewer and linked revision IDs when content changed.                                                         |

The seed contains ten organizations, ten primary sources, ten public-market evidence records, three synthetic evidence examples, six assumptions, three synthetic priorities/decisions and two genuine repository baseline/update entries. V2's second entry records the workflow/schema release; public source content is unchanged. Most product/docs pages are undated, with null publication dates. The April 2025 Mastercard and September 2023 Visa announcements keep their historical dates. Coverage is limited and manually maintained.

Company-to-company relationships remain original public context, including PayPal/Paxos and network announcement participants. The seed has no fictional issuer relationships. Real-mode configuration displays issuer relationships as unverified, with no automatic fact conversion. Protocol documentation does not establish bilateral relationships or adoption.

## Replay and impact

A workspace holds an immutable seed hash, identity, active profile preference and append-only events. The visible state is replayed, not separately mutable assessment objects. Profiles start with shared seed context but independent local claim revisions, checks, reviews and decisions. A new profile inherits no local endorsement or notes.

Commands validate expected workspace head and record revision, then construct and validate the entire next snapshot before storage. Claim revision plus its source check, new evidence plus dependency changes, and assumption reviews plus a decision are atomic operations. Retries use operation IDs and reject changed intent; repeated identical commits do not duplicate history. Replay validates sequence, timestamps, before values, references, classification, operation grouping and review basis. A new-evidence operation must include an actual assumption dependency update.

An assumption fingerprint includes its profile, statement/dependencies, current evidence values/revisions and original source values/revisions. Check metadata is excluded. Unchanged checks refresh source freshness without clearing claim/assumption warnings. Unreachable checks show unresolved coverage without inventing a changed claim. Unknown/withdrawn dependencies block endorsement. A later relevant change flags a recorded decision stale while retaining its prior basis. Overdue source checks and overdue assumption reviews are separate UTC date comparisons.

Fingerprints use deterministic FNV change detection. They are consistency aids, not cryptographic authenticity or signatures. An informed actor can rewrite a local export coherently. Reviewer labels are not authenticated identities. This is a local auditable record, not a tamper-proof multi-user system.

## Persistence and compatibility

`stable-desk:v2` stores a complete validated export in one localStorage write. `stable-desk:drafts-v2` separately retains interrupted form values, operation ID and editing basis. Drafts are not committed history or part of workspace exports. A stale draft needs explicit rebase and another preview. Rebase preserves its original workspace/profile, reads that profile's latest revisions, and refuses a replacement workspace before changing the editing context.

The direct source-review handoff reads and validates the complete `stable-desk:review` record through `reviewStore.read()`, then offers only its adopted `desk` snapshot to the existing import preview. Choosing it invalidates older asynchronous file reads and clears earlier candidates before validation. Import previews retain their desk workspace ID/head; confirmation rechecks those inside the write lock as well as the saved-disk conflict guard. Same-tab edits cannot make an older preview safe to apply. Source review remains untouched, and its later edits require a new explicit import.

Cooperating tabs serialize writes through Web Locks where available and compare saved workspace identity/head before committing. Storage events warn other tabs; conflicts retain the draft. Without Web Locks, conflict checks are best effort and an exact simultaneous race is possible. Cross-device collaboration and hostile/non-cooperating writers are unsupported.

Write failure leaves coherent in-memory state and a persistent warning to export before reload. Replacement/reset requires successful recovery-copy storage before replacing the saved workspace. When the origin quota is full, the oldest recovery copies are evicted first, never the live workspace, drafts, legacy or review keys; if the replacement still cannot fit, nothing is replaced. After a successful replacement the newest copy is always kept, then older copies while there are at most ten within 2 MiB of UTF-16 storage, and each copy can be deleted with a confirming second click. Recovery copies preserve prior JSON; raw malformed caches can be downloaded, then explicitly archived/reset. Validated same-identity imports accept a matching history prefix/continuation and reject divergent branches; other workspaces open after archiving the current saved copy. Older imports cannot discard newer committed history.

Generic v1 storage and exports migrate with exact notes/status/review stamps/original activity in a `legacy_import` event. Old keys remain untouched. Legacy reviews require new explicit dependency review; the migration does not invent approvals. Issuer-specific legacy content is not parsed or loaded. Raw generic baselines are accepted as separate workspaces. Every import and the saved workspace share one 4 MiB limit, and history is capped at 5,000 events. A change that would make the saved workspace exceed the limit is refused before it is written, so the desk can always reopen what it saved; archive reviewed public baselines before large long-term histories.

No cloud sync, automatic backup, encryption, authentication, live source check, scheduled monitoring, scoring engine or autonomous outreach exists. Browser updates do not modify Git files. Keep notes public-information-only. Earlier Git commits retain prior content; current deliverables are scrubbed without rewriting history.
