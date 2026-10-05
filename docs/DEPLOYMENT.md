# Stable Desk deployment

**06-10-2026, local v4.1 candidate:** the review queue and direct adopted-workspace handoff have not been pushed or deployed. The records below describe earlier releases and do not establish v4.1 hosted acceptance. No hosting configuration or environment variable change is required by this iteration.

**October 4 update (v4.0 live):** `https://stable-desk.vercel.app` now serves v4.0 from `780d4070c331` (one commit on top of v2's history). Direct requests from this execution environment confirm:

- `/` returns 200 and the research desk title.
- `/review.html` returns 200 and the source-review title.
- `POST /api/check` returns 200 with a real fetch of `https://docs.stripe.com/payments/stablecoin-payments` and the JSON `{ source, maxEvents, capture, checkedAt }`.
- `POST /api/check?url=...` returns 400 `{"error":"This endpoint fetches one fixed source only."}`, so a caller cannot turn the function into a proxy.
- `POST /api/check` with a non-JSON body returns 415 `{"error":"JSON request required."}`.
- `/data/baseline.json` is unchanged from v2 (`2026-09-30.generic.2`).

The earlier September 30 blocker remains historically accurate: the deployment connector was unavailable from this environment, and the v2 publish was reported by the maintainer but not observed here. v4 inherits that published alias through the existing Git integration; the new commit is live without any environment changes.

**Current verification limit (02-10-2026):** No v4 deployment or live source identity was verified in the integrity-fix pass. Local checks do not establish hosted acceptance. The adapter now preserves original HTTP method, headers and body bounds, with one upstream check per 30 seconds per warm process. Multiple instances and cold starts have separate limits; an operator must select and verify an edge traffic budget before public-scale rollout. No hosting settings, access protections or manual deployment were changed.

Deploying v4 publishes `dist/` and adds the check function. To publish the research desk alone, remove `api/check.js`; the desk itself is fully static and the review screens degrade honestly when the endpoint is absent.

The app is a static build. [vercel.json](https://github.com/EauDoon/stable-desk/blob/main/vercel.json) selects the **Other** framework preset, installs the locked development dependencies, runs the dataset-validating `npm run build`, and publishes only `dist/`. The desk needs no environment variables, hosted database or scheduled jobs. Hash navigation works without rewrites. In v4 the single optional addition is `api/check.js`, which Vercel detects as a serverless function; it needs no credentials and stores no research records. Its per-process cooldown is not a deployment-wide traffic limit. Configuration follows [Vercel's documented build settings](https://vercel.com/docs/project-configuration/vercel-json).

## Historical status, 30-09-2026

Vercel publication was requested. The connected account returned one team, **DanO** (`dan-o`, `team_8ZDCpqPW6FzEo8iQTPB2ZuFd`), and no projects. No existing project can be linked yet. The deployment connector returned `MCP tool deploy_to_vercel was not returned by tools/list` (`UNAVAILABLE`). The execution environment had no authenticated Vercel CLI session: `whoami` reports `Logged out`. CLI login failed before producing an authorization URL with `TypeError: fetch failed`; an independent request to `api.vercel.com` received proxy HTTP 403, including with the supported additional network permission. No credentials were created and no auth permissions were changed. No Vercel deployment, production URL or live verification is claimed here.

The application is unchanged from verified v2 commit `224846c6ce03faadd54d9b6b2c0a397befa928f8`. This follow-up adds deployment configuration and instructions. The repository's latest commit includes that configuration. No paid upgrade, domain purchase or access-protection change is required by this configuration.

## Resume with authorized access

Restore the connector's deployment capability, or authorize the official CLI with `vercel login` in the execution environment. Complete login in Vercel's browser interface; never paste a token into chat or commit credentials. CLI authentication is separate from the ChatGPT Vercel connection. Check `vercel whoami` and `vercel teams ls` before any deployment; verify that the authenticated user can access DanO.

The available browser route is Vercel's authenticated [Import Project page](https://vercel.com/new). Select DanO, inspect its projects again, and import `EauDoon/stable-desk` as `stable-desk` only if that project still does not exist. Select the intended `main` commit, repository root `./`, Other preset, `npm ci --ignore-scripts`, `npm run build` and `dist/` output; the committed configuration supplies these settings. Preserve default protection. If Vercel requires new GitHub installation or OAuth permissions, review that exact request before proceeding. A connected ChatGPT read action does not establish dashboard login, GitHub integration or CLI write access.

Fetch `origin/main`, confirm the selected commit and a clean tree, then list projects in DanO again. Reuse `stable-desk` if it now exists. Otherwise create that one project within DanO. Keep its default access protection. Link only the confirmed project:

```sh
vercel link --scope dan-o --project stable-desk
vercel deploy --prod --scope dan-o
```

Run from the repository root. The deployment reads the committed `vercel.json`; the `.vercel/` account/project linkage is ignored by Git. A CLI-created project does not automatically establish GitHub integration: inspect its settings before claiming future Git pushes deploy automatically. Do not create a second project on a retry. Do not promote a different commit or change protection to obtain an accessible URL.

## Verify before calling it delivered

Wait for a terminal `READY` result and inspect the build logs. Confirm the deployment's project, team, production target and Git commit metadata against the selected source commit. Record the immutable deployment URL, production alias and actual protection settings. Open the deployed app, check its title and fictional STABLE disclosure, then verify all four views, search/filter/detail/compare, profile creation/switching, a source revision preview and commit, affected-assumption review, decision history, export/import and reload persistence on desktop and mobile. Use a disposable browser profile for these edits.

If access protection blocks the test browser, use the authenticated connector where supported and report the remaining interaction-verification limit. Preserve protection; do not generate a bypass share link. Local build/browser success is not evidence that the hosted deployment succeeded.

Browser records are scoped to the site's origin. Moving from localhost to Vercel, or between deployment URLs, does not move prior local work. Export from the original origin and import at the chosen hosted origin. Prefer the stable production alias for ongoing use; hosting adds no shared database or synchronization.
