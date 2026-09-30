# stable-desk

Daniel Oon's public-evidence research desk for XSGD distribution, issuer partnerships and liquidity. First release: **September 30, 2026**. This is a manually maintained baseline, with ten organizations, seventeen primary sources and three proposed investigations.

Run the app with Node.js 22 or newer. There are no runtime packages, credentials or paid services:

```sh
cd /workspace/stable-desk
npm run dev -- --host 0.0.0.0
```

Open **http://localhost:4173** (or the environment's forwarded port 4173). Default `npm run dev` binds to `127.0.0.1`; use `--host 0.0.0.0` only for a cloud preview. Select another port with `--port 4174`. Opening `index.html` through `file://` is unsupported because the app loads JSON through HTTP.

Build a portable static artifact:

```sh
npm run validate
npm test
npm run build
npm run preview -- --host 0.0.0.0
```

`dist/` contains the complete static app. Preview also uses port 4173; stop the dev server first or pass another port. Any static HTTP host can serve it. No publication, source push, access change, subscription or recurring collection was performed. An owner-only Sites deployment is a proposed delivery route for the parent to review; no Site was registered or published by this task.

The working slice includes:

- **Opportunities:** three investigation cards; ten organizations; search across products, markets, uncertainty and evidence; lane/relationship/market filters; source-backed details; comparison of two or three organizations.
- **Changes:** the genuine first baseline, documentation tensions, and actual local edit/import timestamps. Historical announcements are context, not fabricated detected changes.
- **Decisions:** proposed research actions with editable status, owner, review date and notes. An explicit, reasoned local assumption review records the evidence version.
- **Workspace:** browser persistence; full JSON export; validated evidence/workspace import with preview; reset to the versioned baseline. Local work is not synchronized to another device or to Git.
- **Review controls:** changed evidence, linked organization facts, or newly added evidence triggers an assumption-review flag. Date-based review deadlines are also flagged. An imported update never automatically endorses a recommendation.

Read the [source-backed priority brief](docs/PRIORITIES.md), [architecture and coverage](docs/ARCHITECTURE.md), [manual update procedure](docs/UPDATING.md), and [verification record](docs/VERIFICATION.md). The maintainable public source of truth is [data/baseline.json](data/baseline.json).

Browser tests require the pinned development dependency:

```sh
npm ci --cache /tmp/stable-desk-npm
npm run test:browser
npm run check:links
```

The selected cloud environment provides Chromium at `/usr/bin/chromium`. Elsewhere set `CHROMIUM_PATH` to an installed Chromium executable. `check:links` sends unauthenticated public GET requests and records HTTP restrictions separately from dead links; it does not refresh evidence or recommendations. Exit code 1 means a 404/410 was found; code 2 means client restrictions or unresolved responses prevent a complete reachability check. This executor returned `fetch failed` for direct requests; the retained pages were opened through the web research tool and rendered targets were browser-tested. Browser results and screenshots are in `artifacts/`.

All operational performance numbers retain company attribution. Known integrations are expansion or validation opportunities. Nium's bilateral StraitsX status remains unknown; shared Open USD participation is not a bilateral deal. Supply growth and onchain volume are not payment adoption. Executable liquidity, authentic-token state, live product eligibility and private commercial terms remain unverified. The app has no live AI chat, authenticated data integrations, automatic refresh or background monitoring.
