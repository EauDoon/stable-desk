# Stable Desk v2 plan

Release scope dated September 30, 2026. **Phase 1 is implemented in v2.0**; Phases 2 and 3 remain gated proposals. The release stays a static manual desk, with no paid service or runtime dependency.

## Delivered core — one maintained research loop

Configure profile → record a manual source check → preview claim change and exact impact → review affected assumptions → record a reasoned decision → export/reload its complete revision history.

- Independent configurable profile states, intended settings and explicit unknowns. Real-mode enablement needs deliberate confirmation; demo examples and relationships are never converted into facts.
- Unchanged/revised/unreachable manual checks with separate freshness dates. Original publication/event dates are preserved. New source and evidence forms retain provenance and explicit dependencies.
- Six stable seed assumption IDs, exact dependencies, field-level claim previews, unknown/withdrawn states and affected decision flags.
- Append-only reviewer/rationale/before-after events, revision-bound decisions, strict replay/import validation, v1 compatibility, drafts, explicit rebase and recovery copies.

The five Phase 1 acceptance cases are implemented and exercised by model and desktop/mobile browser tests: profile isolation; unchanged/failed check semantics; exact revision/withdrawal impact; reasoned revision-bound decisions and round trips; responsive flows/errors/recovery. See [verification](VERIFICATION.md) for actual results and limits.

Costs/dependencies: existing Node/Playwright/Python tooling; no new runtime package, API, credentials or hosting. Browser-local storage remains the operating model; export after useful work. A maintainer still needs to select one use case and a review cadence. Basic source freshness is included in Evidence, while ranking and collection remain deferred.

**Recommended next action:** run two manual refresh/review cycles on one chosen use case. Use the resulting evidence gaps and review effort to choose a small prioritization rubric; do not commission a collector before that exercise shows a specific need.

## Phase 2 — a small transparent prioritization queue

After actual use of Phase 1, extend the existing freshness cards into a sorted overdue queue and add a comparison worksheet for three to ten proposals. Freshness uses explicit source-specific due dates and outcomes, separately from content-change and assumption-review state. A fresh source alone cannot make a stale conclusion valid.

Show four ordinal inputs: evidenced unmet need, incremental distribution/settlement benefit, eligibility/readiness and research effort. Each needs a short rationale, linked evidence and an explicit unknown value. Display completeness and blockers beside any score. No missing input becomes zero, no opaque generated ranking, and no supply-growth proxy for payment adoption. Start with an explainable matrix; enable a weighted score only if the maintainer chooses weights and tradeoffs. The fictional examples must remain excluded from real commercial rankings.

Acceptance tests: changing an input shows which evidence and rationale changed; unknown/readiness blockers remain visible; identical inputs yield the same result; weight changes preserve prior ranking versions; old/failed source checks surface in the queue without inventing content changes. Manual sort/override requires a reason and preserves the computed order.

Dependencies and costs: completed revision/assumption schema and a maintainer-approved rubric; no external services. Validate with a small reviewed dataset before broadening coverage.

## Phase 3 — decide whether collection is worth adding

Evaluate collection only after two real manual refresh cycles reveal missed updates or repetitive work. Start with a reviewed public-source allowlist and a manually invoked read-only fetch that stages candidate changes. Persist actual fetch/check outcomes and compare meaningful source content; a candidate never auto-edits evidence, relationship status, confidence or decisions. Restricted pages stay unresolved. Scheduled collection, if later commissioned, needs an explicitly approved cadence, execution environment and maintainer for failures.

Acceptance tests: unchanged content generates a check event only; changed content becomes a review candidate; 403/429/timeouts create unresolved checks; irrelevant page chrome does not invalidate assumptions; every accepted candidate retains the original source and reviewer decision. No messages, payments, subscriptions or automatic recommendation endorsement.

Dependencies/permissions/costs: verify source access, public-source terms and executor networking first; any new service, secret, paid API, hosting or recurring schedule needs separate authorization and a concrete operating cost. Current network limits mean collection feasibility remains unproven. Shared editing/authentication/database work is deferred until more than one active reviewer actually needs it.

## Decisions needed before broadening v2

| Decision              | Recommended default                                            | Why it matters                                                 |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| First user/use case   | One researcher maintaining one generic profile                 | Exercises the delivered loop without multi-user infrastructure |
| Profile scope         | Remain fictional until a real issuer is deliberately specified | Prevents synthetic assumptions becoming commercial facts       |
| Review responsibility | Explicit reviewer label and a chosen source cadence            | Makes checks accountable and due dates meaningful              |
| Storage/delivery      | Local workspace export plus reviewed Git dataset               | Already available; public repository accepts public data only  |
| Prioritization        | Evidence/rationale matrix before weighted ranking              | Makes uncertainty visible while the rubric is untested         |
| Collection            | Manual review first; evaluate after two cycles                 | Avoids calling an unproven fetcher “monitoring”                |

Phase 1 is delivered. Phase 2 needs actual review use and an approved rubric; Phase 3 remains an optional collection decision. Neither is commissioned by the core v2 build.
