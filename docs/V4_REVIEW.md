# Stable Desk v4 source review

02-10-2026. v4 is public, self-contained source; hosted acceptance remains unverified. It keeps the v2 research desk unchanged and adds the source-review loop that was developed on the `v3-pilot` branch, with **no account, no hosted database and no credentials of any kind**. Everything runs from `dist/` plus one stateless fetch function.

## What v4 is

One watched public page, dated snapshots, and an explicit human decision before any claim changes. The selected page is [Stripe stablecoin payments](https://docs.stripe.com/payments/stablecoin-payments), original source `S-G02`, public-market evidence `E-G02`. It exercises distribution eligibility and an existing dependency (`A-P-G01-2`) without treating the fictional asset as accepted. Generic Stablecoin (STABLE) remains fictional; the example opportunities and issuer relationships keep their synthetic and unverified status.

## The review loop

1. Open `review.html` and start from the public baseline, or import a v2 export. Import always shows a preview and requires an explicit confirm; a backup of the original is downloadable first.
2. Trigger **Check source now**. The first successful capture establishes a dated monitoring baseline. It does not endorse anything.
3. Later unchanged captures record a check only. A changed capture stages one review candidate holding the before/after text, both SHA-256 hashes, the original URL, the two fetch dates and the currently adopted claim.
4. A reviewer writes the replacement claim, chooses a supported classification, and records a rationale. Or they reject the difference. The candidate is a suggested source revision, never an AI-written claim.
5. Acceptance commits exactly one v2 evidence revision through the existing replay, provenance and conflict guards. Affected assumptions become **needing review**; decisions keep their old basis and are never automatically endorsed.
6. Export the full review backup. On another browser, choose **Restore v4 review backup**, inspect the preview, download the pre-restore backup and confirm. Older or divergent histories require an explicit reset after export.
7. In the same browser, open **Research desk > Workspace backup and import > Preview adopted source review**, inspect the snapshot, then confirm **Use in this browser**. For another browser, choose **Export adopted workspace** and import that v2 file in the desk. Review affected assumptions and Decisions in the Evidence review queue. The two stores are separate, pending candidates are excluded, and this explicit handoff does not synchronize future edits.
8. Download the seven-day UTC change brief, recovery manifest or a prior committed recovery copy. Restore a recovery copy through the same validated v4 file preview.

## What changed from v3, and why

v3 was correct and fully tested, but undeployable: `api/desk.js` returned 503 unless `SUPABASE_URL`, publishable/secret keys and `PILOT_OWNER_ID` existed, and no such project was ever provisioned. A public release cannot depend on an account that does not exist.

| v3 | v4 |
| --- | --- |
| Supabase Auth + Postgres, gated on provisioning | None. Review state is browser-local `localStorage`. |
| Sign-in, session cookie, owner allowlist | None. There is no identity to verify. |
| Server-authoritative capture and reviewer metadata | Capture is the only server call; reviewer label is an ordinary local research field, labelled as unauthenticated. |
| Cross-device shared workspace | Gone. Export/import is the cross-device path, the same as the v2 desk. |
| `v3-pilot` branch preserved | Yes, unchanged, as the record of the hosted design. |

Kept deliberately: the versioned pilot state machine (`src/review-model.js`), the hash-chained journal, the idempotency and CAS guards, the bounded extraction, the review inbox and the weekly brief. Dropped: `server/auth.mjs`, `server/config.mjs`, the Supabase store, `db/001-pilot.sql`, sign-in UI, and the whole shared-mode branch of `src/app.js`. The desk links to source review and its contract. The classification label is now "Documented fact" to clarify that source contents, not product performance, were verified. The stored classification identifier is unchanged.

## Storage, honestly

Review state lives in this browser under `stable-desk:review`, with up to 20 prior committed copies under `stable-desk:review-history`. This is the same operating model as the v2 desk and it carries the same limitation: **local storage is not a backup.** Export after useful work and before switching devices or clearing browser data. A corrupt, foreign or empty saved value blocks initialization and restoration. **Download raw review** preserves its exact bytes; only a subsequent explicit, unchanged-record confirmation discards it. Reset first checks that the loaded review still matches storage, downloads it, then checks the exact saved bytes again under the write lock before clearing. Reset retains available recovery history.

The live state is limited to 4 MB and 60 operations. Recovery history retains at most 20 copies under a 3 MB encoded budget, and older copies may be evicted automatically to fit the origin quota. Browser storage can count UTF-16 bytes and includes the separate v2 desk. These bounds do not promise that 60 maximum-size operations fit every browser. If a live save cannot fit after evicting copies, the last durable state remains intact; export it, free space and retry. Review form drafts remain in the current tab, not in the exported saved review. Failed archive writes never turn a successful live save into a reported failure.

Web Locks serialize cooperating tabs where supported. The fallback runs each queued operation once within a tab; exact simultaneous writes across unsupported tabs can still race. Avoid simultaneous writers there.

Cross-device work requires an explicit export and import. There is no synchronization, no shared account and no collaborative review. Original v2 browser keys are untouched by any v4 action.

## The one server function

`api/check.js` stores no research records. It fetches exactly the one allowlisted URL with no redirect following, an 8-second timeout, a 1 MB response cap and a 20,000-character meaningful-text bound, then returns bounded text. Both hosted and local entrypoints allow GET and JSON POST only, cap POST bodies at 16 KB while streaming, preserve JSON/no-store/nosniff response headers, ignore body values and refuse a caller-supplied `url` parameter, so it is not a general-purpose proxy. The browser decides what to keep, hashes it and validates it against the same model the tests use.

A warm process permits only one upstream check at a time and one start per 30 seconds. Repeated requests receive 429 with Retry-After. Cold starts and other instances have separate budgets; this is not a distributed rate limit or an edge cost cap.

It exists only because a browser cannot read `docs.stripe.com` cross-origin. The local dev and preview server exposes the same endpoint so the flow is testable without a deployment.

## Evidence boundaries that did not change

A monitored page is a company claim or an analyst inference. A single source never independently verifies facts. Publication dates, fetch dates and adopted evidence dates are separate. An unreachable page is unresolved, not a change. Page churn can be irrelevant to a claim, and a human decides that. Token supply, aggregate transfers, card tender and merchant settlement are different measures. No adoption inference or commercial score is drawn from any of them.

## Not included

No automatic collection, schedule, outbound delivery, notifications, AI extraction, weighted ranking, private data ingestion, messaging, payments or subscriptions. No hosted database, account or credential. Production rollout of any hosted variant needs separate approval and its own acceptance record; the `v3-pilot` branch documents that design.
