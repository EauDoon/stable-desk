# Stable Desk

**v3 pilot is implemented for review, not deployed.** It adds sign-in and shared storage adapters, one bounded official-source check, a human review inbox and an on-demand seven-day change brief. Hosted activation requires separate approval and secure backend provisioning. The existing local desk remains available; browser-local work is never uploaded or cleared automatically. Read [the pilot contract, architecture and gates](docs/V3_PILOT.md).

Hosted setup now prefers modern Supabase publishable/secret keys, with legacy JWT fallback when modern settings are absent. Privileged keys stay server-only; user identity still requires authoritative provider verification. Read [the exact setup checklist and permissions](docs/V3_SETUP.md). Provider tests use nonfunctional synthetic values and do not establish hosted acceptance.

To exercise the complete workflow with **local fixtures only**, run `npm ci --cache /tmp/stable-desk-npm`, then `npm run dev:pilot` and open **http://127.0.0.1:4183/pilot.html**. Use `reader-a@example.invalid` and `fixture-only`. These are synthetic test inputs, not real accounts or credentials. The fixture server binds to loopback, persists to a test SQLite file in `/tmp`, and is never selected by the Vercel handler. `npm run test:pilot` runs desktop/mobile pilot browser tests. This does not verify a real Supabase or Vercel integration.

**v2.0** is a static stablecoin research desk with configurable profiles, manual evidence revisions, exact assumption impact and revision-bound decision history. It starts with **Generic Stablecoin (STABLE)**, a fictional placeholder with no real issuer, deployed token, reserves, listings or partners. Ten organizations and ten primary public sources provide market context; three synthetic investigations demonstrate the workflow. They are not commercial leads for a real asset.

The public baseline is dated **September 30, 2026**. This release adds maintenance functionality without claiming a new source refresh. Real product names, source titles, URLs and historical dates remain original. Sources about USDC, PYUSD or Open USD never prove STABLE acceptance. Token supply and aggregate transfers do not establish payment adoption.

Run the browser-local v2 desk with Node.js 22 or newer; it needs no credentials or paid services. The v3 server adds pinned Cheerio for public-page extraction. Local pilot fixtures require Node.js 22.13 or newer for SQLite; this release was tested with Node.js 24.19:

```sh
cd /workspace/stable-desk
npm run dev -- --host 0.0.0.0
```

Open **http://localhost:4173**, or forward cloud port 4173. The default binds to `127.0.0.1`; `--host 0.0.0.0` allows a cloud preview. Choose another port with `--port 4174`. Serve over HTTP; `file://` cannot load the JSON dataset. System fonts keep the build self-contained.

The working release includes:

- **Opportunities:** synthetic investigation cards, source-to-recommendation lineage, real organization context, search/filters, details and comparisons of two or three organizations.
- **Evidence:** manually recorded unchanged/revised/unreachable source checks, separate freshness dates, claim search, new source/evidence forms, active/unknown/withdrawn status, field-level before/after previews and exact affected assumptions/decisions.
- **Decisions:** reasoned local assessments, individual assumption reviews, current revision references, stale-decision flags and inspectable earlier revisions. Unknown or withdrawn dependencies block endorsement.
- **Changes:** genuine repository baselines and committed local events with reviewer, time, rationale and old/new values. No fabricated monitoring history.
- **Profiles and recovery:** independent profile states, explicit confirmation for real research mode, autosaved local drafts, conflict/rebase handling, full-history exports, validated v1/v2 imports and recovery copies before replacement/reset.

A configured real research subject remains unverified. Intended markets, currency or networks establish no issuance, acceptance or commercial relationship. All seeded opportunity fit stays synthetic. New profiles start from shared public baseline context without inheriting another profile's notes, checks or local reviews.

Read the [manual workflow guide](docs/UPDATING.md), [architecture and evidence coverage](docs/ARCHITECTURE.md), [synthetic priority brief](docs/PRIORITIES.md), [verification record](docs/VERIFICATION.md) and [release scope / next gates](docs/V2_PLAN.md). Versioned public context lives in [data/baseline.json](data/baseline.json); browser work is separate and never automatically written to GitHub.

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

`dist/` is the complete static app. To preview an extracted ZIP, run `python3 -m http.server 4173 --bind 127.0.0.1` in its root and open `http://localhost:4173`. [artifacts/stable-desk-static.zip](artifacts/stable-desk-static.zip) contains the same build bytes. Browser tests use Chromium at `/usr/bin/chromium`; elsewhere set `CHROMIUM_PATH`. Packaging/audit use Python 3; screenshot OCR uses Tesseract when available. Current files, build and unpacked ZIP are scanned; Git history is deliberately excluded.

`npm run check:links` tests unauthenticated public GET requests, separately from research. Exit 1 means 404/410; exit 2 means unresolved/restricted responses. The original public pages were reviewed through the research tool on the baseline date; direct executor reachability remains separately recorded in [artifacts/source-links.json](artifacts/source-links.json).

Local storage is not a shared database or automatic backup. Export after useful work and before switching devices or clearing browser data. Exports include committed profiles/events, not drafts or recovery copies. Generic v1 notes and original activity migrate without inferring a v2 endorsement; the old storage key is retained. Earlier issuer-specific browser content remains isolated and unsupported. Earlier Git commits still retain prior project content; no history rewriting or deletion occurred.

Delivery is through [EauDoon/stable-desk](https://github.com/EauDoon/stable-desk). The maintainer reports live **v2** at [stable-desk.vercel.app](https://stable-desk.vercel.app), from `e3207a71eb18da35bed066cbf9016e4f402a6df7`. This v3 feature branch does not replace that deployment. No paid service, subscription, new provider credential, OAuth grant, production migration, production deployment, recurring schedule or outreach was performed for v3.

The static ZIP contains the local desk and a v3 page that honestly reports missing API configuration. Hosted v3 needs the repository's server/API code and an approved backend; a static ZIP alone cannot provide shared storage or sign-in. Read [deployment status](docs/DEPLOYMENT.md) and [v3 verification](docs/V3_VERIFICATION.md).
