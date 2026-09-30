# Stable Desk architecture and coverage

The app uses browser ES modules, semantic HTML and responsive CSS. No application framework, backend, database, credentials or AI endpoint is required. The small Node HTTP server is a local preview utility; deployment uses the static `dist/` output.

`src/model.js` owns validation, search, recommendation dependency fingerprints, review status and import/export. `src/app.js` renders the three views and accessible native modal dialogs, handles workspace actions, and escapes imported strings. `src/styles.css` owns the visual system and mobile organization cards. `scripts/build.mjs` validates and copies only the app, evidence and documentation into `dist/`.

The schema is version 1, in `data/baseline.json`:

| Record | Key contents | Links |
| --- | --- | --- |
| `meta` | Baseline version, as-of date, manual collection, review interval, scope | All records |
| `sources` | Stable ID, HTTPS URL, publisher, publication/event/access dates, scope caveats, source locator | Evidence references source IDs |
| `evidence` | Statement, `verified_fact` / `company_claim` / `analyst_inference`, scope, independent-check limits | Organization IDs and source IDs |
| `organizations` | Named organization, markets, products, lane, relationship class, uncertainty and next questions | Evidence, relationship evidence and priorities |
| `priorities` | Thesis, rationale, concrete next action, assumptions, disproof, review date, dependency fingerprint | Organizations and evidence |
| `decisions` | Proposed investigation, owner, status, rationale, review date | Priority and evidence |
| `changes` | Dated baseline/manual-update record, actual before/after versions | Affected evidence and priorities |

`announced` means a public relationship or initiative is described, without asserting all proposed products are live. `ecosystem` means a directory/protocol association; bilateral contract scope is unverified. `prospective` means bilateral StraitsX status is unknown in this reviewed source set. Ant International is represented through Alipay+; Uniswap Labs is named separately from the permissionless protocol listing.

The first-release coverage is ten organizations, seventeen primary sources, twenty evidence records, three proposals, three proposed decisions and one dated baseline. Undated directories and customer stories retain `publishedAt: null`. Publication date and event date are separate; October 2024 is month-level for the Singapore integration. Source S13 records conflicting locale metadata and uses the canonical November 2025 dateline. No previous monitored snapshot is invented.

Each proposal's fingerprint includes the current relevant organizations, all evidence associated with them, and that evidence's sources. This catches newly added linked evidence as well as edits to existing records. The deterministic FNV fingerprint is a change detector, not a cryptographic integrity or authenticity guarantee. Ordering-only changes can conservatively trigger review. Adding an unrelated organization does not update an existing proposal automatically.

Browser storage under `stable-desk:v1` contains optional imported public data, decision overrides, explicit local review stamps and an activity log. The repository dataset stays immutable in the UI. JSON export includes both the dataset and local overlay. Import validates all IDs, enums, dates, HTTPS links and relationship references before replacing browser state. Dataset import does not write to Git. Invalid stored data falls back to the repository baseline and displays a notice. Storage failure is surfaced; export is the backup route.

This is single-browser persistence, with no synchronization, concurrency handling, authentication, encryption or automatic backup. Reset removes local records after a user confirmation. Decision statuses are research states; none represents employer authorization, signed terms, outreach or execution. Only the user-requested local assessments are editable. Source updates use validated full-dataset imports or repository changes.

Review deadlines use the current UTC date. A source or evidence change requires assumption review; a local review requires an explicit checkbox and reasoning note. A reviewed proposal becomes flagged again when its dependency fingerprint changes. A local future review date is the user's assessment schedule, not a source freshness guarantee. No source is fetched when changing a decision.

Coverage limits: no authenticated quotes, order-book samples, blockchain RPC/explorer state verification, independently audited transaction series, live regulatory registry checks, private contracts or commercial terms. Known partner status is retained; launch and performance claims remain attributed. A provider's public page is primary evidence of its statement, not independent proof of its performance. Public corporate pages can be outdated or restrict automated clients. All source links were opened through the research tool; separate HTTP check results record client restrictions honestly.

No continuous monitoring, recurring automation, live refresh or AI chat is implemented. Opening/reloading the app loads dated data. The only third-party request made by the app itself is optional Google Fonts CSS/font loading; system font fallbacks keep the desk usable when blocked. It has no analytics, tracking scripts or remote data submission. External source links open only on user action. Private Sites static hosting is compatible in principle but has not been registered or deployed; preserve an owner-only audience if the parent later publishes.
