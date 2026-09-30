import {
  RELATIONSHIPS,
  EVIDENCE_TYPES,
  LANES,
  DECISION_STATUSES,
  validateDataset,
  validateWorkspace,
  filterOrganizations,
  blankWorkspace,
  decisionFor,
  reviewState,
  evidenceFingerprint,
  parseImport,
  exportPayload,
} from "./model.js";

const STORAGE_KEY = "stable-desk:generic-v1";
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
  workspace = blankWorkspace(),
  imported = false,
  selected = new Set(),
  pendingImport = null;
let filters = { query: "", lane: "", relationship: "", market: "" };
let view = ["opportunities", "changes", "decisions"].includes(
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
function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data: imported ? data : null, workspace }),
    );
    return true;
  } catch {
    notify(
      "Browser storage is unavailable. Export this workspace to keep your changes.",
    );
    return false;
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
  return `<article class="source-record" id="source-${source.id}"><div class="eyebrow">${source.id} · ${esc(source.publisher)} · Primary public source · market context</div><a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ${icon("external", 14)}</a><dl class="source-dates"><div><dt>Published</dt><dd>${formatDate(source.publishedAt)}</dd></div><div><dt>Event</dt><dd>${formatDate(source.eventDate)}</dd></div><div><dt>Accessed</dt><dd>${formatDate(source.accessedAt)}</dd></div></dl><p>${esc(source.dateNote)}</p><p class="muted small">Location in source: ${esc(source.locator)}</p></article>`;
}
function evidenceMarkup(ids) {
  return `<div class="evidence-ledger">${data.evidence
    .filter((e) => ids.includes(e.id))
    .map(
      (e) =>
        `<article class="evidence-record"><div class="evidence-top">${pill(EVIDENCE_TYPES[e.type], e.type)}<span class="mono muted">${e.id} · ${formatDate(e.asOf)}</span></div><p>${esc(e.statement)}</p><p class="muted small">${esc(e.scope)}</p><details><summary>${e.sourceRole === "context_only" ? "Context sources · not proof of demo fit" : "Supporting sources & checks"} ${refs(e.sourceIds.length ? [e.id] : [])}</summary><p class="small"><strong>Check coverage:</strong> ${esc(e.independentCheck)}</p>${e.sourceIds.map((id) => sourceMarkup(data.sources.find((s) => s.id === id))).join("")}</details></article>`,
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
      `<div class="detail-tags">${pill(o.lane)}${pill(RELATIONSHIPS[o.relationship], o.relationship)}${o.markets.map((m) => pill(m)).join("")}</div><p class="detail-lead">${esc(o.relevance)}</p><section class="detail-section"><h3>Issuer relationship (demo)</h3><p>${esc(o.relationshipSummary)}</p><h3>Public market context</h3><p>${esc(o.publicContext)}</p>${refs(o.evidenceIds)}<p class="muted small">Products: ${esc(o.products.join(" · "))} · Record as of ${formatDate(o.asOf)}</p></section><section class="detail-section callout"><h3>Important uncertainty</h3><p>${esc(o.uncertainty)}</p></section><section class="detail-section"><h3>Next questions</h3><ol>${o.nextQuestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol></section>${
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
    state = reviewState(data, p, workspace.reviews);
  const d = data.decisions.find((d) => d.priorityId === id);
  openDetail(
    dialogShell(
      p.title,
      `<div class="detail-tags">${pill("Synthetic example", "synthetic_example")}${pill(p.lane)}${pill(state.label, state.tone)}</div><p class="detail-lead">${esc(p.thesis)}</p><p class="muted">${esc(orgNames(p.organizationIds))}</p><section class="detail-section"><h3>Why investigate</h3><p>${esc(p.whyNow)}</p><p class="small"><strong>${esc(p.confidence)} evidence confidence:</strong> ${esc(p.confidenceReason)}</p></section><section class="detail-section next-action"><div class="eyebrow">Concrete next step</div><p>${esc(p.nextAction)}</p><button class="button primary" data-decision="${d.id}">Review proposed decision ${icon("arrow", 16)}</button></section><div class="two-col"><section class="detail-section"><h3>Load-bearing assumptions</h3><ul>${p.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section><section class="detail-section"><h3>What could disprove it</h3><ul>${p.disproves.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section></div><section class="detail-section callout"><h3>Review status</h3><p>${esc(state.reason)}</p><p class="small muted">Evidence snapshot: <span class="mono">${esc(p.evidenceSnapshot)}</span>. An evidence update never automatically endorses this proposal.</p></section><section class="detail-section"><h3>Sources → evidence → recommendation</h3><p class="muted small">${p.id} uses ${p.evidenceIds.join(", ")} as market context. These sources do not prove acceptance, demand or relationships for the fictional profile.</p>${evidenceMarkup(p.evidenceIds)}</section>`,
      `Investigation ${p.id} · Priority ${p.rank}`,
    ),
  );
}
function openDecision(id) {
  const d = decisionFor(data, workspace, id),
    p = data.priorities.find((p) => p.id === d.priorityId),
    state = reviewState(data, p, workspace.reviews);
  openDetail(
    dialogShell(
      "Review proposed decision",
      `<div class="detail-tags">${pill(d.id)}${pill("Synthetic example", "synthetic_example")}${pill(d.status)}${pill(state.label, state.tone)}</div><p class="detail-lead">${esc(d.proposal)}</p><p>${esc(d.rationale)}</p><p class="small muted">This is a synthetic research example for a fictional profile. Changing its status records a local assessment; it does not establish real-world commercial readiness.</p><form id="decision-form" data-id="${d.id}"><div class="two-col"><label>Status<select name="status" aria-label="Status">${DECISION_STATUSES.map((s) => `<option ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Owner<input name="owner" maxlength="200" value="${esc(d.owner)}" required /></label></div><label>Review by<input type="date" name="reviewBy" value="${esc(d.reviewBy)}" required /></label><label>Research notes<textarea name="notes" rows="5" maxlength="10000" placeholder="Record findings, unresolved questions, and your reasoning…">${esc(d.notes)}</textarea></label><fieldset class="review-box"><legend>Assumption review</legend><p class="small">${esc(state.reason)}</p><ul class="small">${p.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul><label class="check-label"><input type="checkbox" name="reviewed" /> I reviewed these assumptions against the current evidence.</label><p class="muted small">Checking this records a local review against this evidence version. Add your reasoning in the notes.</p></fieldset><div id="decision-error" role="alert" class="error"></div><button class="button primary" type="submit">Save local assessment</button></form><section class="detail-section"><h3>Decision lineage</h3><button class="linked-row" data-priority="${p.id}"><span>${p.id} · ${esc(p.title)}</span>${icon("arrow")}</button>${refs(d.evidenceIds)}</section>`,
      `Decision ${d.id} · Saved in this browser`,
    ),
  );
}
function priorityCard(p) {
  const state = reviewState(data, p, workspace.reviews);
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
  results.innerHTML = `<div class="result-info"><span role="status">${orgs.length} of ${data.organizations.length} organizations</span><button class="text-button" data-clear-filters>Clear filters</button></div>${orgs.length ? `<div class="table-wrap"><table class="org-table"><thead><tr><th class="check-col"><span class="sr-only">Compare</span></th><th>Organization</th><th>Opportunity</th><th>Demo relationship</th><th>Next question</th><th><span class="sr-only">Open</span></th></tr></thead><tbody>${orgs.map((o) => `<tr><td class="check-col"><input type="checkbox" data-compare="${o.id}" aria-label="Compare ${esc(o.name)}" ${selected.has(o.id) ? "checked" : ""} /></td><td><button class="org-button" data-org="${o.id}"><span class="monogram ${o.id}">${esc(o.shortName)}</span><span><strong>${esc(o.name)}</strong><small>${esc(o.markets.join(" · "))}</small></span></button></td><td><span class="lane-label">${esc(o.lane)}</span>${o.priorityIds.map((id) => `<span class="tiny-priority">${id}</span>`).join("")}</td><td>${pill(RELATIONSHIPS[o.relationship], o.relationship)}<small class="muted relationship-hint">Fictional profile</small></td><td class="question-cell">${esc(o.nextQuestions[0])}</td><td><button class="icon-button" data-org="${o.id}" aria-label="Open ${esc(o.name)} details">${icon("arrow", 16)}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">${icon("search", 30)}<h3>No matching organizations</h3><p>Try a broader term or clear the filters.</p><button class="button" data-clear-filters>Clear filters</button></div>`}<div class="compare-bar ${selected.size ? "active" : ""}"><span>${selected.size} selected · up to 3</span><div><button class="text-button" data-clear-compare>Clear</button><button class="button primary" data-open-compare ${selected.size < 2 ? "disabled" : ""}>${icon("compare", 16)} Compare selected</button></div></div>`;
}
function changes() {
  return `<div class="view-intro"><h2>A baseline, ready for the next update</h2><p>This generic dataset starts a new scope on ${formatDate(data.meta.asOf)}. Prior project content remains in Git history; this view does not simulate monitored changes.</p></div><div class="changes-layout"><section><div class="section-heading"><h2>Versioned research log</h2>${pill("Manual collection")}</div>${data.changes.map((c) => `<article class="change-record"><div class="timeline-dot"></div><div class="eyebrow">${formatDate(c.recordedAt)} · ${c.kind === "baseline" ? "Baseline" : "Manual update"}</div><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><p class="small muted">${c.before ? `${esc(c.before)} → ` : "First version · "}${esc(c.after)}</p>${refs(c.evidenceIds)}<div class="change-actions">${c.priorityIds.map((id) => `<button class="text-button" data-priority="${id}">Inspect ${id} ${icon("arrow", 14)}</button>`).join("")}</div></article>`).join("")}<div class="section-heading local-heading"><h2>Local workspace activity</h2><span class="muted small">This browser only</span></div>${
    workspace.activity.length
      ? `<div class="activity-list">${[...workspace.activity]
          .reverse()
          .map(
            (a) =>
              `<article><div class="eyebrow">${esc(new Date(a.at).toLocaleString("en-GB"))}</div><p>${esc(a.summary)}</p></article>`,
          )
          .join("")}</div>`
      : '<div class="quiet-state">No local edits yet. Saved assessments and imported evidence appear here with actual timestamps.</div>'
  }</section><aside class="panel"><div class="eyebrow">Evidence boundaries</div><h3>What the baseline cannot prove</h3><article><h4>Product support ≠ demo acceptance</h4><p>Published token and region restrictions apply to real products. ${esc(data.profile.ticker)} has no issuer or supported integration.</p>${refs(["E-G02", "E-G04"])}</article><article><h4>Announcement ≠ current availability</h4><p>Historical pilots and beta products need fresh scope checks before a real recommendation.</p>${refs(["E-G05", "E-G10"])}</article><article><h4>Pool value ≠ executable depth</h4><p>Active liquidity depends on price range. There are no demo-token quotes or pools.</p>${refs(["E-G09"])}<button class="text-button" data-priority="P-G03">Inspect liquidity example ${icon("arrow", 14)}</button></article></aside></div>`;
}
function decisions() {
  return `<div class="view-intro"><h2>Turn research into a clear next step</h2><p>Three synthetic research examples. Record reasoning and review assumptions when their market context changes.</p></div><div class="local-banner">${icon("decision", 20)}<div><strong>Assessments are saved in this browser.</strong><p>Export a workspace backup to transfer it. These are fictional-profile examples, not commercial decisions.</p></div></div><div class="decision-list">${data.decisions
    .map((base) => {
      const d = decisionFor(data, workspace, base.id),
        p = data.priorities.find((p) => p.id === d.priorityId),
        state = reviewState(data, p, workspace.reviews);
      return `<article class="decision-card"><div class="decision-meta"><span class="mono">${d.id}</span>${pill("Synthetic example", "synthetic_example")}${pill(d.status)}${pill(state.label, state.tone)}</div><div class="decision-content"><div><h3>${esc(d.proposal)}</h3><p>${esc(d.rationale)}</p>${d.notes ? `<p class="saved-note"><strong>Local note:</strong> ${esc(d.notes)}</p>` : ""}<div class="decision-facts"><span>Owner <strong>${esc(d.owner)}</strong></span><span>Review by <strong>${formatDate(d.reviewBy)}</strong></span><span>Evidence ${refs(d.evidenceIds)}</span></div></div><button class="button" data-decision="${d.id}">Review assessment ${icon("arrow", 16)}</button></div></article>`;
    })
    .join("")}</div>`;
}
function render() {
  const titles = {
    opportunities: [
      `Where could ${data.profile.ticker} fit?`,
      "Explore distribution, issuer design and liquidity through a fictional stablecoin profile.",
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
    (p) => reviewState(data, p, workspace.reviews).tone === "warn",
  ).length;
  app.innerHTML = `<div class="desk-shell"><aside class="sidebar"><a class="brand" href="#opportunities"><span class="brand-mark"><i></i><i></i><i></i></span><span>Stable <span class="brand-light">Desk</span><small>ECOSYSTEM RESEARCH</small></span></a><div class="workspace-label">GENERIC RESEARCH WORKSPACE</div><nav aria-label="Desk views">${[
    ["opportunities", "Opportunities", "grid"],
    ["changes", "Changes", "change"],
    ["decisions", "Decisions", "decision"],
  ]
    .map(
      ([id, label, i]) =>
        `<a href="#${id}" class="nav-link ${view === id ? "active" : ""}" ${view === id ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span>${id === "decisions" ? `<span class="nav-count" aria-hidden="true">${data.decisions.length}</span>` : ""}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-context"><div class="eyebrow">Research focus</div><span class="focus-token">◇</span><h3>${esc(data.profile.name)}</h3><p>${esc(data.profile.ticker)} · Fictional placeholder</p></div><div class="sidebar-bottom"><span class="manual-dot"></span><strong>Manual research desk</strong><p>No recurring collection or live refresh.</p><button data-utility="method" class="sidebar-help">How to update the desk ${icon("arrow", 14)}</button><div class="profile"><span>SD</span><div>Demo workspace<small>Public market context</small></div></div></div></aside><div class="main-shell"><header class="topbar"><span>Research desk <span class="breadcrumb">/ ${view[0].toUpperCase() + view.slice(1)}</span></span><div class="topbar-right"><span class="baseline-chip"><span></span>${imported ? "Imported" : "Versioned"} baseline</span><button class="icon-button" data-utility="workspace" aria-label="Workspace backup and import">${icon("download")}</button></div></header><main id="main"><div class="page-heading"><div><div class="eyebrow">${esc(data.profile.ticker)} · FICTIONAL DEMO</div><h1>${titles[view][0]}</h1><p>${titles[view][1]}</p></div><button class="button" data-export>${icon("download", 16)} Export workspace</button></div><div class="baseline-line"><span>AS OF <strong>${formatDate(data.meta.asOf)}</strong></span><span class="line-divider"></span><span>${esc(data.meta.version)}</span><span class="baseline-caption">${overdue ? `${overdue} proposal${overdue > 1 ? "s" : ""} need review` : "Generic baseline · dated market context"}</span></div>${overdue ? `<div class="stale-banner" role="status">${overdue} proposal${overdue > 1 ? "s" : ""} require assumption review. Inspect their status in Decisions.</div>` : ""}<aside class="demo-banner" data-demo-notice><strong>${esc(data.profile.name)} (${esc(data.profile.ticker)}) is fictional.</strong><span>No real issuer, deployed token, reserves or partners. Public sources describe real market products; opportunity fit is synthetic.</span></aside><div class="stats-strip"><div><strong>${data.organizations.length.toString().padStart(2, "0")}</strong><span>Organizations mapped</span></div><div><strong>${data.sources.length.toString().padStart(2, "0")}</strong><span>Primary sources</span></div><div><strong>${data.priorities.length.toString().padStart(2, "0")}</strong><span>Synthetic research examples</span></div><div><strong>${data.changes.length.toString().padStart(2, "0")}</strong><span>Research versions logged</span></div></div>${view === "opportunities" ? opportunities() : view === "changes" ? changes() : decisions()}<footer class="footer"><span>Stable Desk · Built for deliberate ecosystem research</span><button class="text-button" data-utility="workspace">Workspace & data ${icon("arrow", 14)}</button></footer></main></div></div>`;
  renderResults();
}
function openUtility(mode) {
  const coverage = `<p class="detail-lead">${esc(data.meta.coverage)}</p><div class="legend">${Object.values(
    EVIDENCE_TYPES,
  )
    .map((v, i) => pill(v, Object.keys(EVIDENCE_TYPES)[i]))
    .join(
      "",
    )}</div><p>Verified facts establish source content and announcement existence. Performance, launch and availability claims retain company attribution. Synthetic examples are constructed hypotheses; their sources provide market context only.</p><p>The demo has no issuer relationships. Real company-to-company context keeps original names and dates. Token supply, aggregate onchain transfers and card spend do not establish payment adoption.</p><h3>Source coverage</h3><p class="small muted">${data.sources.length} primary sources · all accessed ${formatDate(data.meta.asOf)} · undated pages explicitly labeled.</p>${data.sources.map(sourceMarkup).join("")}`;
  const method = `<p class="detail-lead">A manual desk with an inspectable evidence trail.</p><ol class="method-steps"><li><strong>Add public evidence.</strong> Open the original source, preserve dates and scope, and add a stable source and evidence ID to the versioned dataset.</li><li><strong>Review what depends on it.</strong> Link organizations and proposals. The desk flags changed sources, facts or newly linked evidence for assumption review.</li><li><strong>Reconsider the proposal.</strong> Check its assumptions and disproof conditions. Record reasoning in Decisions; an explicit local review records the current evidence fingerprint.</li><li><strong>Keep the history honest.</strong> Append a dated manual-update entry with real before/after versions. Export the local workspace; promote reviewed public evidence through Git.</li></ol><p>Opening or reloading this page reloads saved data. It does not collect fresh source content. No recurring collection or AI chat is implemented.</p><p><a href="./docs/V2_PLAN.md" target="_blank">Read the scoped v2 plan ${icon("external", 14)}</a></p><p><a href="./docs/UPDATING.md" target="_blank">Read the update guide ${icon("external", 14)}</a> · <a href="./docs/PRIORITIES.md" target="_blank">Read the priority brief ${icon("external", 14)}</a></p>`;
  const local = `<p class="detail-lead">Versioned market context. Synthetic examples. Local assessments.</p><p>Notes, status and assumption reviews persist in this browser. They are not shared, backed up automatically, or sent to any service. Keep research notes public-information-only.</p><div class="utility-actions"><button class="button primary" data-export>${icon("download", 16)} Export full workspace</button><a class="button" href="./data/baseline.json" download="stable-desk-baseline.json">Download repository baseline</a></div><section class="detail-section"><h3>Incorporate evidence or restore a workspace</h3><p class="small muted">Import a validated generic-demo JSON or a Stable Desk generic workspace export, up to 2 MB. Legacy issuer-specific exports are unsupported here. This replaces the current browser workspace after preview; the repository files stay versioned separately.</p><label class="file-label">Choose JSON file<input type="file" id="import-file" accept=".json,application/json" /></label><div id="import-preview" role="status"></div><div id="import-error" class="error" role="alert"></div></section><section class="detail-section"><h3>Start from the repository baseline</h3><p class="small muted">Export any local work first. Reset clears imported data, notes, assessments and local activity in this browser.</p><button class="button" data-reset>Reset local workspace</button></section><p><a href="./docs/ARCHITECTURE.md" target="_blank">Architecture & limitations ${icon("external", 14)}</a></p>`;
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
        `${pill(RELATIONSHIPS[o.relationship], o.relationship)}<p>${esc(o.relationshipSummary)}</p>`,
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
function exportWorkspace() {
  const blob = new Blob(
    [JSON.stringify(exportPayload(data, workspace), null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `stable-desk-workspace-${data.meta.asOf}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("Exported evidence, proposals and local assessments.");
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-close")) {
    target.closest("dialog").close();
    return;
  }
  if (target.dataset.org) openOrg(target.dataset.org);
  if (target.dataset.priority) openPriority(target.dataset.priority);
  if (target.dataset.decision) openDecision(target.dataset.decision);
  if (target.dataset.source) {
    const s = data.sources.find((s) => s.id === target.dataset.source);
    openDetail(dialogShell(s.title, sourceMarkup(s), `Source ${s.id}`));
  }
  if (target.dataset.utility) openUtility(target.dataset.utility);
  if (target.hasAttribute("data-export")) exportWorkspace();
  if (target.hasAttribute("data-clear-filters")) {
    filters = { query: "", lane: "", relationship: "", market: "" };
    render();
  }
  if (target.hasAttribute("data-clear-compare")) {
    selected.clear();
    renderResults();
  }
  if (target.hasAttribute("data-open-compare")) openCompare();
  if (target.hasAttribute("data-apply-import") && pendingImport) {
    const previous = data.meta.version;
    const before = data;
    data = pendingImport.data;
    workspace = pendingImport.workspace;
    imported = true;
    selected.clear();
    filters = { query: "", lane: "", relationship: "", market: "" };
    workspace.activity.push({
      kind: "dataset_import",
      at: new Date().toISOString(),
      summary: `Manually imported ${data.meta.version} into this browser (previous dataset ${previous}).`,
      before: previous,
      after: data.meta.version,
      affectedPriorityIds: data.priorities
        .filter((p) => {
          const old = before.priorities.find((x) => x.id === p.id);
          return (
            !old ||
            evidenceFingerprint(before, old) !== evidenceFingerprint(data, p)
          );
        })
        .map((p) => p.id),
    });
    persist();
    utilityDialog.close();
    detailDialog.close();
    render();
    notify("Imported validated data. Review any flagged assumptions.");
  }
  if (
    target.hasAttribute("data-reset") &&
    confirm(
      "Clear this browser’s local workspace and return to the repository baseline? Export first to keep your work.",
    )
  ) {
    data = structuredClone(baseline);
    workspace = blankWorkspace();
    imported = false;
    selected.clear();
    persist();
    utilityDialog.close();
    render();
    notify("Returned to the repository baseline.");
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "search") {
    filters.query = event.target.value;
    renderResults();
  }
});
document.addEventListener("change", async (event) => {
  const target = event.target;
  const key = {
    "lane-filter": "lane",
    "relationship-filter": "relationship",
    "market-filter": "market",
  }[target.id];
  if (key) {
    filters[key] = target.value;
    renderResults();
  }
  if (target.hasAttribute("data-compare")) {
    if (target.checked && selected.size >= 3) {
      target.checked = false;
      notify("Compare up to three organizations at a time.");
      return;
    }
    target.checked
      ? selected.add(target.dataset.compare)
      : selected.delete(target.dataset.compare);
    renderResults();
  }
  if (target.id === "import-file" && target.files[0]) {
    const preview = document.querySelector("#import-preview"),
      error = document.querySelector("#import-error");
    preview.innerHTML = "";
    error.textContent = "";
    pendingImport = null;
    try {
      const file = target.files[0];
      if (file.size > 2_000_000) throw new Error("Import is limited to 2 MB.");
      pendingImport = parseImport(await file.text());
      const d = pendingImport.data;
      const changed = d.priorities.filter(
        (p) =>
          reviewState(d, p, pendingImport.workspace.reviews).tone === "warn",
      );
      preview.innerHTML = `<div class="import-summary"><strong>Validated ${esc(d.meta.version)}</strong><p>${d.organizations.length} organizations · ${d.sources.length} sources · as of ${formatDate(d.meta.asOf)}</p><p>${changed.length} proposals need assumption review.</p><button class="button primary" data-apply-import>Use in this browser</button></div>`;
    } catch (e) {
      error.textContent = `Import rejected: ${e.message}`;
    }
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id !== "decision-form") return;
  event.preventDefault();
  const form = event.target,
    id = form.dataset.id,
    fields = new FormData(form),
    original = decisionFor(data, workspace, id),
    p = data.priorities.find((p) => p.id === original.priorityId);
  const assessment = {
    status: fields.get("status"),
    owner: fields.get("owner").trim() || "Unassigned",
    reviewBy: fields.get("reviewBy"),
    notes: fields.get("notes").trim(),
  };
  if (fields.get("reviewed") && !assessment.notes) {
    document.querySelector("#decision-error").textContent =
      "Add a note explaining your assumption review.";
    return;
  }
  const updated = structuredClone(workspace);
  updated.decisions[id] = assessment;
  const at = new Date().toISOString();
  updated.activity.push({
    kind: "decision_edit",
    at,
    summary: `${id}: saved local assessment (${original.status} → ${assessment.status}).`,
    decisionId: id,
    before: {
      status: original.status,
      owner: original.owner,
      reviewBy: original.reviewBy,
      notes: original.notes,
    },
    after: assessment,
  });
  if (fields.get("reviewed")) {
    updated.reviews[p.id] = {
      fingerprint: evidenceFingerprint(data, p),
      reviewedAt: at,
      reviewBy: assessment.reviewBy,
      note: assessment.notes,
    };
    updated.activity.push({
      kind: "assumption_review",
      at,
      summary: `${p.id}: assumptions reviewed locally against current evidence.`,
      priorityId: p.id,
      fingerprint: evidenceFingerprint(data, p),
    });
  }
  const errors = validateWorkspace(updated, data);
  if (errors.length) {
    document.querySelector("#decision-error").textContent = errors.join(" ");
    return;
  }
  workspace = updated;
  const saved = persist();
  detailDialog.close();
  render();
  if (saved) notify("Assessment saved in this browser. Export to back it up.");
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  if (["opportunities", "changes", "decisions"].includes(next)) {
    view = next;
    render();
    window.scrollTo(0, 0);
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
  baseline = await response.json();
  const errors = validateDataset(baseline);
  if (errors.length) throw new Error(errors.join(" "));
  data = structuredClone(baseline);
  let restored = false,
    hasLegacyWorkspace = false;
  try {
    hasLegacyWorkspace = !!localStorage.getItem("stable-desk:v1");
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      const candidate = saved.data ?? data;
      const invalid = [
        ...validateDataset(candidate),
        ...validateWorkspace(saved.workspace, candidate),
      ];
      if (invalid.length) throw new Error("Invalid saved workspace");
      data = candidate;
      workspace = saved.workspace;
      imported = !!saved.data;
      restored = true;
    }
  } catch {
    notify(
      "Saved browser data could not be loaded. Repository baseline opened; export after editing to keep a backup.",
    );
  }
  render();
  if (!restored && hasLegacyWorkspace)
    notify(
      "A legacy workspace is preserved separately and is not loaded into this generic demo.",
    );
  if (restored && imported)
    notify("Opened your imported browser dataset. No sources were refreshed.");
} catch (error) {
  app.innerHTML = `<main class="load-error"><h1>The desk could not open</h1><p>${esc(error.message)}</p><p>Serve the repository over HTTP and check the baseline validation.</p><a href="./data/baseline.json">Open baseline JSON</a></main>`;
}
