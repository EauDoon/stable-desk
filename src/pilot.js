import { requestPilot } from "./pilot-client.js";
import { parseV2Import, activeState } from "./workspace.js";
import { escapeHTML as esc } from "./workflow-ui.js";
const app = document.querySelector("#pilot-app");
let status,
  user = null,
  pilot = null,
  message = "",
  busy = false,
  selected = null,
  draft = {},
  importPreview = null,
  tab = "inbox",
  recoveryVersions = null;
const op = () => `PILOT-${crypto.randomUUID()}`;
function download(value, name, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob(
        [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
        { type },
      ),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render() {
  const parsed = pilot ? parseV2Import(JSON.stringify(pilot.desk)) : null,
    state = parsed ? activeState(parsed.seed, parsed.workspace) : null;
  const pending = pilot?.candidates.filter((c) => c.status === "pending") ?? [],
    candidate = pilot?.candidates.find((c) => c.id === selected);
  app.innerHTML = `<div class="pilot-shell"><header class="pilot-header"><a href="./" class="brand">Stable Desk</a><span class="pill">v3 · bounded review pilot</span><nav aria-label="Workspace navigation"><a href="./">Local v2 desk</a>${user && pilot ? '<a href="./?shared=1">Shared research desk</a>' : ""}${user ? '<button class="button" data-action="logout">Sign out</button>' : ""}</nav></header><main id="pilot-main"><div class="eyebrow">Public sources · human review</div><h1>Keep the evidence current.</h1><p class="pilot-lead">One source, dated snapshots, and an explicit decision before any claim changes.</p><aside class="demo-banner"><strong>Generic Stablecoin (STABLE) is fictional.</strong><span>No issuer, deployed token or partners. Public product context never proves STABLE acceptance.</span></aside>${status?.fixture ? '<div class="storage-banner" role="status">Local fixture mode. Synthetic accounts and page updates test the workflow; no real hosted integration or market refresh is claimed.</div>' : ""}${message ? `<div class="storage-banner" role="alert">${esc(message)}</div>` : ""}${
    !status?.configured
      ? `<section class="panel pilot-empty"><h2>Hosted pilot awaits provisioning</h2><p>Sign-in and persistent storage are not configured. Live v2 and its browser-local work remain available.</p><a href="./docs/V3_PILOT.md">Implementation, costs and approval gates</a></section>`
      : !user
        ? `<section class="panel pilot-login"><h2>Sign in to shared work</h2><p class="muted">An existing approved pilot account is required. No signup, social OAuth or outgoing email is included.</p><form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="button primary" type="submit" ${busy ? "disabled" : ""}>Sign in</button></form><p class="small muted">Session expires after at most one hour; sign in again to resume. Passwords and sessions are never stored in workspace exports.</p></section>`
        : !pilot
          ? `<section class="panel"><h2>Choose a safe starting point</h2><p>Creating shared work never clears local storage. Import is allowed only into an empty shared account.</p><button class="button primary" data-action="create">Start from public baseline</button><button class="button" data-action="preview-local">Preview local v2 import</button><label class="button">Preview exported v2 file<input id="import-file" type="file" accept="application/json,.json" hidden></label>${importPreview ? `<div class="detail-section"><h3>Import preview</h3><p>${esc(importPreview.workspace.id)} · ${importPreview.workspace.events.length} preserved v2 events. Earlier reviewer labels remain unauthenticated.</p><p>Download the original first, then explicitly copy it into this empty shared workspace.</p><button class="button" data-action="backup-import">Download original v2 backup</button><button class="button primary" data-action="confirm-import" ${draft.backedUp ? "" : "disabled"}>Confirm copy to shared workspace</button></div>` : ""}</section>`
          : `<div class="pilot-toolbar"><button class="button ${tab === "inbox" ? "primary" : ""}" data-tab="inbox">Review inbox (${pending.length})</button><button class="button ${tab === "history" ? "primary" : ""}" data-tab="history">Checks & review history</button><button class="button" data-action="refresh">Load latest</button><button class="button" data-action="export">Export pilot backup</button><button class="button" data-action="recovery">Download recovery manifest</button><button class="button" data-action="brief">Weekly change brief</button></div>${recoveryVersions ? `<section class="panel"><h2>Prior committed recovery copies</h2><p>Download a prior state for inspection. This never replaces the live shared state or erases its audit history.</p>${recoveryVersions.length ? `<label>Prior version<select id="recovery-version">${recoveryVersions.map((v) => `<option value="${v}">${v}</option>`).join("")}</select></label><button class="button" data-action="download-recovery">Download selected recovery copy</button>` : "<p>No earlier commits.</p>"}</section>` : ""}<section class="panel pilot-source"><div><div class="eyebrow">Selected official source</div><h2>${esc(status.source.title)}</h2><a href="${esc(status.source.url)}" target="_blank" rel="noopener noreferrer">Original public page ↗</a><p class="muted small">Checks are manually triggered. The first successful capture establishes a monitoring baseline; it does not endorse a claim. Navigation and scripts are excluded. Layout failures remain unresolved.</p></div><button class="button primary" data-action="check" ${busy ? "disabled" : ""}>Check source now</button></section>${
              tab === "history"
                ? `<section class="panel"><h2>Actual recorded checks</h2>${
                    pilot.checks.length
                      ? pilot.checks
                          .slice()
                          .reverse()
                          .map(
                            (c) =>
                              `<article class="pilot-event"><strong>${esc(c.outcome)}</strong> · ${esc(c.at)}<p class="small">${esc(c.note)} ${c.hash ? `SHA-256 ${esc(c.hash)}` : `HTTP ${esc(c.status ?? "unresolved")}`}</p></article>`,
                          )
                          .join("")
                      : "<p>No checks have run.</p>"
                  }<h2>Authenticated review & save history</h2>${
                    pilot.journal
                      .slice()
                      .reverse()
                      .map(
                        (e) =>
                          `<article class="pilot-event"><strong>${esc(e.type)}</strong> · ${esc(e.at)}<p class="small">${esc(e.actor)} · operation ${esc(e.opId)} · ${esc(e.candidateId ?? "")}<br>SHA-256 ${esc(e.eventHash)}</p></article>`,
                      )
                      .join("") || "<p>No changes recorded.</p>"
                  }</section>`
                : `<section class="panel"><h2>Review inbox</h2><p class="muted">Page-text differences are review candidates, not verified facts or automated recommendations.</p>${pending.map((c) => `<button class="pilot-candidate" data-candidate="${esc(c.id)}"><strong>Official source text changed</strong><span>Fetched ${esc(c.fetchedAt)} · ${esc(c.id)}</span></button>`).join("") || '<div class="pilot-empty">No candidates pending. Adopted evidence is unchanged.</div>'}</section>${candidate && candidate.status === "pending" ? `<section class="panel" id="candidate-detail"><div class="eyebrow">${esc(candidate.id)} · ${esc(candidate.status)}</div><h2>Inspect before adopting</h2><p>Previous fetch ${esc(candidate.previousFetchedAt)} → current fetch ${esc(candidate.fetchedAt)}. <a href="${esc(candidate.url)}" target="_blank" rel="noopener noreferrer">Dated source citation ↗</a></p><div class="pilot-diff"><details open><summary>Previous source text · ${esc(candidate.beforeHash.slice(0, 12))}</summary><pre>${esc(candidate.beforeText)}</pre></details><details open><summary>Current source text · ${esc(candidate.afterHash.slice(0, 12))}</summary><pre>${esc(candidate.afterText)}</pre></details></div><p><strong>Currently adopted claim:</strong> ${esc(state.evidence[candidate.evidenceId].value.statement)}</p><form id="review-form"><label>Reviewed replacement claim<textarea name="statement" maxlength="3000">${esc(draft.statement ?? "")}</textarea></label><label>Classification<select name="classification"><option value="company_claim">Company claim</option><option value="analyst_inference" ${draft.classification === "analyst_inference" ? "selected" : ""}>Analyst inference</option></select></label><label>Review rationale<textarea name="rationale" required minlength="8" maxlength="2000">${esc(draft.rationale ?? "")}</textarea></label><p class="small muted">Acceptance records this source snapshot and invalidates affected assumption reviews. It never endorses decisions or relationships. A stale evidence basis blocks acceptance.</p><button class="button primary" name="choice" value="accepted" type="submit" ${busy ? "disabled" : ""}>Accept reviewed revision</button><button class="button" name="choice" value="rejected" type="submit" ${busy ? "disabled" : ""}>Reject candidate</button></form></section>` : ""}`
            }`
  }</main><footer class="footer"><span>Version ${pilot?.version ?? "—"} · ${user ? "Signed-in private workspace" : "Public demo available locally"} · no automatic collection or delivery</span><a href="./docs/V3_PILOT.md">Pilot contract & limitations</a></footer></div>`;
}
async function refresh() {
  const result = await requestPilot("state");
  user = result.user;
  pilot = result.pilot;
}
async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
    message = "";
  } catch (e) {
    message = e.message;
    if (e.status === 401) {
      user = null;
      pilot = null;
      selected = null;
      draft = {};
    }
  } finally {
    busy = false;
    render();
  }
}
app.addEventListener("input", (event) => {
  if (event.target.closest("#review-form"))
    draft = {
      ...draft,
      ...Object.fromEntries(new FormData(event.target.closest("form"))),
    };
});
app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target,
    values = Object.fromEntries(new FormData(form));
  if (form.id === "login-form") {
    form.querySelector("[name=password]").value = "";
    run(async () => {
      await requestPilot("login", values);
      await refresh();
    });
  } else if (form.id === "review-form") {
    const c = pilot.candidates.find((c) => c.id === selected),
      choice = event.submitter.value;
    draft = { ...draft, ...values };
    const intent = {
      type: choice,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      expectedVersion: pilot.version,
      statement: values.statement,
      classification: values.classification,
      rationale: values.rationale,
    };
    if (
      !draft.operation ||
      JSON.stringify(draft.operation.intent) !== JSON.stringify(intent)
    )
      draft.operation = { opId: op(), intent };
    run(async () => {
      const result = await requestPilot("operate", {
        ...intent,
        opId: draft.operation.opId,
      });
      pilot = result.pilot;
      selected = null;
      draft = {};
    });
  }
});
app.addEventListener("click", (event) => {
  const target = event.target.closest(
    "[data-action],[data-tab],[data-candidate]",
  );
  if (!target) return;
  if (target.dataset.tab) {
    tab = target.dataset.tab;
    render();
    return;
  }
  if (target.dataset.candidate) {
    selected = target.dataset.candidate;
    draft = {};
    render();
    return;
  }
  const action = target.dataset.action;
  if (action === "preview-local") {
    try {
      const raw = localStorage.getItem("stable-desk:v2");
      if (!raw)
        throw new Error(
          "No saved local v2 workspace. Upload its exported file instead.",
        );
      importPreview = parseV2Import(raw);
      draft = { raw, backedUp: false };
      message = "";
    } catch (e) {
      message = e.message;
    }
    render();
    return;
  }
  if (action === "backup-import") {
    download(draft.raw, "stable-desk-original-v2.json");
    draft.backedUp = true;
    render();
    return;
  }
  if (action === "export") {
    download(pilot, "stable-desk-v3-backup.json");
    return;
  }
  run(async () => {
    if (action === "logout") {
      await requestPilot("logout", {});
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("stable-desk-auth");
        channel.postMessage("signed-out");
        channel.close();
      }
      user = null;
      pilot = null;
      selected = null;
      draft = {};
    }
    if (action === "create" || action === "confirm-import") {
      const result = await requestPilot(
        "init",
        action === "create" ? {} : { imported: JSON.parse(draft.raw) },
      );
      pilot = result.pilot;
      importPreview = null;
      draft = {};
    }
    if (action === "refresh") await refresh();
    if (action === "check") {
      const result = await requestPilot("operate", {
        type: "check",
        opId: op(),
        expectedVersion: pilot.version,
      });
      pilot = result.pilot;
    }
    if (action === "brief") {
      const result = await requestPilot("brief");
      download(result.markdown, "stable-desk-weekly-brief.md", "text/markdown");
    }
    if (action === "recovery") {
      const result = await requestPilot("recovery");
      recoveryVersions = result.versions;
      download(result, "stable-desk-recovery-manifest.json");
    }
    if (action === "download-recovery") {
      const version = Number(document.querySelector("#recovery-version").value);
      const result = await requestPilot("recovery", null, { version });
      download(result.pilot, `stable-desk-recovery-${version}.json`);
    }
  });
});
app.addEventListener("change", (event) => {
  if (event.target.id === "import-file") {
    const file = event.target.files[0];
    run(async () => {
      if (file.size > 4 * 1024 * 1024) throw new Error("Import exceeds 4 MB.");
      const raw = await file.text();
      importPreview = parseV2Import(raw);
      draft = { raw, backedUp: false };
    });
  }
});
try {
  status = await requestPilot("status");
  if (status.configured) {
    try {
      await refresh();
    } catch (e) {
      if (e.status !== 401) message = e.message;
    }
  }
} catch (e) {
  status = { configured: false };
  message = e.message;
}
render();
