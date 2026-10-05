# Stable Desk

**v4.1** is a public, self-contained stablecoin research desk. It adds an actionable review queue and a direct browser-local handoff from source review to the research desk. It needs **no account, no database and no credentials** to deploy or use. It starts with **Generic Stablecoin (STABLE)**, a fictional placeholder with no real issuer, deployed token, reserves, listings or partners. Ten organizations and ten primary public sources provide market context; three synthetic investigations demonstrate the workflow. They are not commercial leads for a real asset.

In **Evidence**, filter the review queue by sources, assumptions or decisions. Blocked evidence and unresolved coverage come first, followed by changed review bases and the oldest deadlines, including work due today (UTC). Each row opens the relevant editor. A source check never clears an assumption or decision review, and an empty queue does not establish commercial readiness.

After adopting evidence in **Source review**, open **Research desk > Workspace & data > Preview adopted source review**. Inspect the snapshot, then choose **Use in this browser**. Pending candidates stay in Source review. Both stores remain separate, later changes require another import, and exports remain the backup and cross-device path. Stale previews and cross-profile draft rebases cannot silently replace newer work.

The public baseline is dated **September 30, 2026**. Real product names, source titles, URLs and historical dates remain original. Sources about USDC, PYUSD or Open USD never prove STABLE acceptance. Token supply and aggregate transfers do not establish payment adoption.

Run with Node.js 22.13 or newer; no runtime packages beyond the bounded HTML extractor, no credentials and no paid services:

```sh
cd stable-desk
npm ci --ignore-scripts
npm run dev
```

Open **http://localhost:4173** for the research desk, or **http://localhost:4173/review.html** for source review. The default binds to `127.0.0.1` and accepts only local hosts on the listening port. `--host 0.0.0.0` explicitly opens a public cloud preview and accepts its public host; use the built `preview` surface when exposing it. Both modes refuse hidden paths, links outside the serving root and cross-origin source checks. Choose another port with `--port 4174`. Serve over HTTP; `file://` cannot load the JSON dataset. System fonts keep the build self-contained.

The working release includes:

- **Opportunities:** synthetic investigation cards, source-to-recommendation lineage, real organization context, search/filters, details and comparisons of two or three organizations.
- **Evidence:** manually recorded unchanged/revised/unreachable source checks, separate freshness dates, claim search, new source/evidence forms, active/unknown/withdrawn status, field-level before/after previews and exact affected assumptions/decisions.
- **Decisions:** reasoned local assessments, individual assumption reviews, current revision references, stale-decision flags and inspectable earlier revisions. Unknown or withdrawn dependencies block endorsement.
- **Changes:** genuine repository baselines and committed local events with reviewer, time, rationale and old/new values. No fabricated monitoring history.
- **Source review (new in v4):** one watched official public page, dated snapshots, SHA-256 before/after diffs, a review inbox that requires a human-written claim and rationale, one adopted v2 revision per acceptance, affected-assumption flags, a seven-day change brief, validated v4 backup restoration and retained recovery copies. Stored in the browser; export is the backup.
- **Profiles and recovery:** independent profile states, explicit confirmation for real research mode, autosaved local drafts, conflict/rebase handling, full-history exports, validated v1/v2 imports and recovery copies before replacement/reset.

A configured real research subject remains unverified. Intended markets, currency or networks establish no issuance, acceptance or commercial relationship. All seeded opportunity fit stays synthetic. New profiles start from shared public baseline context without inheriting another profile's notes, checks or local reviews.

| Local candidate status on 06-10-2026 | Evidence |
| --- | --- |
| Current source | v4.1 review queue, explicit adopted-workspace handoff, and guarded draft/import recovery; v2/v4 storage formats retained |
| Deterministic validation | Model/store/HTTP adapter and Chromium desktop/mobile checks; see [verification](docs/VERIFICATION.md) |
| Hosted source identity | v4.1 has not been published or deployed. Historical deployment observations are recorded separately in [deployment notes](docs/DEPLOYMENT.md) |
| Storage | Manual exports are backups. Recovery copies may be evicted. No cross-device synchronization. |
| Reuse terms | No license selected; no reuse permission is inferred from public visibility. |

Read the [v4 review contract and its limits](docs/V4_REVIEW.md), [manual workflow guide](docs/UPDATING.md), [architecture and evidence coverage](docs/ARCHITECTURE.md), [synthetic priority brief](docs/PRIORITIES.md) and [verification record](docs/VERIFICATION.md). Versioned public context lives in [data/baseline.json](data/baseline.json); browser work is separate and is never written to GitHub.

Build and verify:

```sh
npm ci --ignore-scripts
npm run validate
npm test
npx --no-install playwright install chromium
npm run test:browser
npm run build
npm run package
npm run test:smoke
npm run audit:content
npm run preview -- --host 0.0.0.0 --port 4174
```

`dist/` is the complete static app: `index.html` for the research desk and `review.html` for source review. The only server-side piece is `api/check.js`, a function that fetches one fixed public URL with a short per-process cooldown. It stores no research records and needs no environment variables. Browser tests use Playwright's installed Chromium, or set `CHROMIUM_PATH`; packaging/audit use Python 3. New reports, screenshots and ZIPs go to ignored `test-results/`; checked-in `artifacts/` are historical. On Windows use `npm.cmd`, and run `py scripts/package.py` and `py scripts/audit-content.py` if `python3` is unavailable. Resolve an installed Python 3 interpreter if `py` is absent. Current files, build and unpacked ZIP are scanned; Git history is deliberately excluded.

`npm run check:links` tests unauthenticated public GET requests, separately from research. Exit 1 means 404/410; exit 2 means unresolved/restricted responses. The original public pages were reviewed through the research tool on the baseline date; direct executor reachability remains separately recorded in [artifacts/source-links.json](artifacts/source-links.json).

Local storage is not a shared database or automatic backup. Export after useful work and before switching devices or clearing browser data. Exports include committed profiles and events, not drafts or recovery copies. Generic v1 notes and original activity migrate without inferring a v2 endorsement; the old storage key is retained. Earlier issuer-specific browser content remains isolated and unsupported. Earlier Git commits still retain prior project content; no history rewriting or deletion occurred.

Delivery is through [EauDoon/stable-desk](https://github.com/EauDoon/stable-desk). The hosted v3 pilot design, which required a Supabase project that was never provisioned, is preserved unmerged on the `v3-pilot` branch; v4 supersedes it for public use. No hosted database, access change, weighted ranking, paid API, automatic collection, live AI chat, payments, subscriptions or outreach is included.

The next research step is two manual review cycles on one selected use case before choosing a prioritization rubric or collector. The repository homepage names a hosted site, but its current source identity and v4 behavior have not been independently verified; see [the deployment status and resume guide](docs/DEPLOYMENT.md).
