# Updating Stable Desk

The default is **Generic Stablecoin (STABLE)**, a fictional demo. Public sources prove only their actual subject and scope. Keep original titles, URLs, product names and dates. Do not rename real evidence to imply fictional token acceptance, fabricate relationships, insert private commercial terms or use private material.

## A complete manual review

1. **Choose a profile.** Open the profile button in the top bar. Edit intended currency, markets, networks, use case and explicit unknowns, or create an independent profile. Real research mode requires deliberate confirmation. It establishes no issuance or partnerships; examples remain synthetic.
2. **Read a source yourself.** Evidence → Source checks → Record manual check. Record the date actually checked, reviewer, rationale and cadence (1–365 days). “Checked unchanged” preserves publication/claim dates and assumption reviews. “Unable to review” keeps coverage unresolved; it is not evidence of zero activity.
3. **Revise a claim when content warrants it.** Choose content revised to continue to its evidence editor, or choose Revise claim. Preserve scope/classification and original citations; record reasoning, status and as-of date. Preview shows exact old/new fields and affected assumption/priority/decision IDs. Edit again to invalidate the preview; commit only after inspecting it. The optional source check commits atomically with the revision.
4. **Add context deliberately.** Add original source preserves original HTTPS provenance and date caveats. Add evidence requires classification, sources, organizations and selected affected assumptions. Public facts and company claims concern real products; synthetic examples use context-only citations. New evidence atomically updates its explicit assumption dependencies and requires review.
5. **Inspect affected assumptions.** Open the investigation or assessment. Each assumption shows its exact dependencies, prior review note and status. Edit assumption & dependencies to revise the statement or remove an unsupported dependency with reasoning. Withdrawing a claim retains its original event; unknown/withdrawn dependencies block endorsement.
6. **Record a reasoned assessment.** Decisions → Review assessment. Enter notes, status, owner, reviewer and review date. Select individual reviewed assumptions or the master checkbox for all. Saving notes alone does not clear an outdated assumption review. Each decision records its current basis; later relevant changes flag it stale and retain the previous decision.
7. **Inspect and back up history.** Changes shows committed reviewer/time/rationale and Inspect before / after. Decisions offers its own operation history. Export workspace contains seed, profiles and all committed events. Export after useful work and before clearing storage or switching devices.

No form fetches a source or presents an automatic verification. An unchanged check is a researcher assertion. Research status is not commercial approval. Freshness and assumption validity remain distinct.

## Drafts, conflicts and recovery

Form edits autosave as browser-local drafts, separate from committed events. Reopening an editor after interruption restores its values and operation ID. If the basis is old, use **Use latest basis and preview again**; review actual current values before committing. Changed evidence previews are invalidated by further edits. Identical retries do not duplicate a revision.

Another tab's commit warns the current tab and prevents stale writes. Load latest saved workspace or rebase the retained draft explicitly. Web Locks serialize cooperating tabs in supported browsers. Other browsers use best-effort head checks; avoid simultaneous writers there. Do not clear browser data before exporting.

If storage fails, the app keeps coherent in-memory edits and displays **memory only**. Export before reloading. Drafts may also be unavailable. Reset/import replacement fails if it cannot archive/write safely.

Workspace & data accepts up to 4 MB of generic baseline or v1/v2 export JSON. Preview validates all references and history before opening. Matching identity accepts only a compatible prefix/continuation; divergent edits are rejected without replacement. A separate workspace or reset archives the current saved JSON first. Recovery copies can be restored through the same preview. Malformed saved data remains intact until raw download or explicit archive/reset. Generic v1 keys, notes and old activity remain preserved; migrated reviews require a v2 basis. Earlier issuer-specific content stays isolated and unsupported.

Exports exclude drafts and recovery copies. There is no background sync to another device, repository or service.

## Promote reviewed public context through Git

Browser evidence work does not edit `data/baseline.json`. A maintainer must deliberately review an export's public claims and dependency changes, then update the versioned seed. Keep its default fictional profile and original public evidence; real local subjects belong in workspace events. Preserve stable IDs; use a new ID for a different source. Advance `meta.version` and the actual as-of date and append a genuine manual-update entry. Never backfill invented monitoring history.

For each actually reviewed assumption, update only its `evidenceSnapshot`, `evidenceReviewedAt` and next `reviewBy`. Use `prepareDataset`, `createWorkspace`, `activeState` and `assumptionFingerprint` from `src/workspace.js` to calculate its current basis after deliberate review. Do not recompute all snapshots merely because data changed. Keep priority-level compatibility fields coherent for v1 consumers. New unreviewed assumptions use a null snapshot.

Run `npm run validate`, model/browser checks, rebuild/package and content audit. Inspect desktop/mobile screenshots and recorded source-link coverage. Publish normal reviewed Git commits under the project's authorization; no force push, visibility change, deployment, paid API or recurring collection is implied.

The seed's 30-day cadence is a review schedule, not proof that a source expired. Flags are computed when the desk opens; no scheduled notification is sent. See [release scope and next gates](V2_PLAN.md).
