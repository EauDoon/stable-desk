import { fetchSource } from "./review-client.js";
import { reviewStore } from "./review-store.js";
import {
  applyReview,
  initialReview,
  validateReview,
  parseV2Import,
  activeState,
  prepareDataset,
  weeklyBrief,
  WATCH,
} from "./index-review.js";
import { escapeHTML as esc } from "./workflow-ui.js";
const app = document.querySelector("#review-app");
let review = null,
  message = "",
  busy = false,
  selected = null,
  draft = {},
  importPreview = null,
  tab = "inbox",
  recoveryVersions = null,
  confirmReset = false,
  resetRaw = null,
  unreadable = false,
  restorePreview = null,
  restoreExpected = null;
try { review = reviewStore.read(); }
catch (error) { message = error.message; unreadable = true; }
const op = () => `REVIEW-${crypto.randomUUID()}`;
const ACTOR = "local-reviewer";
let seed = null;
function download(value, name, type = "application/json") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob(
        [typeof value === "string" ? value : JSON.stringify(value)],
        { type },
      ),
    );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function render() {
  const parsed = review ? parseV2Import(JSON.stringify(review.desk)) : null,
    state = parsed ? activeState(parsed.seed, parsed.workspace) : null;
  const pending =
      review?.candidates.filter((c) => c.status === "pending") ?? [],
    candidate = review?.candidates.find((c) => c.id === selected);
  app.innerHTML = `<div class="review-shell"><header class="review-header"><a href="./" class="brand">Stable Desk</a><span class="pill">v4 · bounded source review</span><nav aria-label="Workspace navigation"><a href="./">Research desk</a></nav></header><main id="review-main"><div class="eyebrow">Public sources · human review</div><h1>Keep the evidence current.</h1><p class="review-lead">One source, dated snapshots, and an explicit decision before any claim changes.</p><aside class="demo-banner"><strong>Generic Stablecoin (STABLE) is fictional.</strong><span>No issuer, deployed token or partners. Public product context never proves STABLE acceptance.</span></aside>${message ? `<div class="storage-banner" role="alert">${esc(message)}</div>` : ""}${unreadable ? `<section class="panel"><h2>Recover unreadable review</h2><p>The saved bytes are preserved. Download them before explicitly discarding this record.</p><button class="button" data-action="backup-raw">Download raw review</button>${confirmReset ? '<button class="button" data-action="confirm-discard">Confirm discard unreadable review</button>' : ""}</section>` : `<section class="panel"><label class="button">Restore v4 review backup<input id="restore-file" type="file" accept="application/json,.json" hidden></label>${restorePreview ? `<h2>Restore preview</h2><p>Version ${restorePreview.version}: ${restorePreview.checks.length} checks, ${restorePreview.candidates.length} candidates, ${restorePreview.desk.workspace.events.length} desk events.</p><p>A different or older history requires an explicit reset after export. This does not change the separate research desk.</p><button class="button" data-action="backup-restore">Download backup before restore</button><button class="button primary" data-action="confirm-restore" ${draft.restoreBackedUp ? "" : "disabled"}>Confirm restore</button>` : ""}</section>`}${
    !review
      ? `<section class="panel"><h2>Choose a safe starting point</h2><p>Review work is stored in this browser only. Nothing is uploaded. Export the file to keep a copy or move it to another device.</p><button class="button primary" data-action="create">Start from public baseline</button><button class="button" data-action="preview-local">Import local v2 export</button><label class="button">Choose exported v2 file<input id="import-file" type="file" accept="application/json,.json" hidden></label>${importPreview ? `<div class="detail-section"><h3>Import preview</h3><p>${esc(importPreview.workspace.id)} · ${esc(importPreview.workspace.events.length)} preserved v2 events. Reviewer labels are local, not authenticated.</p><p>Download the original first, then confirm the copy into this browser.</p><button class="button" data-action="backup-import">Download original v2 backup</button><button class="button primary" data-action="confirm-import" ${draft.backedUp ? "" : "disabled"}>Confirm import</button></div>` : ""}</section>`
      : `<div class="review-toolbar"><button class="button ${tab === "inbox" ? "primary" : ""}" data-tab="inbox">Review inbox (${pending.length})</button><button class="button ${tab === "history" ? "primary" : ""}" data-tab="history">Checks & review history</button><button class="button" data-action="export">Export review backup</button><button class="button" data-action="export-desk">Export adopted workspace</button><button class="button" data-action="recovery">Download recovery manifest</button><button class="button" data-action="brief">Weekly change brief</button><button class="button" data-action="reset">Reset local review</button>${confirmReset ? '<button class="button primary" data-action="confirm-reset">Confirm erase local review</button>' : ""}</div>${recoveryVersions ? `<section class="panel"><h2>Prior committed recovery copies</h2><p>Download a prior state for inspection. This never replaces live state or erases history.</p>${recoveryVersions.length ? `<label>Prior version<select id="recovery-version">${recoveryVersions.map((v) => `<option value="${v.key}">Version ${v.version} (${v.key.slice(0, 8)})</option>`).join("")}</select></label><button class="button" data-action="download-recovery">Download selected recovery copy</button>` : "<p>No earlier commits.</p>"}</section>` : ""}<section class="panel review-source"><div><div class="eyebrow">Selected official source</div><h2>${esc(WATCH.title)}</h2><a href="${esc(WATCH.url)}" target="_blank" rel="noopener noreferrer">Original public page ↗</a><p class="muted small">Checks are manually triggered. The first successful capture establishes a monitoring baseline; it does not endorse a claim. Navigation and scripts are excluded. Layout failures remain unresolved.</p></div><button class="button primary" data-action="check" ${busy ? "disabled" : ""}>Check source now</button></section>${
              tab === "history"
                ? `<section class="panel"><h2>Actual recorded checks</h2>${
                    review.checks.length
                      ? review.checks
                          .slice()
                          .reverse()
                          .map(
                            (c) =>
                              `<article class="review-event"><strong>${esc(c.outcome)}</strong> · ${esc(c.at)}<p class="small">${esc(c.note)} ${c.hash ? `SHA-256 ${esc(c.hash)}` : `HTTP ${esc(c.status ?? "unresolved")}`}</p></article>`,
                          )
                          .join("")
                      : "<p>No checks have run.</p>"
                  }<h2>Review &amp; save history</h2>${
                    review.journal
                      .slice()
                      .reverse()
                      .map(
                        (e) =>
                          `<article class="review-event journal-event"><strong>${esc(e.type)}</strong> · ${esc(e.at)}<p class="small">${esc(e.actor)} · operation ${esc(e.opId)} · ${esc(e.candidateId ?? "")}<br>SHA-256 ${esc(e.eventHash)}</p></article>`,
                      )
                      .join("") || "<p>No changes recorded.</p>"
                  }</section>`
                : `<section class="panel"><h2>Review inbox</h2><p class="muted">Page-text differences are review candidates, not verified facts or automated recommendations.</p>${pending.map((c) => `<button class="review-candidate" data-candidate="${esc(c.id)}"><strong>Official source text changed</strong><span>Fetched ${esc(c.fetchedAt)} · ${esc(c.id)}</span></button>`).join("") || '<div class="review-empty">No candidates pending. Adopted evidence is unchanged.</div>'}</section>${candidate && candidate.status === "pending" ? `<section class="panel" id="candidate-detail"><div class="eyebrow">${esc(candidate.id)} · ${esc(candidate.status)}</div><h2>Inspect before adopting</h2><p>Previous fetch ${esc(candidate.previousFetchedAt)} → current fetch ${esc(candidate.fetchedAt)}. <a href="${esc(candidate.url)}" target="_blank" rel="noopener noreferrer">Dated source citation ↗</a></p><div class="review-diff"><details open><summary>Previous source text · ${esc(candidate.beforeHash.slice(0, 12))}</summary><pre>${esc(candidate.beforeText)}</pre></details><details open><summary>Current source text · ${esc(candidate.afterHash.slice(0, 12))}</summary><pre>${esc(candidate.afterText)}</pre></details></div><p><strong>Currently adopted claim:</strong> ${esc(state.evidence[candidate.evidenceId].value.statement)}</p><form id="review-form"><label>Reviewed replacement claim<textarea name="statement" maxlength="3000">${esc(draft.statement ?? "")}</textarea></label><label>Classification<select name="classification"><option value="company_claim">Company claim</option><option value="analyst_inference" ${draft.classification === "analyst_inference" ? "selected" : ""}>Analyst inference</option></select></label><label>Review rationale<textarea name="rationale" required minlength="8" maxlength="2000">${esc(draft.rationale ?? "")}</textarea></label><p class="small muted">Acceptance records this source snapshot and invalidates affected assumption reviews. It never endorses decisions or relationships. A stale evidence basis blocks acceptance.</p><button class="button primary" name="choice" value="accepted" type="submit" ${busy ? "disabled" : ""}>Accept reviewed revision</button><button class="button" name="choice" value="rejected" type="submit" ${busy ? "disabled" : ""}>Reject candidate</button></form></section>` : ""}`
            }`
  }</main><footer class="footer"><span>Version ${review?.version ?? "—"} · stored in this browser · no account, server storage or automatic collection</span><a href="./docs/V4_REVIEW.md">Review contract &amp; limitations</a></footer></div>`;
}
// The model runs synchronously, then the commit is persisted under the store's
// cross-tab lock. A rejected commit throws, so no caller can mistake a failure
// for a saved revision.
async function commit(input) {
  const result = applyReview(review, input, ACTOR);
  if (result.duplicate) return result;
  const saved = await reviewStore.write(review, result.state);
  review = saved;
  return result;
}
async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
    message = "";
  } catch (e) {
    message = e.message;
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
  if (form.id === "review-form") {
    const c = review.candidates.find((c) => c.id === selected),
      choice = event.submitter.value;
    draft = { ...draft, ...values };
    const intent = {
      type: choice,
      candidateId: c.id,
      expectedCandidateHash: c.afterHash,
      expectedVersion: review.version,
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
      await commit({ ...intent, opId: draft.operation.opId });
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
  if (action === "check") return;
  if (action === "backup-raw") {
    run(() => {
      resetRaw = reviewStore.raw();
      download(resetRaw, "stable-desk-unreadable-review.txt", "text/plain");
      confirmReset = true;
    });
    return;
  }
  if (action === "confirm-discard") {
    run(async () => {
      await reviewStore.clear(resetRaw);
      unreadable = false;
      confirmReset = false;
    });
    return;
  }
  if (action === "export-desk") {
    download(review.desk, "stable-desk-adopted-workspace.json");
    message = "Open Research desk, choose Workspace backup and import, then import this adopted workspace and review Decisions. Review backups remain separate.";
    render();
    return;
  }
  if (action === "backup-restore") {
    download(restoreExpected ?? restorePreview, "stable-desk-before-restore.json");
    draft.restoreBackedUp = true;
    render();
    return;
  }
  if (action === "confirm-restore") {
    run(async () => {
      review = await reviewStore.replace(restoreExpected, restorePreview);
      restorePreview = null;
      importPreview = null;
      draft = {};
      selected = null;
    });
    return;
  }
  if (action === "preview-local") {
    try {
      const raw = localStorage.getItem("stable-desk:v2");
      if (!raw)
        throw new Error(
          "No saved local v2 workspace. Choose its exported file instead.",
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
    download(review, "stable-desk-v4-review-backup.json");
    return;
  }
  if (action === "reset") {
    // Reset is explicit and never automatic: the current state is downloaded
    // first, then the user must confirm in a second step.
    run(() => {
      reviewStore.assertCurrent(review);
      resetRaw = reviewStore.raw();
      download(resetRaw, "stable-desk-v4-review-before-reset.json");
      confirmReset = true;
    });
    return;
  }
  if (action === "confirm-reset") {
    run(async () => {
      await reviewStore.clear(resetRaw);
      review = null;
      selected = null;
      draft = {};
      confirmReset = false;
      recoveryVersions = null;
    });
    return;
  }
  if (action === "create" || action === "confirm-import") {
    run(async () => {
      if (review) throw new Error("Review work already exists here.");
      const initial = initialReview(
        seed,
        action === "create" ? null : JSON.parse(draft.raw),
      );
      review = await reviewStore.replace(null, initial);
      importPreview = null;
      draft = {};
    });
    return;
  }
  if (action === "download-recovery") {
    const version = document.querySelector("#recovery-version").value;
    run(async () => {
      const found = reviewStore.recovery(version);
      if (!found) throw new Error("That recovery copy is unavailable.");
      download(found, `stable-desk-recovery-${version}.json`);
    });
    return;
  }
  run(async () => {
    if (action === "brief")
      download(
        weeklyBrief(review),
        "stable-desk-weekly-brief.md",
        "text/markdown",
      );
    if (action === "recovery") {
      recoveryVersions = reviewStore.backups();
      download(
        { versions: recoveryVersions, at: new Date().toISOString() },
        "stable-desk-recovery-manifest.json",
      );
    }
  });
});
// The source fetch is the only async step. It is awaited before the model runs,
// so a network failure never produces a committed check.
app.addEventListener("click", async (event) => {
  if (!event.target.closest('[data-action="check"]') || busy) return;
  busy = true;
  render();
  try {
    const result = await fetchSource();
    await commit({
      type: "check",
      opId: op(),
      expectedVersion: review.version,
      capture: result.capture,
    });
    message = "";
  } catch (e) {
    message = e.message;
  } finally {
    busy = false;
    render();
  }
});
app.addEventListener("change", (event) => {
  if (event.target.id === "restore-file") {
    const file = event.target.files[0];
    if (!file) return;
    run(async () => {
      restorePreview = null;
      draft.restoreBackedUp = false;
      const expected = review;
      if (file.size > 4 * 1024 * 1024) throw new Error("Import exceeds 4 MB.");
      const parsed = validateReview(JSON.parse(await file.text()));
      reviewStore.assertCurrent(expected);
      restoreExpected = expected;
      restorePreview = parsed;
    });
  }
  if (event.target.id === "import-file") {
    const file = event.target.files[0];
    if (!file) return;
    run(async () => {
      if (file.size > 4 * 1024 * 1024) throw new Error("Import exceeds 4 MB.");
      const raw = await file.text();
      importPreview = parseV2Import(raw);
      draft = { raw, backedUp: false };
    });
  }
});
try {
  const response = await fetch(new URL("../data/baseline.json", import.meta.url));
  if (!response.ok) throw new Error("Baseline could not be loaded.");
  seed = prepareDataset(await response.json());
} catch (error) {
  app.innerHTML = `<main class="load-error"><h1>Source review could not open</h1><p>${esc(error.message)}</p><p>Serve the repository over HTTP.</p><a href="./">Open the research desk</a></main>`;
  throw error;
}
render();
