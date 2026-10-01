# Stable Desk v4 source review

October 2, 2026. v4 is a public, self-contained release. It keeps the v2 research desk unchanged and adds the source-review loop that was developed on the `v3-pilot` branch, with **no account, no hosted database and no credentials of any kind**. Everything runs from `dist/` plus one stateless fetch function.

## What v4 is

One watched public page, dated snapshots, and an explicit human decision before any claim changes. The selected page is [Stripe stablecoin payments](https://docs.stripe.com/payments/stablecoin-payments), original source `S-G02`, public-market evidence `E-G02`. It exercises distribution eligibility and an existing dependency (`A-P-G01-2`) without treating the fictional asset as accepted. Generic Stablecoin (STABLE) remains fictional; the example opportunities and issuer relationships keep their synthetic and unverified status.

## The review loop

1. Open `review.html` and start from the public baseline, or import a v2 export. Import always shows a preview and requires an explicit confirm; a backup of the original is downloadable first.
2. Trigger **Check source now**. The first successful capture establishes a dated monitoring baseline. It does not endorse anything.
3. Later unchanged captures record a check only. A changed capture stages one review candidate holding the before/after text, both SHA-256 hashes, the original URL, the two fetch dates and the currently adopted claim.
4. A reviewer writes the replacement claim, chooses a supported classification, and records a rationale. Or they reject the difference. The candidate is a suggested source revision, never an AI-written claim.
5. Acceptance commits exactly one v2 evidence revision through the existing replay, provenance and conflict guards. Affected assumptions become **needing review**; decisions keep their old basis and are never automatically endorsed.
6. Download the seven-day UTC change brief, the full review backup, the recovery manifest, or a prior committed recovery copy.

## What changed from v3, and why

v3 was correct and fully tested, but undeployable: `api/desk.js` returned 503 unless `SUPABASE_URL`, publishable/secret keys and `PILOT_OWNER_ID` existed, and no such project was ever provisioned. A public release cannot depend on an account that does not exist.

| v3 | v4 |
| --- | --- |
| Supabase Auth + Postgres, gated on provisioning | None. Review state is browser-local `localStorage`. |
| Sign-in, session cookie, owner allowlist | None. There is no identity to verify. |
| Server-authoritative capture and reviewer metadata | Capture is the only server call; reviewer label is an ordinary local research field, labelled as unauthenticated. |
| Cross-device shared workspace | Gone. Export/import is the cross-device path, the same as the v2 desk. |
| `v3-pilot` branch preserved | Yes, unchanged, as the record of the hosted design. |

Kept deliberately: the versioned pilot state machine (`src/review-model.js`), the hash-chained journal, the idempotency and CAS guards, the bounded extraction, the review inbox and the weekly brief. Dropped: `server/auth.mjs`, `server/config.mjs`, the Supabase store, `db/001-pilot.sql`, sign-in UI, and the whole shared-mode branch of `src/app.js`. `src/app.js` differs from v2 in exactly two lines: the added footer link to `review.html`, and a retarget of the method panel's documentation link from the deleted `V2_PLAN.md` to this document. No desk behaviour changed.

## Storage, honestly

Review state lives in this browser under `stable-desk:review`, with up to 20 prior committed copies under `stable-desk:review-history`. This is the same operating model as the v2 desk and it carries the same limitation: **local storage is not a backup.** Export after useful work and before switching devices or clearing browser data. A corrupt or foreign value is preserved rather than overwritten. The 4 MB state and 60-operation bounds fail safely and require export; nothing is deleted automatically.

Cross-device work requires an explicit export and import. There is no synchronization, no shared account and no collaborative review. Original v2 browser keys are untouched by any v4 action.

## The one server function

`api/check.js` is stateless. It fetches exactly the one allowlisted URL with no redirect following, an 8-second timeout, a 1 MB response cap and a 20,000-character meaningful-text bound, then returns bounded text. It holds no state, accepts no credentials, ignores the request body and refuses a caller-supplied `url` parameter, so it is not a general-purpose proxy. The browser decides what to keep, hashes it and validates it against the same model the tests use.

It exists only because a browser cannot read `docs.stripe.com` cross-origin. The local dev and preview server exposes the same endpoint so the flow is testable without a deployment.

## Evidence boundaries that did not change

A monitored page is a company claim or an analyst inference. A single source never independently verifies facts. Publication dates, fetch dates and adopted evidence dates are separate. An unreachable page is unresolved, not a change. Page churn can be irrelevant to a claim, and a human decides that. Token supply, aggregate transfers, card tender and merchant settlement are different measures. No adoption inference or commercial score is drawn from any of them.

## Not included

No automatic collection, schedule, outbound delivery, notifications, AI extraction, weighted ranking, private data ingestion, messaging, payments or subscriptions. No hosted database, account or credential. Production rollout of any hosted variant needs separate approval and its own acceptance record; the `v3-pilot` branch documents that design.
