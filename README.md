# Stable Desk

**v4.0** is a public, self-contained stablecoin research desk. It adds bounded, human-reviewed source checking to the v2 research loop and needs **no account, no database and no credentials** to deploy or use. It starts with **Generic Stablecoin (STABLE)**, a fictional placeholder with no real issuer, deployed token, reserves, listings or partners. Ten organizations and ten primary public sources provide market context; three synthetic investigations demonstrate the workflow. They are not commercial leads for a real asset.

The public baseline is dated **September 30, 2026**. Real product names, source titles, URLs and historical dates remain original. Sources about USDC, PYUSD or Open USD never prove STABLE acceptance. Token supply and aggregate transfers do not establish payment adoption.

Run with Node.js 22 or newer; no runtime packages beyond the bounded HTML extractor, no credentials and no paid services:

```sh
cd stable-desk
npm ci --cache /tmp/stable-desk-npm
npm run dev -- --host 0.0.0.0
```

Open **http://localhost:4173** for the research desk, or **http://localhost:4173/review.html** for source review. The default binds to `127.0.0.1`; `--host 0.0.0.0` allows a cloud preview. Choose another port with `--port 4174`. Serve over HTTP; `file://` cannot load the JSON dataset. System fonts keep the build self-contained.

The working release includes:

- **Opportunities:** synthetic investigation cards, source-to-recommendation lineage, real organization context, search/filters, details and comparisons of two or three organizations.
- **Evidence:** manually recorded unchanged/revised/unreachable source checks, separate freshness dates, claim search, new source/evidence forms, active/unknown/withdrawn status, field-level before/after previews and exact affected assumptions/decisions.
- **Decisions:** reasoned local assessments, individual assumption reviews, current revision references, stale-decision flags and inspectable earlier revisions. Unknown or withdrawn dependencies block endorsement.
- **Changes:** genuine repository baselines and committed local events with reviewer, time, rationale and old/new values. No fabricated monitoring history.
- **Source review (new in v4):** one watched official public page, dated snapshots, SHA-256 before/after diffs, a review inbox that requires a human-written claim and rationale, one adopted v2 revision per acceptance, affected-assumption flags, a seven-day change brief, and immutable recovery copies. Stored in the browser; export is the backup.
- **Profiles and recovery:** independent profile states, explicit confirmation for real research mode, autosaved local drafts, conflict/rebase handling, full-history exports, validated v1/v2 imports and recovery copies before replacement/reset.

A configured real research subject remains unverified. Intended markets, currency or networks establish no issuance, acceptance or commercial relationship. All seeded opportunity fit stays synthetic. New profiles start from shared public baseline context without inheriting another profile's notes, checks or local reviews.

Read the [v4 review contract and its limits](docs/V4_REVIEW.md), [manual workflow guide](docs/UPDATING.md), [architecture and evidence coverage](docs/ARCHITECTURE.md), [synthetic priority brief](docs/PRIORITIES.md) and [verification record](docs/VERIFICATION.md). Versioned public context lives in [data/baseline.json](data/baseline.json); browser work is separate and is never written to GitHub.

Build and verify:

```sh
npm ci --cache /tmp/stable-desk-npm
npm run validate
npm test
npm run test:browser
npm run build
npm run package
npm run test:smoke
npm run audit:content
npm run preview -- --host 0.0.0.0 --port 4174
```

`dist/` is the complete static app: `index.html` for the research desk and `review.html` for source review. The only server-side piece is `api/check.js`, a stateless function that fetches one fixed public URL. It holds no state and needs no environment variables. Browser tests use Playwright's bundled Chromium, or set `CHROMIUM_PATH`; packaging/audit use Python 3. Current files, build and unpacked ZIP are scanned; Git history is deliberately excluded.

`npm run check:links` tests unauthenticated public GET requests, separately from research. Exit 1 means 404/410; exit 2 means unresolved/restricted responses. The original public pages were reviewed through the research tool on the baseline date; direct executor reachability remains separately recorded in [artifacts/source-links.json](artifacts/source-links.json).

Local storage is not a shared database or automatic backup. Export after useful work and before switching devices or clearing browser data. Exports include committed profiles and events, not drafts or recovery copies. Generic v1 notes and original activity migrate without inferring a v2 endorsement; the old storage key is retained. Earlier issuer-specific browser content remains isolated and unsupported. Earlier Git commits still retain prior project content; no history rewriting or deletion occurred.

Delivery is through [EauDoon/stable-desk](https://github.com/EauDoon/stable-desk). The hosted v3 pilot design, which required a Supabase project that was never provisioned, is preserved unmerged on the `v3-pilot` branch; v4 supersedes it for public use. No hosted database, access change, weighted ranking, paid API, automatic collection, live AI chat, payments, subscriptions or outreach is included.

The next step is two manual review cycles on one selected use case before choosing a prioritization rubric or collector. Vercel publication of `dist/` plus `api/check.js` is configured but **no live URL is claimed until deployment and hosted verification succeed**; see [the deployment status and resume guide](docs/DEPLOYMENT.md).
