# Stable Desk

A stablecoin ecosystem research workspace. **v1.1** uses **Generic Stablecoin (STABLE)** as a fictional placeholder: no real issuer, deployed token, reserves, listings or partners exist in this demo. Ten real organizations and ten primary public sources provide market context. Three synthetic research examples demonstrate the desk's workflow; they are not commercial leads or recommendations for a real asset.

The baseline is dated **September 30, 2026** and maintained manually. Public facts and company claims retain their original real product names. A real USDC, PYUSD or Open USD initiative is never presented as evidence of STABLE acceptance. Existing public initiatives are context, not new leads. Token supply and aggregate onchain volume do not establish payment adoption.

Run with Node.js 22 or newer; no runtime packages, credentials or paid services are needed:

```sh
cd /workspace/stable-desk
npm run dev -- --host 0.0.0.0
```

Open **http://localhost:4173**, or forward cloud port 4173. The default binds to `127.0.0.1`; use `--host 0.0.0.0` for a cloud preview. Choose another port with `--port 4174`. Serve over HTTP: opening `index.html` via `file://` cannot load the JSON dataset.

The working slice includes:

- **Opportunities:** synthetic investigation cards; real organization context; search, lane/relationship/market filters, source/evidence details and comparisons of two or three organizations.
- **Changes:** the new generic dataset baseline and genuine local edit/import timestamps. Historical announcements keep their dates; there is no fabricated monitoring history.
- **Decisions:** editable local research status, owner, notes and review date. A reasoned assumption review records the current dependency fingerprint.
- **Workspace:** browser persistence, JSON export, validated import with preview and reset. Evidence updates and profile changes flag affected assumptions. Local assessments are not synchronized to Git or another device.

Read the [example priority brief](docs/PRIORITIES.md), [architecture and coverage](docs/ARCHITECTURE.md), [update instructions](docs/UPDATING.md), [verification record](docs/VERIFICATION.md) and [concrete v2 plan](docs/V2_PLAN.md). The versioned source of truth is [data/baseline.json](data/baseline.json). Placeholder name and ticker live in `profile`; the current app supports fictional profiles only. Full issuer configuration and the v2 maintenance workflow are planned, not implemented.

Build and verify:

```sh
npm ci --cache /tmp/stable-desk-npm
npm run validate
npm test
npm run test:browser
npm run build
npm run package
npm run audit:content
npm run preview -- --host 0.0.0.0
```

Preview uses port 4173; stop the dev server first or choose another port. `dist/` is the complete static app; `artifacts/stable-desk-static.zip` is the portable build. Browser tests use Chromium at `/usr/bin/chromium` in this cloud environment; elsewhere set `CHROMIUM_PATH`. Packaging and the content audit use Python 3. The content audit scans current tracked files, build output, ZIP members and screenshot OCR when Tesseract is available. It does not scan or rewrite Git history.

`npm run check:links` makes unauthenticated public GET requests and writes `artifacts/source-links.json`. Exit 1 means a 404/410; exit 2 means unresolved or restricted responses. It does not refresh research. Public pages were opened through the web research tool; direct executor reachability is recorded separately.

v1.1 replaces the former issuer-specific current dataset, docs, screenshots and build; it does not rename old citations. Earlier Git commits still retain prior content. No history rewriting or deletion occurred. The legacy browser storage key is preserved separately and never loaded by the generic demo; legacy issuer-specific exports are rejected. Current generic exports preserve full provenance and local assessments.

Delivery is through the configured [Stable Desk repository](https://github.com/EauDoon/stable-desk). No hosted deployment, access change, paid API, subscription, recurring collection, live AI chat, payment or outbound message is included. Product eligibility, live execution, independently audited adoption and private commercial terms are outside this baseline.
