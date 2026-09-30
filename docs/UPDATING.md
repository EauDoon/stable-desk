# Incorporating new public evidence

The repository dataset is the public research source of truth; a browser import is a review workspace. Neither workflow collects automatically. Never add private employer/Current material or use notes to imply confidential relationship knowledge.

1. Open the original primary public source. Record its publisher, URL, publication date, actual event date, access date, relevant section and caveats. A new access date alone does not establish that the source content changed. Use `null` for an unavailable publication date.
2. Add a new stable `Sxx` ID, or update a changed source with a real access date. Add or revise an `Exx` evidence record. Classify source existence/documented mechanics as verified facts, unsupported operational outcomes as company claims, and your conclusion as analyst inference. Explain independent-check coverage. Do not treat repeated copies of one release as independent evidence.
3. Link each record to the affected organizations; retain known existing relationships. Relationship evidence must be part of that organization's evidence IDs. A permissionless integration or shared consortium cannot establish a bilateral contract. Unknown terms and status remain unknown.
4. Bump `meta.version` and `meta.asOf` to the actual review date; update only records reviewed. Append a `manual_update` change entry with a real prior/new version, affected evidence and priorities, and a concrete summary of changed facts. Keep the first baseline. Do not backfill fake monitoring history.
5. Import the full JSON through **Workspace & data** to preview it, or run `npm run validate`. Changed organizations, source metadata, evidence and newly added evidence associated with a priority trigger **Evidence changed**. Open that priority, reconsider its assumptions and disproof conditions, then revise or park the proposal as appropriate.
6. In Decisions, record your reasoning and next review date. Check the assumption-review box only after reviewing the current evidence. This creates a local review stamp tied to the current fingerprint. Merely importing data or saving a note does not clear an evidence-change flag.
7. Export the full workspace to keep the local review record. For a canonical repository update, copy the reviewed public dataset into `data/baseline.json`, revise proposal evidence/assumptions, and set its reviewed fingerprint only after actual review. Update decision lineage to the revised evidence. Keep private assessments out of a public dataset.
8. Run validation, model tests, browser tests and a build. Review source-link results and the changed views. Commit locally; publication and source pushes require the parent/user's delivery authorization.

To update a reviewed proposal fingerprint deliberately from Node:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { evidenceFingerprint } from './src/model.js';
const data = JSON.parse(await readFile('data/baseline.json', 'utf8'));
// Only after reviewing P01's assumptions, source scope and disproof conditions:
const priority = data.priorities.find(p => p.id === 'P01');
priority.evidenceReviewedAt = data.meta.asOf;
priority.reviewBy = '2026-10-30'; // Replace with the actual next review date.
priority.evidenceSnapshot = evidenceFingerprint(data, priority);
await writeFile('data/baseline.json', JSON.stringify(data, null, 2) + '\n');
```

Do not recompute every fingerprint as a mechanical part of collection: that would hide unreviewed assumptions. The first-release fingerprints were recorded after forming and reviewing the initial proposals.

The app's **Review overdue** deadline is an analyst-selected 30-day initial cadence. It is not proof that the underlying source expired. Reopening the app after the deadline shows the stale proposal warning; there is no notification scheduler. An adopted local review can move the assessment deadline but cannot make old evidence current.

Workspace export is the transfer/backup mechanism. Importing a raw dataset starts a blank local assessment overlay; importing a full workspace restores its notes/reviews. Preview shows the dataset counts and affected review status before you replace the browser workspace. Browser data and Git updates are separate operations.
