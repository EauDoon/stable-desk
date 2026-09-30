# Updating Stable Desk

The repository contains public market context and a fictional STABLE demo. A public source about a real asset proves only its actual subject and scope. Never rename that asset in the source title, URL, statement or citation to make it appear relevant to a fictional token. Do not use private material, fabricate relationship status or insert commercial terms that are not public.

1. Open the original primary source. Record publisher, original title/URL, publication date, actual event date, access date, locator and caveats. Use null for an unavailable date. Rechecking a source alone does not mean its content changed.
2. Add a fresh stable source ID and evidence ID; never recycle a former ID for a different source. For real products use `subject: public_market` and `sourceRole: supports_statement`, preserving fact/company-claim/inference classification. For a constructed demo hypothesis use `type: synthetic_example`, `subject: fictional_profile`, `sourceRole: context_only`; its citations are context, not proof of acceptance or demand.
3. Preserve real company-to-company relationships in `publicContext`, under original names. The fictional profile's organization relationship must stay `demo`, with empty `relationshipEvidenceIds`. Its priorities/decisions must remain synthetic examples. Production issuer profiles need a future schema/workflow change and separately sourced relationships.
4. Update only the records actually reviewed. Bump `meta.version` and the real as-of date. Append a dated `manual_update` entry with genuine before/after versions, affected evidence and priorities. The generic baseline starts a new dataset scope; do not backfill missing monitored snapshots or reintroduce former source records.
5. Validate with `npm run validate` or import the complete generic JSON via Workspace & data. Preview shows counts and review warnings before replacement. Import is limited to 2 MB. Old issuer-specific exports are rejected. Generic raw-dataset import starts blank assessments; full-workspace import restores notes and reviews.
6. Review affected assumptions/disproof conditions in Decisions. Saving a note does not clear an evidence-change flag. The explicit review checkbox needs a reasoning note and stores a fingerprint of current dependencies. This records a local research assessment, not source freshness or commercial approval.
7. Export to back up browser work. A canonical Git update requires a reviewed public dataset, revised example lineage and a deliberately reviewed fingerprint. Do not copy private notes into a public repository. Never recompute every fingerprint as part of collection; doing so would hide unreviewed assumptions.
8. Run model/browser checks, rebuild, package and content audit. Inspect desktop/mobile screenshots and direct source-link results. Commit and push normally under the project's existing publication authorization; no force push, access change, deployment or paid service is implied.

The current placeholder can be changed in `profile.name`, `profile.ticker` and `profile.id`. Keep fictional mode, null issuer/currency and empty networks. UI subject labels derive from this profile. A name change does not relabel any public source; review the example prose as well. Profile changes intentionally flag all existing examples until reviewed. Full issuer-profile editing is planned for v2.

Example of deliberately recording a reviewed snapshot:

```js
import { readFile, writeFile } from "node:fs/promises";
import { evidenceFingerprint } from "./src/model.js";
const data = JSON.parse(await readFile("data/baseline.json", "utf8"));
// Only after reviewing the example's assumptions and the actual source scope:
const priority = data.priorities.find((p) => p.id === "P-G01");
priority.evidenceReviewedAt = data.meta.asOf;
priority.reviewBy = "2026-10-30"; // Set an actual next review date.
priority.evidenceSnapshot = evidenceFingerprint(data, priority);
await writeFile("data/baseline.json", JSON.stringify(data, null, 2) + "\n");
```

The initial 30-day review cadence is a research schedule, not proof that a source expired. The app flags overdue proposals when opened; it sends no scheduled notification. See the [v2 plan](V2_PLAN.md) for a maintained evidence queue and field-level change review.
