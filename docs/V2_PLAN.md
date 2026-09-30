# Stable Desk v2 plan

Proposal dated September 30, 2026. This is a plan, not implemented v2 functionality. The current release is v1.1: a working static generic demo with versioned JSON, evidence lineage, local assessments and manual import/export.

Build **a manual evidence revision and assumption-review workflow next**, beginning with a configurable profile. This closes the largest current gap: researchers must edit JSON externally and see a broad fingerprint warning rather than the exact change and affected assumption. Reliable review is more useful at this stage than an automated collector or another chart.

## What the repository already supports

Search/filter/detail/comparison flows, dated source/evidence records, genuine local history, review deadlines, dependency-change warnings and validated workspace backups all work. Profile labels now come from a fictional seed profile; validation separates public market records from synthetic examples. There is no backend, sync, field-level impact map, source freshness queue, production issuer configuration, scoring engine or automatic collection. Keep the vanilla ES-module architecture for the next slice.

## Phase 1 — one maintained research loop

Deliver one vertical slice: configure profile → review a source → preview evidence change → inspect affected assumption → record a reasoned decision → export/reload the full audit trail. Start with the generic fictional profile and manual actions.

- Add a profile editor for name, ticker, reference currency, intended markets/networks, use case and explicitly unknown constraints. Distinguish fictional demo from a real researched profile; real-mode enablement requires deliberate confirmation and no automatic conversion of demo relationships. Profile IDs scope assessments and history. This extends today's JSON-only placeholder configuration.
- Add source-check and evidence-revision forms. Store checked-at, original publication/event dates, check outcome, review cadence, reviewer label and short scope-qualified evidence. Separate “checked unchanged” from “content revised” and “unreachable.” No browser fetch is presented as a successful research review.
- Add stable assumption IDs and explicit evidence-to-assumption dependencies. Preview changed fields and affected assumptions before committing a local revision. Facts becoming unknown or claims being withdrawn invalidate their dependent conclusions; new evidence requires review rather than silently raising confidence.
- Store append-only local revision/review events with record/profile IDs, old/new values, actual time, rationale and reviewed revision. Export contains the dataset, revisions and decisions; import validates their links. This is an auditable local record, not a tamper-proof multi-user system.

Acceptance tests:

1. Configure two profiles; changing one cannot inherit another's relationships, notes or reviewed assumptions. No fictional relationship can become “verified” through a name or mode change.
2. Check an old source unchanged: record the check, preserve publication date and claim revision, update freshness, and keep the reviewed assumption valid. A failed check shows unavailable coverage, not a changed claim or zero activity.
3. Revise one linked claim: preview old/new text, exact dependent assumptions and decisions; unrelated assumptions remain valid. A withdrawal leaves the original revision inspectable and flags its dependents.
4. Save a decision against a specific revision: require reasoning, retain the prior review and flag it again on a later relevant change. Export/import/reload preserves all events and dates.
5. Exercise the whole loop at 1440 px and 390 px, including keyboard dismissal, empty states, validation errors and browser-storage failure. No background or third-party data submission occurs.

Dependencies and costs: existing Node/Playwright development tooling; no new runtime package, paid API, credentials or hosting needed. Choose a versioned schema extension and migration for current generic exports. A named maintainer must select the first use case and review cadence. Estimate only after those choices; do not commission a collector as part of this phase.

## Phase 2 — a small transparent prioritization queue

After Phase 1 works, add a source freshness queue and a comparison worksheet for three to ten proposals. Freshness uses explicit source-specific due dates and outcomes, separately from content-change and assumption-review state. A fresh source alone cannot make a stale conclusion valid.

Show four ordinal inputs: evidenced unmet need, incremental distribution/settlement benefit, eligibility/readiness and research effort. Each needs a short rationale, linked evidence and an explicit unknown value. Display completeness and blockers beside any score. No missing input becomes zero, no opaque generated ranking, and no supply-growth proxy for payment adoption. Start with an explainable matrix; enable a weighted score only if the maintainer chooses weights and tradeoffs. The fictional examples must remain excluded from real commercial rankings.

Acceptance tests: changing an input shows which evidence and rationale changed; unknown/readiness blockers remain visible; identical inputs yield the same result; weight changes preserve prior ranking versions; old/failed source checks surface in the queue without inventing content changes. Manual sort/override requires a reason and preserves the computed order.

Dependencies and costs: completed revision/assumption schema and a maintainer-approved rubric; no external services. Validate with a small reviewed dataset before broadening coverage.

## Phase 3 — decide whether collection is worth adding

Evaluate collection only after two real manual refresh cycles reveal missed updates or repetitive work. Start with a reviewed public-source allowlist and a manually invoked read-only fetch that stages candidate changes. Persist actual fetch/check outcomes and compare meaningful source content; a candidate never auto-edits evidence, relationship status, confidence or decisions. Restricted pages stay unresolved. Scheduled collection, if later commissioned, needs an explicitly approved cadence, execution environment and maintainer for failures.

Acceptance tests: unchanged content generates a check event only; changed content becomes a review candidate; 403/429/timeouts create unresolved checks; irrelevant page chrome does not invalidate assumptions; every accepted candidate retains the original source and reviewer decision. No messages, payments, subscriptions or automatic recommendation endorsement.

Dependencies/permissions/costs: verify source access, public-source terms and executor networking first; any new service, secret, paid API, hosting or recurring schedule needs separate authorization and a concrete operating cost. Current network limits mean collection feasibility remains unproven. Shared editing/authentication/database work is deferred until more than one active reviewer actually needs it.

## Decisions needed before implementing v2

| Decision              | Recommended default                                            | Why it matters                                                |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| First user/use case   | One researcher maintaining one generic profile                 | Keeps Phase 1 testable without multi-user infrastructure      |
| Profile scope         | Remain fictional until a real issuer is deliberately specified | Prevents synthetic assumptions becoming commercial facts      |
| Review responsibility | Explicit reviewer label and a chosen source cadence            | Makes checks accountable and due dates meaningful             |
| Storage/delivery      | Local workspace export plus reviewed Git dataset               | Already available; public repository accepts public data only |
| Prioritization        | Evidence/rationale matrix before weighted ranking              | Makes uncertainty visible while the rubric is untested        |
| Collection            | Manual review first; evaluate after two cycles                 | Avoids calling an unproven fetcher “monitoring”               |

The next authorized build should cover Phase 1 only. Phase 2 depends on its reliable revisions and actual review use; Phase 3 is an optional decision gate. This keeps v2 centered on maintained evidence and justified decisions rather than a feature list.
