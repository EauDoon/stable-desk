import {
  RELATIONSHIPS,
  EVIDENCE_TYPES,
  LANES,
  DECISION_STATUSES,
  validateDataset,
  filterOrganizations,
} from "./model.js";

import {
  prepareDataset,
  createWorkspace,
  activeState,
  projectWorkspace,
  workspaceHead,
  materializeDataset,
  priorityStatus,
  decisionStatus,
  sourceFreshness,
  commitOperation,
  previewEvidence,
  exportV2,
  parseV2Import,
  mergeWorkspace,
  migrateLegacy,
  uid,
  canonical,
} from "./workspace.js";
import {
  profileForm,
  sourceCheckForm,
  evidenceForm,
  newSourceForm,
  assumptionForm,
  assumptionCards,
  decisionForm,
  revisionPreview,
  historyMarkup,
} from "./workflow-ui.js";
import { requestPilot } from "./pilot-client.js";
const SHARED = new URLSearchParams(location.search).get("shared") === "1";
let sharedPilot = null;
let sharedFixture = false;
let sharedDrafts = {};
function lockShared() {
  sharedDrafts = {};
  detailDialog.close();
  utilityDialog.close();
  app.innerHTML =
    '<main class="load-error"><h1>Shared session ended</h1><p>Sign in again to open shared work. Local v2 is preserved.</p><a href="./pilot.html">Sign in</a></main>';
}
if (SHARED && "BroadcastChannel" in window)
  new BroadcastChannel("stable-desk-auth").addEventListener(
    "message",
    (event) => {
      if (event.data === "signed-out") lockShared();
    },
  );
const STORAGE_KEY = "stable-desk:v2";
const LEGACY_KEY = "stable-desk:generic-v1";
const DRAFT_KEY = "stable-desk:drafts-v2";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const formatDate = (value) =>
  value
    ? new Date(value.length === 7 ? `${value}-01` : value).toLocaleDateString(
        "en-GB",
        {
          day: value.length === 7 ? undefined : "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        },
      )
    : "Not published";
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{ grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', change: '<path d="M3 12a9 9 0 1 0 3-7M3 3v6h6M12 7v5l3 2"/>', decision: '<path d="M9 5H5v16h14V5h-4M9 3h6v4H9zM8 14l3 3 5-6"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', external: '<path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', book: '<path d="M12 5c-3-2-6-2-9 0v15c3-2 6-2 9 0 3-2 6-2 9 0V5c-3-2-6-2-9 0Zm0 0v15"/>', compare: '<path d="M8 3v18M16 3v18M3 8h10m-3-3 3 3-3 3M11 16h10m-3-3 3 3-3 3"/>' }[name] ?? ""}</svg>`;
const app = document.querySelector("#app");
const detailDialog = document.querySelector("#detail-dialog");
const utilityDialog = document.querySelector("#utility-dialog");
let data,
  baseline,
  workspace,
  seed,
  state,
  storageWarning = "",
  blockedCache = false,
  lastDiskHead = null,
  previewCommand = null,
  imported = false,
  selected = new Set(),
  pendingImport = null;
let filters = { query: "", lane: "", relationship: "", market: "" };
let view = ["opportunities", "evidence", "changes", "decisions"].includes(
  location.hash.slice(1),
)
  ? location.hash.slice(1)
  : "opportunities";
let noticeTimer;
function notify(message) {
  const node = document.querySelector("#notice");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => node.classList.remove("visible"), 6000);
}
function hydrate() {
  state = activeState(seed, workspace);
  data = materializeDataset(seed, workspace);
}
const reviewState = (_, p) => priorityStatus(state, p.id);
const decisionFor = (_, __, id) => ({
  ...seed.decisions.find((d) => d.id === id),
  ...state.decisions[id].value,
});
const relationshipLabel = (o) =>
  state.profile.mode === "fictional_demo"
    ? RELATIONSHIPS[o.relationship]
    : "Issuer relationship unverified";
function loadDisk() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : parseV2Import(raw);
}
function persist(next = workspace) {
  if (SHARED) {
    workspace = next;
    hydrate();
    return;
  }
  if (blockedCache)
    throw new Error(
      "Saved data is invalid and preserved. Archive/reset it in Workspace & data before saving.",
    );
  let raw, disk;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    storageWarning =
      "Browser storage is unavailable. Changes are in memory only; export before reload.";
  }
  if (raw !== undefined && raw !== null) {
    try {
      disk = parseV2Import(raw);
    } catch {
      blockedCache = true;
      throw new Error(
        "Saved data changed or is invalid. It is preserved; open Workspace & data to recover.",
      );
    }
  }
  if (
    disk &&
    (disk.workspace.id !== workspace.id ||
      workspaceHead(disk.workspace) !== lastDiskHead)
  )
    throw new Error(
      "Workspace changed in another tab. Reload latest before saving; your draft is retained.",
    );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exportV2(seed, next)));
    lastDiskHead = workspaceHead(next);
  } catch (error) {
    storageWarning =
      "Browser storage is unavailable. Changes are in memory only; export before reload.";
  }
  workspace = next;
  hydrate();
}
const withLock = (fn) =>
  navigator.locks
    ? navigator.locks.request("stable-desk-workspace-write", fn)
    : Promise.resolve().then(fn);
function archiveCurrent() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null)
    localStorage.setItem(
      `stable-desk:archive:${Date.now()}:${uid("BACKUP")}`,
      raw,
    );
  if (!blockedCache && workspaceHead(workspace) !== lastDiskHead)
    localStorage.setItem(
      `stable-desk:archive:${Date.now()}:${uid("BACKUP")}`,
      JSON.stringify(exportV2(seed, workspace)),
    );
}
function backups() {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("stable-desk:archive:"))
      .sort()
      .reverse()
      .map((key) => {
        try {
          const parsed = parseV2Import(localStorage.getItem(key));
          return {
            key,
            label: `${parsed.workspace.id} · ${parsed.workspace.events.length} events`,
          };
        } catch {
          return { key, label: "Unparsed recovery copy" };
        }
      });
  } catch {
    return [];
  }
}
function sourceIds(evidenceIds) {
  return [
    ...new Set(
      data.evidence
        .filter((e) => evidenceIds.includes(e.id))
        .flatMap((e) => e.sourceIds),
    ),
  ];
}
const orgNames = (ids) =>
  data.organizations
    .filter((o) => ids.includes(o.id))
    .map((o) => o.name)
    .join(" · ");
const refs = (ids) =>
  sourceIds(ids)
    .map(
      (id) =>
        `<button class="source-ref" data-source="${id}" aria-label="Inspect source ${id}">${id}</button>`,
    )
    .join("");
const pill = (text, tone = "") =>
  `<span class="pill ${tone}">${esc(text)}</span>`;
function sourceMarkup(source) {
  const fresh = sourceFreshness(seed, state, source.id);
  return `<article class="source-record" id="source-${esc(source.id)}"><div class="eyebrow">${esc(source.id)} · ${esc(source.publisher)} · Primary public source · market context</div><a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ${icon("external", 14)}</a><dl class="source-dates"><div><dt>Published</dt><dd>${formatDate(source.publishedAt)}</dd></div><div><dt>Event</dt><dd>${formatDate(source.eventDate)}</dd></div><div><dt>Baseline accessed</dt><dd>${formatDate(source.accessedAt)}</dd></div><div><dt>Last recorded check</dt><dd>${formatDate(fresh.lastChecked)}</dd></div></dl><p>${esc(source.dateNote)}</p><p class="muted small">Location: ${esc(source.locator)}</p><div class="source-actions">${pill(fresh.label, fresh.tone)}<span class="small muted">Next check ${formatDate(fresh.dueAt)} · ${esc(fresh.outcome.replaceAll("_", " "))}</span><button class="button" data-check-source="${esc(source.id)}">Record manual check</button></div></article>`;
}
function evidenceMarkup(ids) {
  return `<div class="evidence-ledger">${data.evidence
    .filter((e) => ids.includes(e.id))
    .map(
      (e) =>
        `<article class="evidence-record"><div class="evidence-top">${pill(EVIDENCE_TYPES[e.type], e.type)}<span class="mono muted">${esc(e.id)} · ${formatDate(e.asOf)} · ${esc(e.status)}</span></div><p>${esc(e.statement)}</p><button class="text-button" data-edit-evidence="${esc(e.id)}">Revise claim →</button><p class="muted small">${esc(e.scope)}</p><details><summary>${e.sourceRole === "context_only" ? "Context sources · not proof of demo fit" : "Supporting sources & checks"} ${refs(e.sourceIds.length ? [e.id] : [])}</summary><p class="small"><strong>Check coverage:</strong> ${esc(e.independentCheck)}</p>${e.sourceIds.map((id) => sourceMarkup(data.sources.find((s) => s.id === id))).join("")}</details></article>`,
    )
    .join("")}</div>`;
}
function dialogShell(title, body, eyebrow = "") {
  return `<div class="dialog-header"><div><div class="eyebrow">${esc(eyebrow)}</div><h2 id="detail-title">${esc(title)}</h2></div><button class="icon-button" data-close aria-label="Close details">${icon("close")}</button></div><div class="dialog-body">${body}</div>`;
}
function openDetail(html) {
  detailDialog.innerHTML = html;
  if (!detailDialog.open) detailDialog.showModal();
  detailDialog.scrollTop = 0;
}
function openOrg(id) {
  const o = data.organizations.find((o) => o.id === id);
  openDetail(
    dialogShell(
      o.name,
      `<div class="detail-tags">${pill(o.lane)}${pill(relationshipLabel(o), o.relationship)}${o.markets.map((m) => pill(m)).join("")}</div><p class="detail-lead">${esc(o.relevance)}</p><section class="detail-section"><h3>Issuer relationship</h3><p>${state.profile.mode === "fictional_demo" ? esc(o.relationshipSummary) : "Unverified. Profile settings and public market sources do not establish any issuer relationship."}</p><h3>Public market context</h3><p>${esc(o.publicContext)}</p>${refs(o.evidenceIds)}<p class="muted small">Products: ${esc(o.products.join(" · "))} · Record as of ${formatDate(o.asOf)}</p></section><section class="detail-section callout"><h3>Important uncertainty</h3><p>${esc(o.uncertainty)}</p></section><section class="detail-section"><h3>Next questions</h3><ol>${o.nextQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></section>${
        o.priorityIds.length
          ? `<section class="detail-section"><h3>Linked investigations</h3>${o.priorityIds
              .map((id) => {
                const p = data.priorities.find((p) => p.id === id);
                return `<button class="linked-row" data-priority="${id}"><span>${p.id} · ${esc(p.title)}</span>${icon("arrow")}</button>`;
              })
              .join("")}</section>`
          : '<p class="muted small">Public market reference; outside the three synthetic examples.</p>'
      }<section class="detail-section"><h3>Evidence & lineage</h3><p class="muted small">Public facts and company claims concern the original real products. Synthetic examples use those sources as context, not proof of demo-token fit.</p>${evidenceMarkup(o.evidenceIds)}</section>`,
      `Organization · ${o.id}`,
    ),
  );
}
function openPriority(id) {
  const p = data.priorities.find((p) => p.id === id),
    state = reviewState(data, p, null);
  const d = data.decisions.find((d) => d.priorityId === id);
  openDetail(
    dialogShell(
      p.title,
      `<div class="detail-tags">${pill("Synthetic example", "synthetic_example")}${pill(p.lane)}${pill(state.label, state.tone)}</div><p class="detail-lead">${esc(p.thesis)}</p><p class="muted">${esc(orgNames(p.organizationIds))}</p><section class="detail-section"><h3>Why investigate</h3><p>${esc(p.whyNow)}</p><p class="small"><strong>Baseline ${esc(p.confidence)} evidence confidence:</strong> ${esc(p.confidenceReason)}</p></section><section class="detail-section next-action"><div class="eyebrow">Concrete next step</div><p>${esc(p.nextAction)}</p><button class="button primary" data-decision="${d.id}">Review proposed decision ${icon("arrow", 16)}</button></section><div class="two-col"><section class="detail-section"><h3>Load-bearing assumptions</h3>${assumptionCards(activeState(seed, workspace), p.id)}</section><section class="detail-section"><h3>What could disprove it</h3><ul>${p.disproves.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section></div><section class="detail-section callout"><h3>Review status</h3><p>${esc(state.reason)}</p><p class="small muted">Each assumption has its own reviewed dependency revision. An evidence update never automatically endorses this proposal.</p></section><section class="detail-section"><h3>Sources → evidence → recommendation</h3><p class="muted small">${p.id} uses ${p.evidenceIds.join(", ")} as market context. These sources do not prove acceptance, demand or relationships for the fictional profile.</p>${evidenceMarkup(p.evidenceIds)}</section>`,
      `Investigation ${p.id} · Priority ${p.rank}`,
    ),
  );
}
function openDecision(id) {
  openDetail(
    dialogShell(
      "Review proposed decision",
      decisionForm(seed, state, id),
      `Decision ${id} · Saved in this browser`,
    ),
  );
  prepareForm();
}
function priorityCard(p) {
  const state = reviewState(data, p, null);
  return `<article class="priority-card"><div class="card-top"><span class="priority-rank">0${p.rank}</span><span class="eyebrow">${esc(p.lane)} · Example</span>${icon("arrow", 16)}</div><h3>${esc(p.title)}</h3><p>${esc(p.thesis)}</p><div class="card-bottom"><div class="org-line">${esc(orgNames(p.organizationIds))}</div><div class="card-evidence">${refs(p.evidenceIds)}<span class="review-dot ${state.tone}" title="${esc(state.reason)}">${esc(state.label)}</span></div><button class="card-link" data-priority="${p.id}">Open investigation <span class="sr-only">${esc(p.title)}</span>${icon("arrow", 15)}</button></div></article>`;
}
function opportunities() {
  return `<section aria-labelledby="priorities-title"><div class="section-heading"><h2 id="priorities-title">Three research examples to explore</h2><span class="muted small">Synthetic examples · market context only</span></div><div class="priority-grid">${[
    ...data.priorities,
  ]
    .sort((a, b) => a.rank - b.rank)
    .map(priorityCard)
    .join(
      "",
    )}</div></section><section class="organization-section" aria-labelledby="organizations-title"><div class="section-heading"><div><h2 id="organizations-title">Ecosystem map <span class="count">${data.organizations.length}</span></h2><p class="muted small">Real organizations and public products. All fit questions are synthetic.</p></div><button class="button subtle" data-utility="coverage">${icon("book", 16)} Evidence coverage</button></div><div class="filter-bar"><label class="search-label">${icon("search")}<span class="sr-only">Search organizations and evidence</span><input id="search" type="search" placeholder="Search organizations, markets, evidence…" value="${esc(filters.query)}" /></label><label><span class="sr-only">Filter by opportunity lane</span><select id="lane-filter"><option value="">All opportunities</option>${LANES.map((l) => `<option ${filters.lane === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label><label><span class="sr-only">Filter by relationship</span><select id="relationship-filter"><option value="">All relationships</option>${Object.entries(
    RELATIONSHIPS,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}" ${filters.relationship === k ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join(
      "",
    )}</select></label><label><span class="sr-only">Filter by market</span><select id="market-filter"><option value="">All markets</option>${[
    ...new Set(data.organizations.flatMap((o) => o.markets)),
  ]
    .sort()
    .map(
      (m) =>
        `<option ${filters.market === m ? "selected" : ""}>${esc(m)}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div id="org-results"></div></section><aside class="method-note">${icon("book", 18)}<p><strong>Evidence before expansion.</strong> Token supply and onchain volume do not establish payment adoption. Listings and announcements do not establish executable liquidity.</p></aside>`;
}
function renderResults() {
  const results = document.querySelector("#org-results");
  if (!results) return;
  const orgs = filterOrganizations(data, filters);
  results.innerHTML = `<div class="result-info"><span role="status">${orgs.length} of ${data.organizations.length} organizations</span><button class="text-button" data-clear-filters>Clear filters</button></div>${orgs.length ? `<div class="table-wrap"><table class="org-table"><thead><tr><th class="check-col"><span class="sr-only">Compare</span></th><th>Organization</th><th>Opportunity</th><th>Demo relationship</th><th>Next question</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${orgs.map((o) => `<tr><td class="check-col"><input type="checkbox" data-compare="${o.id}" aria-label="Compare ${esc(o.name)}" ${selected.has(o.id) ? "checked" : ""} /></td><td><button class="org-button" data-org="${o.id}"><span class="monogram ${o.id}">${esc(o.shortName)}</span><span><strong>${esc(o.name)}</strong><small>${esc(o.markets.join(" · "))}</small></span></button></td><td><span class="lane-label">${esc(o.lane)}</span>${o.priorityIds.map((id) => `<span class="tiny-priority">${id}</span>`).join("")}</td><td>${pill(relationshipLabel(o), o.relationship)}<small class="muted relationship-hint">${state.profile.mode === "fictional_demo" ? "Fictional profile" : "Unverified profile"}</small></td><td class="question-cell">${esc(o.nextQuestions[0])}</td><td><button class="icon-button" data-org="${o.id}" aria-label="Open ${esc(o.name)} details">${icon("arrow", 16)}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">${icon("search", 30)}<h3>No matching organizations</h3><p>Try a broader term or clear the filters.</p><button class="button" data-clear-filters>Clear filters</button></div>`}<div class="compare-bar ${selected.size ? "active" : ""}"><span>${selected.size} selected · up to 3</span><div><button class="text-button" data-clear-compare>Clear</button><button class="button primary" data-open-compare ${selected.size < 2 ? "disabled" : ""}>${icon("compare", 16)} Compare selected</button></div></div>`;
}
function changes() {
  return `<div class="view-intro"><h2>Baseline and committed research history</h2><p>This generic dataset starts a new scope on ${formatDate(data.meta.asOf)}. Prior project content remains in Git history; this view does not simulate monitored changes.</p></div><div class="changes-layout"><section><div class="section-heading"><h2>Versioned research log</h2>${pill("Manual collection")}</div>${data.changes.map((c) => `<article class="change-record"><div class="timeline-dot"></div><div class="eyebrow">${formatDate(c.recordedAt)} · ${c.kind === "baseline" ? "Baseline" : "Manual update"}</div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><p class="small muted">${c.before ? `${esc(c.before)} → ` : "First version · "}${esc(c.after)}</p>${refs(c.evidenceIds)}<div class="change-actions">${c.priorityIds.map((id) => `<button class="text-button" data-priority="${id}">Inspect ${id} ${icon("arrow", 14)}</button>`).join("")}</div></article>`).join("")}<div class="section-heading local-heading"><h2>Local revision history</h2><span class="muted small">This browser only</span></div>${historyMarkup(workspace, workspace.activeProfileId)}${state.legacy ? `<details class="legacy-history"><summary>Preserved generic v1 activity (${state.legacy.activity.length})</summary>${state.legacy.activity.map((a) => `<p>${esc(a.at)} · ${esc(a.summary)}</p>`).join("")}</details>` : ""}</section><aside class="panel"><div class="eyebrow">Evidence boundaries</div><h3>What the baseline cannot prove</h3><article><h4>Product support ≠ demo acceptance</h4><p>Published token and region restrictions apply to real products. ${esc(data.profile.ticker)} has no issuer or supported integration.</p>${refs(["E-G02", "E-G04"])}</article><article><h4>Announcement ≠ current availability</h4><p>Historical pilots and beta products need fresh scope checks before a real recommendation.</p>${refs(["E-G05", "E-G10"])}</article><article><h4>Pool value ≠ executable depth</h4><p>Active liquidity depends on price range. There are no demo-token quotes or pools.</p>${refs(["E-G09"])}<button class="text-button" data-priority="P-G03">Inspect liquidity example ${icon("arrow", 14)}</button></article></aside></div>`;
}
function decisions() {
  return `<div class="view-intro"><h2>Turn research into a clear next step</h2><p>Three synthetic research examples. Record reasoning and review assumptions when their market context changes.</p></div><div class="local-banner">${icon("decision", 20)}<div><strong>Assessments are saved in this browser.</strong><p>Export a workspace backup to transfer it. Examples remain synthetic across profiles; eligibility and relationships require evidence.</p></div></div><div class="decision-list">${data.decisions
    .map((base) => {
      const d = decisionFor(data, workspace, base.id),
        p = data.priorities.find((p) => p.id === d.priorityId),
        state = decisionStatus(seed, activeState(seed, workspace), base.id);
      return `<article class="decision-card"><div class="decision-meta"><span class="mono">${d.id}</span>${pill("Synthetic example", "synthetic_example")}${pill(d.status)}${pill(state.label, state.tone)}</div><div class="decision-content"><div><h3>${esc(d.proposal)}</h3><p>${esc(d.rationale)}</p>${d.notes ? `<p class="saved-note"><strong>Local note:</strong> ${esc(d.notes)}</p>` : ""}<div class="decision-facts"><span>Owner <strong>${esc(d.owner)}</strong></span><span>Review by <strong>${formatDate(d.reviewBy)}</strong></span><span>Evidence ${refs(d.evidenceIds)}</span></div></div><button class="button" data-decision="${d.id}">Review assessment ${icon("arrow", 16)}</button></div></article>`;
    })
    .join("")}</div>`;
}
function evidenceView() {
  return `<div class="view-intro"><h2>Maintain evidence, one review at a time</h2><p>Open the original page yourself. Record checks, revise scope-qualified claims and inspect their exact dependencies. No source is collected automatically.</p></div><div class="utility-actions"><button class="button primary" data-add-evidence>Add evidence</button><button class="button" data-add-source>Add original source</button></div><div class="evidence-workbench"><section><div class="section-heading"><h2>Claim ledger</h2><span class="muted small">${data.evidence.length} records · active, unknown or withdrawn</span></div><label class="search-label">${icon("search")}<span class="sr-only">Search evidence ledger</span><input id="evidence-search" type="search" placeholder="Search claim text, IDs or scope…" /></label><div id="evidence-results">${evidenceMarkup(data.evidence.map((e) => e.id))}</div></section><aside><div class="section-heading"><h2>Source checks</h2>${pill("Manual only")}</div>${data.sources.map(sourceMarkup).join("")}</aside></div>`;
}
function render() {
  const titles = {
    opportunities: [
      `Where could ${data.profile.ticker} fit?`,
      "Explore distribution, issuer design and liquidity through a fictional stablecoin profile.",
    ],
    evidence: [
      "What supports the assessment?",
      "Manual checks, claim revisions and explicit assumption dependencies.",
    ],
    changes: [
      "What changed, and what needs a second look?",
      "A dated baseline and an honest record of manual research updates.",
    ],
    decisions: [
      "What should happen next?",
      "Proposed investigations, explicit assumptions, and a record of your assessment.",
    ],
  };
  const overdue = data.priorities.filter(
    (p) => reviewState(data, p, null).tone === "warn",
  ).length;
  app.innerHTML = `<div class="desk-shell"><aside class="sidebar"><a class="brand" href="#opportunities"><span class="brand-mark"><i></i><i></i><i></i></span><span>Stable <span class="brand-light">Desk</span><small>ECOSYSTEM RESEARCH</small></span></a><div class="workspace-label">GENERIC RESEARCH WORKSPACE</div><nav aria-label="Desk views">${[
    ["opportunities", "Opportunities", "grid"],
    ["evidence", "Evidence", "book"],
    ["changes", "Changes", "change"],
    ["decisions", "Decisions", "decision"],
  ]
    .map(
      ([id, label, i]) =>
        `<a href="#${id}" class="nav-link ${view === id ? "active" : ""}" ${view === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span>${id === "decisions" ? `<span class="nav-count" aria-hidden="true">${data.decisions.length}</span>` : ""}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-context"><div class="eyebrow">Research focus</div><span class="focus-token">◇</span><h3>${esc(data.profile.name)}</h3><p>${esc(data.profile.ticker)} · ${data.profile.mode === "fictional_demo" ? "Fictional placeholder" : "Research subject · unverified"}</p></div><div class="sidebar-bottom"><span class="manual-dot"></span><strong>Manual research desk</strong><p>No recurring collection or live refresh.</p><button data-utility="method" class="sidebar-help">How to update the desk ${icon("arrow", 14)}</button><div class="profile"><span>SD</span><div>Demo workspace<small>Public market context</small></div></div></div></aside><div class="main-shell"><header class="topbar"><span>Research desk <span class="breadcrumb">/ ${view[0].toUpperCase() + view.slice(1)}</span></span><div class="topbar-right"><button class="button profile-switch" data-profiles>${esc(state.profile.name)}</button><span class="baseline-chip"><span></span>${imported ? "Imported" : "Versioned"} baseline</span><button class="icon-button" data-utility="workspace" aria-label="Workspace backup and import">${icon("download")}</button></div></header><main id="main"><div class="page-heading"><div><div class="eyebrow">${esc(data.profile.ticker)} · ${data.profile.mode === "fictional_demo" ? "FICTIONAL DEMO" : "RESEARCH SUBJECT · UNVERIFIED"}</div><h1>${titles[view][0]}</h1><p>${titles[view][1]}</p></div><button class="button" data-export>${icon("download", 16)} Export workspace</button></div><div class="baseline-line"><span>AS OF <strong>${formatDate(data.meta.asOf)}</strong></span><span class="line-divider"></span><span>${esc(data.meta.version)}</span><span class="baseline-caption">${overdue ? `${overdue} proposal${overdue > 1 ? "s" : ""} need review` : "Baseline market context · manual revisions"}</span></div>${overdue ? `<div class="stale-banner" role="status">${overdue} proposal${overdue > 1 ? "s" : ""} require assumption review. Inspect their status in Decisions.</div>` : ""}<aside class="demo-banner" data-demo-notice><strong>${esc(data.profile.name)} (${esc(data.profile.ticker)}) ${data.profile.mode === "fictional_demo" ? "is fictional." : "is an unverified research subject."}</strong><span>${data.profile.mode === "fictional_demo" ? "No real issuer, deployed token, reserves or partners." : "Intended settings establish no issuance, eligibility, deployment or partnerships."} Public sources describe real market products; example fit remains synthetic.</span></aside>${storageWarning || blockedCache ? `<div class="storage-banner" role="alert">${esc(blockedCache ? "Saved data is invalid and preserved. Recover it in Workspace & data before saving." : storageWarning)}<button class="text-button" data-reload-latest>Load latest saved workspace</button></div>` : ""}<div class="stats-strip"><div><strong>${data.organizations.length.toString().padStart(2, "0")}</strong><span>Organizations mapped</span></div><div><strong>${data.sources.length.toString().padStart(2, "0")}</strong><span>Primary sources</span></div><div><strong>${data.priorities.length.toString().padStart(2, "0")}</strong><span>Synthetic research examples</span></div><div><strong>${data.changes.length.toString().padStart(2, "0")}</strong><span>Baseline versions logged</span></div></div>${view === "opportunities" ? opportunities() : view === "evidence" ? evidenceView() : view === "changes" ? changes() : decisions()}<footer class="footer"><span>Stable Desk · Built for deliberate ecosystem research</span><button class="text-button" data-utility="workspace">Workspace & data ${icon("arrow", 14)}</button></footer></main></div></div>`;
  renderResults();
  const footer = app.querySelector(".footer");
  if (footer)
    footer.insertAdjacentHTML(
      "beforeend",
      '<a href="./pilot.html">v3 review pilot →</a>',
    );
  if (SHARED)
    app
      .querySelector(".baseline-line")
      .insertAdjacentHTML(
        "afterend",
        `<div class="storage-banner" role="status">${sharedFixture ? "Local fixture · " : ""}Shared persistent workspace · version ${sharedPilot.version}. Monitoring and reviews are in the <a href="./pilot.html">review inbox</a>. Local v2 work is untouched.</div>`,
      );
}
function openUtility(mode) {
  if (SHARED && mode === "workspace") {
    utilityDialog.innerHTML = `<div class="dialog-header"><h2 id="utility-title">Shared workspace & recovery</h2><button class="icon-button" data-close aria-label="Close workspace">${icon("close")}</button></div><div class="dialog-body"><p>Shared version ${sharedPilot.version}. Local v2 keys, notes and recovery copies remain untouched. Import/reset are available only in the local desk; shared initialization never overwrites existing work.</p><button class="button" data-export>Export adopted v2 workspace</button><button class="button" data-reload-latest>Load latest shared work</button><p><a href="./pilot.html">Review inbox, full pilot backup and recovery history →</a></p></div>`;
    utilityDialog.showModal();
    return;
  }
  const coverage = `<p class="detail-lead">${esc(data.meta.coverage)}</p><div class="legend">${Object.values(
    EVIDENCE_TYPES,
  )
    .map((v, i) => pill(v, Object.keys(EVIDENCE_TYPES)[i]))
    .join(
      "",
    )}</div><p>Verified facts establish source content and announcement existence. Performance, launch and availability claims retain company attribution. Synthetic examples are constructed hypotheses; their sources provide market context only.</p><p>The demo has no issuer relationships. Real company-to-company context keeps original names and dates. Token supply, aggregate onchain transfers and card spend do not establish payment adoption.</p><h3>Source coverage</h3><p class="small muted">${data.sources.length} primary sources · baseline as of ${formatDate(data.meta.asOf)} · local check dates shown separately.</p>${data.sources.map(sourceMarkup).join("")}`;
  const method = `<p class="detail-lead">A manual research loop with an inspectable revision trail.</p><ol class="method-steps"><li><strong>Configure a subject.</strong> Keep the fictional placeholder or deliberately enable real research mode. Settings never establish partnerships.</li><li><strong>Review an original source.</strong> In Evidence, record unchanged, unreachable or content revised. A failed check leaves its coverage unresolved; it does not change the claim.</li><li><strong>Preview claim revisions.</strong> Compare old/new values and exact affected assumptions before committing. Add evidence with explicit dependencies.</li><li><strong>Reconsider assumptions and decisions.</strong> Record reasoning against current revisions. Changed or withdrawn evidence requires review and preserves the previous decision.</li><li><strong>Back up the full record.</strong> Export profiles, evidence, decisions and events. Imports validate replay and reject divergent history. Local drafts recover interrupted editing.</li></ol><p>Reload loads saved data. It does not fetch sources. No recurring collection or AI chat is implemented. This local audit record is not cryptographically tamper-proof.</p><p><a href="./docs/UPDATING.md" target="_blank">Update guide</a> · <a href="./docs/PRIORITIES.md" target="_blank">Priority brief</a> · <a href="./docs/V2_PLAN.md" target="_blank">Release scope and next gates</a></p>`;
  const local = `<p class="detail-lead">Local profiles, manual evidence and revision-bound decisions.</p><p>Public information only. Nothing is submitted to a service. Storage is browser-local, with no automatic backup or collaboration sync. Drafts are separate from committed history and exports.</p><div class="utility-actions"><button class="button primary" data-export>${icon("download", 16)} Export full workspace</button><a class="button" href="./data/baseline.json" download="stable-desk-baseline.json">Download repository baseline</a><button class="button" data-profiles>Manage profiles</button></div><section class="detail-section"><h3>Restore or incorporate a workspace</h3><p class="small muted">Import a validated generic JSON baseline or v1/v2 workspace, up to 4 MB. A different workspace archives the current saved copy before opening. Same-identity histories must be a matching prefix; divergent revisions are rejected.</p><label class="file-label">Choose JSON file<input type="file" id="import-file" accept=".json,application/json" /></label><div id="import-preview" role="status"></div><div id="import-error" class="error" role="alert"></div></section><section class="detail-section"><h3>Recovery copies</h3><p>Restore a copy through the same validated import preview. Current work is archived before replacement.</p>${
    backups()
      .map(
        (b) =>
          `<button class="linked-row" data-backup="${esc(b.key)}">${esc(b.label)}</button>`,
      )
      .join("") || '<p class="muted small">No recovery copies yet.</p>'
  }${blockedCache ? '<button class="button" data-export-raw>Download unparsed saved data</button>' : ""}</section><section class="detail-section"><h3>Start from the repository baseline</h3><p class="small muted">Archives saved work first. Existing generic v1 storage and drafts remain preserved separately.</p><button class="button" data-reset>Reset local workspace</button></section><p><a href="./docs/ARCHITECTURE.md" target="_blank">Architecture & limitations</a></p>`;
  utilityDialog.innerHTML = `<div class="dialog-header"><div><div class="eyebrow">Research method</div><h2 id="utility-title">${mode === "coverage" ? "Evidence coverage" : mode === "method" ? "How to update the desk" : "Workspace & data"}</h2></div><button class="icon-button" data-close aria-label="Close workspace dialog">${icon("close")}</button></div><div class="dialog-body">${mode === "coverage" ? coverage : mode === "method" ? method : local}</div>`;
  pendingImport = null;
  if (!utilityDialog.open) utilityDialog.showModal();
  utilityDialog.scrollTop = 0;
}
function openCompare() {
  const orgs = data.organizations.filter((o) => selected.has(o.id));
  const fields = [
    ["Lane", (o) => esc(o.lane)],
    [
      "Markets / products",
      (o) =>
        `${esc(o.markets.join(" · "))}<p>${esc(o.products.join(" · "))}</p>`,
    ],
    [
      "Demo relationship",
      (o) =>
        `${pill(relationshipLabel(o), o.relationship)}<p>${state.profile.mode === "fictional_demo" ? esc(o.relationshipSummary) : "Unverified; no commercial eligibility inferred."}</p>`,
    ],
    ["Public market context", (o) => esc(o.publicContext)],
    ["Synthetic fit question", (o) => esc(o.relevance)],
    ["Important uncertainty", (o) => esc(o.uncertainty)],
    [
      "Next questions",
      (o) =>
        `<ul>${o.nextQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>`,
    ],
    ["Supporting sources", (o) => refs(o.evidenceIds)],
    ["As of", (o) => formatDate(o.asOf)],
  ];
  openDetail(
    dialogShell(
      "Compare ecosystem fit",
      `<p class="muted small">Real market context · fictional-profile fit questions · no commercial ranking.</p><div class="comparison-grid" style="--compare-count:${orgs.length}"><div class="compare-label"></div>${orgs.map((o) => `<h3 class="compare-title">${esc(o.name)}</h3>`).join("")}${fields.map(([label, fn]) => `<div class="compare-label">${label}</div>${orgs.map((o) => `<div class="compare-value">${fn(o)}</div>`).join("")}`).join("")}</div>`,
      `${orgs.length} organizations`,
    ),
  );
}
function downloadJSON(value, name) {
  const blob = new Blob(
    [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportWorkspace() {
  downloadJSON(
    exportV2(seed, workspace),
    `stable-desk-workspace-${data.meta.asOf}.json`,
  );
  notify(
    "Exported profiles, evidence revisions, decisions and full committed history. Drafts remain in this browser.",
  );
}
// WORKFLOW_CONTROLLER
function showEditor(title, markup) {
  openDetail(
    dialogShell(
      title,
      SHARED
        ? markup.replace("Save local assessment", "Save shared assessment")
        : markup,
      SHARED
        ? "Manual research · shared workspace"
        : "Manual research · local draft",
    ),
  );
  prepareForm();
  if (SHARED) {
    const reviewer = detailDialog.querySelector('[name="actor"]');
    if (reviewer) {
      reviewer.value = "Signed-in pilot account";
      reviewer.readOnly = true;
    }
  }
}
function openProfiles() {
  const profiles = Object.values(projectWorkspace(seed, workspace).profiles);
  openDetail(
    dialogShell(
      "Research profiles",
      `<p>Each profile has independent local claim revisions, checks, assumptions and decisions. A new profile starts from shared public baseline context, without another profile's notes or local endorsements.</p><div class="profile-list">${profiles.map((s) => `<article><h3>${esc(s.profile.name)} (${esc(s.profile.ticker)})</h3><p class="small muted">${esc(s.profile.mode)} · ${esc(s.profile.id)}</p><button class="button" data-switch-profile="${esc(s.profile.id)}" ${s.profile.id === workspace.activeProfileId ? "disabled" : ""}>${s.profile.id === workspace.activeProfileId ? "Active profile" : "Open profile"}</button></article>`).join("")}</div><div class="utility-actions"><button class="button primary" data-new-profile>Create independent profile</button><button class="button" data-edit-profile>Edit active profile</button></div><p class="small muted">All seeded opportunity fit remains synthetic. No setting creates a verified issuer relationship.</p>`,
    ),
  );
}
function draftKey(form) {
  return `${workspace.id}:${workspace.activeProfileId}:${form.id}:${form.dataset.new === "true" || form.id === "source-add-form" ? "new" : form.dataset.record}`;
}
function readDrafts() {
  if (SHARED) return sharedDrafts;
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) ?? {};
  } catch {
    return {};
  }
}
function formValues(form) {
  const values = {};
  for (const [name, value] of new FormData(form))
    (values[name] ??= []).push(value);
  return values;
}
function saveDraft(form) {
  if (!form?.dataset.op) return;
  try {
    const drafts = readDrafts();
    drafts[form.dataset.draftKey] = {
      values: formValues(form),
      record: form.dataset.record,
      expected: form.dataset.expected,
      head: form.dataset.head,
      op: form.dataset.op,
      savedAt: new Date().toISOString(),
    };
    if (!SHARED) localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    form.querySelector(".draft-note").textContent = SHARED
      ? "Shared draft retained in memory only; export/save before closing."
      : "Draft saved in this browser; not part of committed history.";
  } catch {
    form.querySelector(".draft-note").textContent =
      "Draft is in memory only; browser storage is unavailable.";
  }
}
function prepareForm() {
  const form = detailDialog.querySelector("form");
  if (!form) return;
  for (const field of form.querySelectorAll(
    'input:not([type="checkbox"]),select,textarea',
  )) {
    const label = field.closest("label");
    if (label) {
      const text = label.cloneNode(true);
      text
        .querySelectorAll("input,select,textarea")
        .forEach((node) => node.remove());
      field.setAttribute("aria-label", text.textContent.trim());
    }
  }
  form.dataset.head = workspaceHead(workspace);
  form.dataset.op = uid("OP");
  form.dataset.draftKey = draftKey(form);
  previewCommand = null;
  const draft = readDrafts()[form.dataset.draftKey];
  if (!draft) return;
  form.dataset.record = draft.record;
  form.dataset.expected = draft.expected;
  form.dataset.head = draft.head;
  form.dataset.op = draft.op;
  for (const field of form.elements) {
    if (!field.name || field.disabled) continue;
    const values = draft.values[field.name] ?? [];
    if (field.type === "checkbox") field.checked = values.includes(field.value);
    else field.value = values[0] ?? "";
  }
  form.querySelector(".draft-note").textContent =
    "Recovered an interrupted draft. Check the current basis before committing.";
  if (draft.head !== workspaceHead(workspace))
    formError(
      form,
      new Error(
        "This draft uses an older workspace revision. Load the latest basis and preview again.",
      ),
    );
}
function clearDraft(form) {
  try {
    const drafts = readDrafts();
    delete drafts[form.dataset.draftKey];
    if (!SHARED) localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    /* Saved operation IDs make a retained draft retry idempotent. */
  }
}
function formError(form, error) {
  const node = form.querySelector(".workflow-error");
  node.innerHTML = `${esc(error.message)} <button class="text-button" type="button" data-rebase-draft>Use latest basis and preview again</button>`;
  const decision = form.querySelector("#decision-error");
  if (decision) decision.textContent = error.message;
}
function commandFor(form) {
  const fields = new FormData(form),
    get = (name) => String(fields.get(name) ?? "").trim(),
    array = (name) => fields.getAll(name),
    split = (name) =>
      get(name)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
  const cmd = {
    profileId: workspace.activeProfileId,
    recordId: form.dataset.record,
    expectedRevision: form.dataset.expected,
    expectedHead: form.dataset.head,
    opId: form.dataset.op,
    actor: get("actor"),
    rationale: get("rationale"),
  };
  if (form.id === "profile-form") {
    cmd.type =
      form.dataset.new === "true" ? "profile_created" : "profile_update";
    cmd.profileId = form.dataset.record;
    cmd.after = {
      id: form.dataset.record,
      name: get("name"),
      ticker: get("ticker"),
      mode: get("mode"),
      issuer: get("issuer") || null,
      currency: get("currency") || null,
      markets: split("markets"),
      networks: split("networks"),
      useCase: get("useCase") || null,
      constraints: get("constraints")
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean),
    };
    cmd.confirmedResearchMode = fields.has("confirmedResearchMode");
  } else if (form.id === "source-check-form") {
    cmd.type = "source_check";
    cmd.after = {
      sourceId: cmd.recordId,
      outcome: get("outcome"),
      checkedAt: get("checkedAt"),
      reviewDays: Number(get("reviewDays")),
      note: cmd.rationale,
      evidenceRevisionIds: [],
    };
  } else if (form.id === "evidence-form") {
    const isNew = form.dataset.new === "true";
    cmd.type = isNew ? "evidence_added" : "evidence_revision";
    const original = isNew ? {} : state.evidence[cmd.recordId]?.value;
    cmd.after = {
      ...original,
      id: cmd.recordId,
      type: isNew ? get("type") : original.type,
      statement: get("statement"),
      status: get("status"),
      scope: get("scope"),
      independentCheck: get("independentCheck"),
      sourceIds: array("sourceIds"),
      sourceRole:
        (isNew ? get("type") : original.type) === "synthetic_example"
          ? "context_only"
          : "supports_statement",
      subject:
        (isNew ? get("type") : original.type) === "synthetic_example"
          ? "fictional_profile"
          : "public_market",
      organizationIds: array("organizationIds"),
      asOf: get("asOf"),
    };
    if (isNew) cmd.assumptionIds = array("assumptionIds");
    if (fields.has("recordCheck"))
      cmd.check = {
        sourceId: get("checkSourceId"),
        checkedAt: get("checkedAt"),
        reviewDays: Number(get("reviewDays")),
        note: cmd.rationale,
      };
  } else if (form.id === "source-add-form") {
    cmd.type = "source_added";
    cmd.after = {
      id: cmd.recordId,
      title: get("title"),
      publisher: get("publisher"),
      url: get("url"),
      kind: "primary",
      publishedAt: get("publishedAt") || null,
      eventDate: get("eventDate") || null,
      accessedAt: get("accessedAt"),
      locator: get("locator"),
      dateNote: get("dateNote"),
    };
  } else if (form.id === "assumption-form") {
    cmd.type = "assumption_update";
    cmd.after = {
      ...state.assumptions[cmd.recordId].value,
      statement: get("statement"),
      evidenceIds: array("evidenceIds"),
    };
  } else if (form.id === "decision-form") {
    cmd.type = "decision_saved";
    cmd.after = {
      status: get("status"),
      owner: get("owner"),
      reviewBy: get("reviewBy"),
      notes: get("notes"),
    };
    cmd.rationale = cmd.after.notes;
    if (!cmd.after.notes)
      throw new Error(
        "Add a note explaining your assessment or assumption review.",
      );
    cmd.assumptionIds = fields.has("reviewed")
      ? Object.values(state.assumptions)
          .filter(
            (a) =>
              a.value.priorityId ===
              seed.decisions.find((d) => d.id === cmd.recordId).priorityId,
          )
          .map((a) => a.value.id)
      : array("assumptionIds");
  } else throw new Error("Unsupported editor.");
  return cmd;
}
async function commitForm(form, command) {
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    if (SHARED) {
      const result = await requestPilot("operate", {
        type: "command",
        opId: `SHARED-${command.opId}`,
        expectedVersion: sharedPilot.version,
        command,
      });
      sharedPilot = result.pilot;
      const restored = parseV2Import(JSON.stringify(sharedPilot.desk));
      seed = restored.seed;
      workspace = restored.workspace;
      hydrate();
      clearDraft(form);
      detailDialog.close();
      render();
      notify("Committed shared revision. Other devices can load latest.");
      return;
    }
    await withLock(() => {
      const result = commitOperation(seed, workspace, command);
      persist(result.workspace);
      if (command.type === "profile_created") {
        workspace.activeProfileId = command.profileId;
        persist();
      }
    });
    clearDraft(form);
    detailDialog.close();
    render();
    notify(
      storageWarning || "Committed local revision. Export to keep a backup.",
    );
  } catch (error) {
    if (SHARED && error.status === 401) {
      lockShared();
      return;
    }
    formError(form, error);
  } finally {
    submit.disabled = false;
  }
}
function previewImport(text) {
  pendingImport = null;
  const candidate = parseV2Import(text);
  let action = "Open separately; archive current saved work first.";
  if (candidate.workspace.id === workspace.id) {
    candidate.workspace = mergeWorkspace(seed, workspace, candidate.workspace);
    action =
      "Matching history: retain every existing event and accept a valid continuation.";
  }
  pendingImport = candidate;
  const projected = activeState(candidate.seed, candidate.workspace);
  const changed = candidate.seed.priorities.filter(
    (p) => priorityStatus(projected, p.id).tone === "warn",
  );
  document.querySelector("#import-error").textContent = "";
  document.querySelector("#import-preview").innerHTML =
    `<div class="import-summary"><strong>Validated ${esc(candidate.seed.meta.version)}</strong><p>${candidate.seed.organizations.length} organizations · ${Object.keys(projected.sources).length} sources · ${candidate.workspace.events.length} committed events</p><p>${changed.length} proposals need assumption review.</p><p>${esc(action)} ${candidate.migrated ? "Generic v1 notes/history preserved; reviews need an explicit v2 basis." : ""}</p><button class="button primary" data-apply-import>Use in this browser</button></div>`;
}
async function replaceWorkspace(candidate) {
  await withLock(() => {
    if (!blockedCache) {
      const disk = loadDisk();
      if (
        disk &&
        (disk.workspace.id !== workspace.id ||
          workspaceHead(disk.workspace) !== lastDiskHead)
      )
        throw new Error(
          "Saved workspace changed in another tab. Load latest before replacing.",
        );
    }
    archiveCurrent(); // If backup or write fails, leave the active workspace intact.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(exportV2(candidate.seed, candidate.workspace)),
    );
    seed = candidate.seed;
    workspace = candidate.workspace;
    lastDiskHead = workspaceHead(workspace);
    blockedCache = false;
    storageWarning = "";
    imported = canonical(seed) !== canonical(baseline);
    hydrate();
    selected.clear();
    filters = { query: "", lane: "", relationship: "", market: "" };
  });
  utilityDialog.close();
  detailDialog.close();
  render();
  notify(
    "Opened validated workspace. Previous saved copy is available in recovery copies.",
  );
}
async function reloadLatest() {
  if (SHARED) {
    try {
      const result = await requestPilot("state");
      if (!result.pilot)
        throw new Error("Initialize shared work in the review pilot first.");
      sharedPilot = result.pilot;
      sharedFixture = result.fixture === true;
      const restored = parseV2Import(JSON.stringify(sharedPilot.desk));
      seed = restored.seed;
      workspace = restored.workspace;
      hydrate();
      render();
    } catch (error) {
      if (error.status === 401) lockShared();
      throw error;
    }
    return;
  }
  const candidate = loadDisk();
  if (!candidate)
    throw new Error(
      "No saved workspace is available. Export your in-memory work first.",
    );
  seed = candidate.seed;
  workspace = candidate.workspace;
  lastDiskHead = workspaceHead(workspace);
  blockedCache = false;
  storageWarning = "";
  hydrate();
  render();
}
document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  try {
    if (target.hasAttribute("data-close")) {
      target.closest("dialog").close();
      return;
    }
    if (target.dataset.org) openOrg(target.dataset.org);
    if (target.dataset.priority) openPriority(target.dataset.priority);
    if (target.dataset.decision) openDecision(target.dataset.decision);
    if (target.dataset.source) {
      const s = state.sources[target.dataset.source].value;
      openDetail(dialogShell(s.title, sourceMarkup(s), `Source ${s.id}`));
    }
    if (target.dataset.utility) openUtility(target.dataset.utility);
    if (target.hasAttribute("data-export")) exportWorkspace();
    if (target.hasAttribute("data-export-raw"))
      downloadJSON(
        localStorage.getItem(STORAGE_KEY),
        "stable-desk-recovery-raw.json",
      );
    if (target.hasAttribute("data-clear-filters")) {
      filters = { query: "", lane: "", relationship: "", market: "" };
      render();
    }
    if (target.hasAttribute("data-clear-compare")) {
      selected.clear();
      renderResults();
    }
    if (target.hasAttribute("data-open-compare")) openCompare();
    if (target.hasAttribute("data-profiles")) openProfiles();
    if (target.hasAttribute("data-new-profile"))
      showEditor("Create independent profile", profileForm(state, true));
    if (target.hasAttribute("data-edit-profile"))
      showEditor("Edit active profile", profileForm(state));
    if (target.dataset.switchProfile) {
      await withLock(() =>
        persist({
          ...workspace,
          activeProfileId: target.dataset.switchProfile,
        }),
      );
      detailDialog.close();
      render();
    }
    if (target.dataset.checkSource)
      showEditor(
        "Record manual source check",
        sourceCheckForm(seed, state, target.dataset.checkSource),
      );
    if (target.dataset.editEvidence)
      showEditor(
        `Revise evidence ${target.dataset.editEvidence}`,
        evidenceForm(seed, state, target.dataset.editEvidence),
      );
    if (target.hasAttribute("data-add-evidence"))
      showEditor("Add evidence", evidenceForm(seed, state));
    if (target.hasAttribute("data-add-source"))
      showEditor("Add original source", newSourceForm());
    if (target.dataset.editAssumption)
      showEditor(
        "Edit assumption & dependencies",
        assumptionForm(state, target.dataset.editAssumption),
      );
    if (target.dataset.history)
      openDetail(
        dialogShell(
          "Decision revision history",
          historyMarkup(
            workspace,
            workspace.activeProfileId,
            target.dataset.history,
          ),
          target.dataset.history,
        ),
      );
    if (target.dataset.event) {
      const e = workspace.events.find((e) => e.id === target.dataset.event);
      openDetail(
        dialogShell(
          "Inspect committed event",
          `<p class="mono">${esc(e.id)} · operation ${esc(e.opId)}</p><p>Reviewer ${esc(e.actor)} · ${esc(e.at)}</p><p>${esc(e.rationale)}</p><p class="small">Profile ${esc(e.profileId)} · previous record revision ${esc(e.expectedRevision)}</p><div class="two-col"><section><h3>Before</h3><pre>${esc(JSON.stringify(e.before, null, 2))}</pre></section><section><h3>After</h3><pre>${esc(JSON.stringify(e.after, null, 2))}</pre></section></div>`,
          `${e.type} · ${e.recordId}`,
        ),
      );
    }
    if (target.hasAttribute("data-commit-revision") && previewCommand)
      await commitForm(target.closest("form"), previewCommand);
    if (target.hasAttribute("data-reload-latest")) {
      await reloadLatest();
      detailDialog.close();
      utilityDialog.close();
      notify("Loaded latest saved workspace. Drafts remain preserved.");
    }
    if (target.hasAttribute("data-rebase-draft")) {
      const form = target.closest("form");
      await reloadLatest();
      const id = form.dataset.record;
      const group = {
        "evidence-form": "evidence",
        "assumption-form": "assumptions",
        "decision-form": "decisions",
        "source-check-form": "sources",
      }[form.id];
      form.dataset.expected =
        form.dataset.new === "true" || form.id === "source-add-form"
          ? "absent"
          : form.id === "profile-form"
            ? state.profileRevision
            : (state[group]?.[id]?.revision ?? "absent");
      form.dataset.head = workspaceHead(workspace);
      form.dataset.op = uid("OP");
      previewCommand = null;
      form.querySelector(".workflow-error").textContent = "";
      if (form.querySelector("#decision-error"))
        form.querySelector("#decision-error").textContent = "";
      if (form.querySelector("#revision-preview"))
        form.querySelector("#revision-preview").innerHTML = "";
      saveDraft(form);
      form.querySelector(".draft-note").textContent =
        "Latest basis loaded. Your draft values remain; inspect and preview again.";
    }
    if (target.hasAttribute("data-apply-import") && pendingImport)
      await replaceWorkspace(pendingImport);
    if (target.dataset.backup) {
      try {
        previewImport(localStorage.getItem(target.dataset.backup));
      } catch (error) {
        document.querySelector("#import-error").textContent =
          `Recovery rejected: ${error.message}`;
      }
    }
    if (target.hasAttribute("data-reset"))
      await replaceWorkspace({
        seed: structuredClone(baseline),
        workspace: createWorkspace(baseline),
      });
  } catch (error) {
    const node = utilityDialog.open
      ? utilityDialog.querySelector("#import-error")
      : null;
    if (node) node.textContent = error.message;
    else notify(error.message);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    filters.query = event.target.value;
    renderResults();
  }
  if (event.target.id === "evidence-search") {
    const query = event.target.value.toLowerCase();
    const records = data.evidence.filter((e) =>
      [e.id, e.statement, e.scope, e.type, e.status, ...e.sourceIds]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
    document.querySelector("#evidence-results").innerHTML = records.length
      ? evidenceMarkup(records.map((e) => e.id))
      : '<div class="empty-state">No matching evidence. Try another term.</div>';
  }
  const form = event.target.closest("form");
  if (form?.dataset.op) {
    previewCommand = null;
    if (form.querySelector("#revision-preview"))
      form.querySelector("#revision-preview").innerHTML = "";
    saveDraft(form);
  }
});
document.addEventListener("change", async (event) => {
  const target = event.target;
  if (
    target.id === "lane-filter" ||
    target.id === "relationship-filter" ||
    target.id === "market-filter"
  ) {
    filters[
      {
        "lane-filter": "lane",
        "relationship-filter": "relationship",
        "market-filter": "market",
      }[target.id]
    ] = target.value;
    renderResults();
  }
  if (target.dataset.compare) {
    if (target.checked && selected.size >= 3) {
      target.checked = false;
      notify("Compare up to three organizations at a time.");
      return;
    }
    if (target.checked) selected.add(target.dataset.compare);
    else selected.delete(target.dataset.compare);
    renderResults();
  }
  if (target.id === "import-file") {
    pendingImport = null;
    document.querySelector("#import-preview").innerHTML = "";
    document.querySelector("#import-error").textContent = "";
    try {
      const file = target.files[0];
      if (!file) return;
      if (file.size > 4_000_000) throw new Error("Import is limited to 4 MB.");
      previewImport(await file.text());
    } catch (error) {
      document.querySelector("#import-error").textContent =
        `Import rejected: ${error.message}`;
    }
  }
  const form = target.closest("form");
  if (form?.dataset.op) {
    previewCommand = null;
    if (form.querySelector("#revision-preview"))
      form.querySelector("#revision-preview").innerHTML = "";
    saveDraft(form);
  }
});
document.addEventListener("submit", async (event) => {
  if (!event.target.dataset.op) return;
  event.preventDefault();
  const form = event.target;
  saveDraft(form);
  try {
    const command = commandFor(form);
    if (
      command.type === "source_check" &&
      command.after.outcome === "content_revised"
    ) {
      const fields = new FormData(form),
        id = fields.get("evidenceId");
      if (!id)
        throw new Error(
          "Add a linked evidence claim before recording content revised.",
        );
      showEditor(
        `Revise evidence ${id}`,
        evidenceForm(seed, state, id, command.recordId),
      );
      const next = detailDialog.querySelector("form");
      for (const name of ["actor", "rationale", "checkedAt", "reviewDays"])
        next.elements.namedItem(name).value = fields.get(name);
      saveDraft(next);
      return;
    }
    if (
      command.type === "evidence_revision" ||
      command.type === "evidence_added"
    ) {
      commitOperation(seed, workspace, command); // Validate the whole atomic operation without storing it.
      previewCommand = command;
      const preview =
        command.type === "evidence_revision"
          ? previewEvidence(seed, workspace, command.recordId, command.after)
          : {
              fields: Object.entries(command.after).map(([field, after]) => ({
                field,
                before: null,
                after,
              })),
              affected: command.assumptionIds.map((id) => ({
                id,
                statement: state.assumptions[id].value.statement,
                priorityId: state.assumptions[id].value.priorityId,
                decisionIds: seed.decisions
                  .filter(
                    (d) =>
                      d.priorityId === state.assumptions[id].value.priorityId,
                  )
                  .map((d) => d.id),
              })),
            };
      form.querySelector("#revision-preview").innerHTML =
        revisionPreview(preview);
      form.querySelector(".workflow-error").textContent = "";
      form
        .querySelector("#revision-preview")
        .scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    await commitForm(form, command);
  } catch (error) {
    formError(form, error);
  }
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (["opportunities", "evidence", "changes", "decisions"].includes(next)) {
    view = next;
    render();
    window.scrollTo(0, 0);
  }
});
window.addEventListener("storage", (event) => {
  if (!SHARED && event.key === STORAGE_KEY) {
    storageWarning =
      "Saved workspace changed in another tab. Your current view and drafts are retained; load latest before editing.";
    render();
  }
});
for (const dialog of [detailDialog, utilityDialog])
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
try {
  const response = await fetch(
    new URL("../data/baseline.json", import.meta.url),
  );
  if (!response.ok) throw new Error("Baseline could not be loaded.");
  baseline = prepareDataset(await response.json());
  seed = structuredClone(baseline);
  workspace = createWorkspace(seed);
  let restored = false,
    hasLegacy = false;
  try {
    hasLegacy = !!localStorage.getItem("stable-desk:v1");
    if (SHARED) {
      const remote = await requestPilot("state");
      if (!remote.pilot)
        throw new Error(
          "Initialize a shared workspace in the review pilot first.",
        );
      sharedPilot = remote.pilot;
      sharedFixture = remote.fixture === true;
      const candidate = parseV2Import(JSON.stringify(sharedPilot.desk));
      seed = candidate.seed;
      workspace = candidate.workspace;
      lastDiskHead = workspaceHead(workspace);
      restored = true;
    }
    const raw = SHARED ? null : localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      try {
        const candidate = parseV2Import(raw);
        seed = candidate.seed;
        workspace = candidate.workspace;
        lastDiskHead = workspaceHead(workspace);
        restored = true;
        imported = canonical(seed) !== canonical(baseline);
      } catch {
        blockedCache = true;
        storageWarning =
          "Invalid saved data is preserved. Use Workspace & data to recover or archive/reset.";
      }
    } else if (!SHARED) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const saved = JSON.parse(legacy);
        seed = prepareDataset(saved.data ?? baseline);
        workspace = migrateLegacy(seed, saved.workspace);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(exportV2(seed, workspace)),
        );
        lastDiskHead = workspaceHead(workspace);
        restored = true;
        storageWarning =
          "Generic v1 notes and original history preserved. Explicit v2 reviews are needed; the old storage key remains intact.";
      } else {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(exportV2(seed, workspace)),
        );
        lastDiskHead = workspaceHead(workspace);
      }
    }
  } catch (error) {
    if (SHARED) throw error;
    storageWarning =
      "Browser storage could not be loaded. The baseline is open; export in-memory edits before reload.";
  }
  hydrate();
  render();
  if (hasLegacy)
    notify(
      "A legacy workspace is preserved separately and is not loaded into this generic demo.",
    );
} catch (error) {
  app.innerHTML = `<main class="load-error"><h1>The desk could not open</h1><p>${esc(error.message)}</p>${SHARED ? '<a href="./pilot.html">Sign in or initialize the shared pilot</a>' : '<p>Serve the repository over HTTP and check baseline validation.</p><a href="./data/baseline.json">Open baseline JSON</a>'}</main>`;
}
