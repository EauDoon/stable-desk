import { EVIDENCE_TYPES, DECISION_STATUSES } from "./model.js";
import {
  uid,
  priorityStatus,
  assumptionStatus,
  sourceFreshness,
  canonical,
} from "./workspace.js";
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const esc = escapeHTML;
const today = () => new Date().toISOString().slice(0, 10);
const options = (items, selected) =>
  items
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}" ${selected === value ? "selected" : ""}>${esc(label)}</option>`,
    )
    .join("");
const reviewerFields = () =>
  `<div class="two-col"><label>Reviewer<input name="actor" maxlength="200" value="Researcher" required /></label><label>Reason for this change<textarea name="rationale" rows="2" maxlength="10000" required></textarea></label></div>`;
const draftNote =
  '<div class="draft-note" role="status">Edits are a draft until committed.</div><div class="workflow-error error" role="alert"></div>';
export function profileForm(state, isNew = false) {
  const p = isNew
    ? {
        ...state.profile,
        id: uid("PROFILE"),
        name: "Generic Stablecoin",
        ticker: "STABLE",
        mode: "fictional_demo",
        issuer: null,
        currency: null,
        markets: [],
        networks: [],
        useCase: null,
        constraints: ["Eligibility unknown", "Redemption terms unknown"],
      }
    : state.profile;
  return `<p class="detail-lead">Configure a research subject. Profile settings never establish token issuance, eligibility or partnerships.</p><form id="profile-form" data-record="${esc(p.id)}" data-expected="${isNew ? "absent" : esc(state.profileRevision)}" data-new="${isNew}"><div class="two-col"><label>Profile name<input name="name" value="${esc(p.name)}" maxlength="80" required /></label><label>Placeholder ticker<input name="ticker" value="${esc(p.ticker)}" maxlength="12" pattern="[A-Z0-9]{2,12}" required /></label></div><label>Profile mode<select name="mode">${options(
    [
      ["fictional_demo", "Fictional demo"],
      ["researched_profile", "Real research subject · unverified"],
    ],
    p.mode,
  )}</select></label><label class="check-label"><input type="checkbox" name="confirmedResearchMode" /> I deliberately enable a real research subject; demo examples and relationships remain unverified.</label><label>Issuer subject (optional; real research mode only)<input name="issuer" value="${esc(p.issuer)}" maxlength="200" placeholder="Unknown" /></label><div class="two-col"><label>Reference currency (intended)<input name="currency" value="${esc(p.currency)}" maxlength="80" placeholder="Unknown" /></label><label>Intended markets (comma-separated)<input name="markets" value="${esc(p.markets.join(", "))}" placeholder="Unspecified" /></label></div><label>Intended networks (comma-separated)<input name="networks" value="${esc(p.networks.join(", "))}" placeholder="Unspecified; no deployment implied" /></label><label>Use case<textarea name="useCase" rows="3" maxlength="3000" placeholder="Unknown">${esc(p.useCase)}</textarea></label><label>Constraints / explicit unknowns (one per line)<textarea name="constraints" rows="3">${esc(p.constraints.join("\n"))}</textarea></label>${reviewerFields()}${draftNote}<button class="button primary" type="submit">${isNew ? "Create independent profile" : "Save profile revision"}</button></form>`;
}
export function sourceCheckForm(seed, state, id) {
  const source = state.sources[id].value;
  const fresh = sourceFreshness(seed, state, id);
  const linked = Object.values(state.evidence).filter((e) =>
    e.value.sourceIds.includes(id),
  );
  return `<p class="detail-lead">Record what you actually checked. This form does not fetch or verify the source.</p><p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></p><p class="small muted">Original publication ${esc(source.publishedAt ?? "not published")} · event ${esc(source.eventDate ?? "not published")}. These dates stay unchanged.</p><form id="source-check-form" data-record="${id}" data-expected="${esc(state.sources[id].revision)}"><div class="two-col"><label>Check outcome<select name="outcome">${options(
    [
      ["unchanged", "Checked unchanged"],
      ["unreachable", "Unable to review / unreachable"],
      ["content_revised", "Content revised · continue to evidence editor"],
    ],
    "unchanged",
  )}</select></label><label>Actually checked on<input type="date" name="checkedAt" value="${today()}" max="${today()}" required /></label></div><label>Review cadence (days)<input type="number" name="reviewDays" min="1" max="365" value="30" required /></label><label>Linked claim for a content revision<select name="evidenceId">${options(
    linked.map((e) => [
      e.value.id,
      `${e.value.id} · ${e.value.statement.slice(0, 90)}`,
    ]),
    linked[0]?.value.id,
  )}</select></label><p class="small muted">${esc(fresh.label)} · next check ${esc(fresh.dueAt)}. Unchanged and failed checks do not revise claims or clear assumption warnings.</p>${reviewerFields()}${draftNote}<button class="button primary" type="submit">Record manual check</button></form>`;
}
export function evidenceForm(seed, state, id = null, sourceId = null) {
  const isNew = !id;
  const e = isNew
    ? {
        id: uid("E"),
        statement: "",
        scope: "",
        independentCheck: "",
        status: "active",
        type: "company_claim",
        sourceIds: sourceId ? [sourceId] : [],
        organizationIds: [],
        asOf: today(),
      }
    : state.evidence[id].value;
  const assumptions = Object.values(state.assumptions).map((a) => a.value);
  return `<p class="detail-lead">${isNew ? "Add scope-qualified public context or an explicit synthetic example." : "Revise one claim, inspect the changed fields, then review affected assumptions."}</p><p class="small muted">Keep original real product names and provenance. Public market sources never prove fictional-token acceptance.</p><form id="evidence-form" data-record="${esc(e.id)}" data-expected="${isNew ? "absent" : esc(state.evidence[id].revision)}" data-new="${isNew}"><label>Claim statement<textarea name="statement" rows="4" maxlength="10000" required>${esc(e.statement)}</textarea></label><div class="two-col"><label>Classification<select name="type" ${!isNew ? "disabled" : ""}>${options(Object.entries(EVIDENCE_TYPES), e.type)}</select></label><label>Evidence status<select name="status">${options(
    [
      ["active", "Active · scope-qualified"],
      ["unknown", "Unknown / no longer supported"],
      ["withdrawn", "Withdrawn"],
    ],
    e.status,
  )}</select></label></div><label>Scope and important limits<textarea name="scope" rows="3" required>${esc(e.scope)}</textarea></label><label>Independent check coverage<textarea name="independentCheck" rows="2" required>${esc(e.independentCheck)}</textarea></label><label>Evidence as-of<input type="date" name="asOf" value="${esc(e.asOf)}" max="${today()}" required /></label><fieldset><legend>Original supporting sources</legend><div class="choice-grid">${Object.values(
    state.sources,
  )
    .map(
      (s) =>
        `<label class="check-label"><input type="checkbox" name="sourceIds" value="${s.value.id}" ${e.sourceIds.includes(s.value.id) ? "checked" : ""} /> ${s.value.id} · ${esc(s.value.title)}</label>`,
    )
    .join(
      "",
    )}</div></fieldset><fieldset><legend>Organizations in this claim</legend><div class="choice-grid">${seed.organizations.map((o) => `<label class="check-label"><input type="checkbox" name="organizationIds" value="${o.id}" ${e.organizationIds.includes(o.id) ? "checked" : ""} /> ${esc(o.name)}</label>`).join("")}</div></fieldset>${
    isNew
      ? `<fieldset><legend>Attach new evidence to affected assumptions</legend>${assumptions.map((a) => `<label class="check-label"><input type="checkbox" name="assumptionIds" value="${a.id}" /> ${a.id} · ${esc(a.statement)}</label>`).join("")}</fieldset>`
      : `<fieldset><legend>Optional linked source-check record</legend><label class="check-label"><input type="checkbox" name="recordCheck" ${sourceId ? "checked" : ""} /> I opened a linked source and revised its evidence.</label><label>Source checked<select name="checkSourceId">${options(
          Object.values(state.sources).map((s) => [
            s.value.id,
            `${s.value.id} · ${s.value.title}`,
          ]),
          sourceId ?? e.sourceIds[0],
        )}</select></label><div class="two-col"><label>Actually checked on<input type="date" name="checkedAt" value="${today()}" max="${today()}" /></label><label>Source review cadence (days)<input type="number" name="reviewDays" value="30" min="1" max="365" /></label></div></fieldset>`
  }${reviewerFields()}${draftNote}<button class="button primary" type="submit">${isNew ? "Preview new evidence" : "Preview revision"}</button><div id="revision-preview" aria-live="polite"></div></form>`;
}
export function newSourceForm() {
  const id = uid("S");
  return `<p class="detail-lead">Add an original public primary source. This is a manual record, not a fetched or verified page.</p><form id="source-add-form" data-record="${id}" data-expected="absent"><label>Original source title<input name="title" maxlength="1000" required /></label><label>Publisher<input name="publisher" maxlength="1000" required /></label><label>Original HTTPS URL<input type="url" name="url" required placeholder="https://…" /></label><div class="two-col"><label>Publication date (optional)<input type="date" name="publishedAt" max="${today()}" /></label><label>Event date (optional)<input type="date" name="eventDate" max="${today()}" /></label></div><label>Actually accessed on<input type="date" name="accessedAt" value="${today()}" max="${today()}" required /></label><label>Location in source<input name="locator" required placeholder="Section / paragraph / document page" /></label><label>Date and scope caveats<textarea name="dateNote" required></textarea></label>${reviewerFields()}${draftNote}<button class="button primary" type="submit">Add original source</button></form>`;
}
export function assumptionForm(state, id) {
  const a = state.assumptions[id];
  return `<p class="detail-lead">Revise this assumption and its exact evidence dependencies. This requires a fresh review; it does not endorse the conclusion.</p><form id="assumption-form" data-record="${id}" data-expected="${esc(a.revision)}"><label>Assumption statement<textarea name="statement" rows="4" required>${esc(a.value.statement)}</textarea></label><fieldset><legend>Evidence dependencies</legend>${Object.values(
    state.evidence,
  )
    .map(
      (e) =>
        `<label class="check-label"><input type="checkbox" name="evidenceIds" value="${e.value.id}" ${a.value.evidenceIds.includes(e.value.id) ? "checked" : ""} /> ${e.value.id} · ${esc(e.value.status)} · ${esc(e.value.statement)}</label>`,
    )
    .join(
      "",
    )}</fieldset>${reviewerFields()}${draftNote}<button class="button primary" type="submit">Save assumption revision</button></form>`;
}
export function assumptionCards(state, priorityId) {
  return `<div class="assumption-list">${Object.values(state.assumptions)
    .filter((a) => a.value.priorityId === priorityId)
    .map((a) => {
      const s = assumptionStatus(state, a.value.id);
      return `<article class="assumption-card"><div class="evidence-top"><span class="mono">${a.value.id}</span><span class="pill ${s.tone}">${esc(s.label)}</span></div><p>${esc(a.value.statement)}</p><p class="small muted">${esc(s.reason)}</p><div class="dependency-links">${a.value.evidenceIds.map((id) => `<button class="source-ref" data-edit-evidence="${id}" aria-label="Revise evidence ${id}">${id} · ${esc(state.evidence[id].value.status)}</button>`).join("")}</div><p class="small muted">${a.review ? `Review note: ${esc(a.review.note)}` : "No local review."}</p><button class="text-button" data-edit-assumption="${a.value.id}">Edit assumption & dependencies →</button></article>`;
    })
    .join("")}</div>`;
}
export function decisionForm(seed, state, id) {
  const d = state.decisions[id].value;
  const base = seed.decisions.find((d) => d.id === id);
  const p = seed.priorities.find((p) => p.id === base.priorityId);
  const status = priorityStatus(state, p.id);
  return `<p class="detail-lead">${esc(base.proposal)}</p><p>Record reasoning against specific evidence revisions. Saving status does not approve a commercial action.</p><form id="decision-form" data-record="${id}" data-expected="${esc(state.decisions[id].revision)}"><div class="two-col"><label>Status<select name="status" aria-label="Status">${options(
    DECISION_STATUSES.map((s) => [s, s]),
    d.status,
  )}</select></label><label>Owner<input name="owner" value="${esc(d.owner)}" maxlength="200" required /></label></div><label>Review by<input type="date" name="reviewBy" value="${esc(d.reviewBy)}" required /></label><label>Research notes<textarea name="notes" rows="4" maxlength="10000" placeholder="Explain the evidence scope, unresolved questions and reasoning…">${esc(d.notes)}</textarea></label><label>Reviewer<input name="actor" value="Researcher" maxlength="200" required /></label><fieldset class="review-box"><legend>Review exact assumptions</legend><p class="small">${esc(status.reason)}</p><label class="check-label"><input type="checkbox" name="reviewed" /> I reviewed these assumptions against the current evidence.</label>${Object.values(
    state.assumptions,
  )
    .filter((a) => a.value.priorityId === p.id)
    .map((a) => {
      const s = assumptionStatus(state, a.value.id);
      return `<label class="check-label"><input type="checkbox" name="assumptionIds" value="${a.value.id}" /> ${a.value.id} · ${esc(s.label)} · ${esc(a.value.statement)}</label>`;
    })
    .join(
      "",
    )}<p class="small muted">Select individual assumptions, or use the first checkbox for all. Unknown/withdrawn dependencies block endorsement. Add reasoning in the notes.</p></fieldset>${draftNote}<div id="decision-error" class="error" role="alert"></div><button class="button primary" type="submit">Save local assessment</button></form><section class="detail-section"><h3>Assumptions and lineage</h3>${assumptionCards(state, p.id)}<button class="button" data-history="${id}">Inspect decision history</button></section>`;
}
export function revisionPreview(preview) {
  return `<section class="revision-preview"><h3>Review the change before committing</h3><div class="field-diff">${preview.fields.map((f) => `<article><h4>${esc(f.field)}</h4><div class="two-col"><div><span class="eyebrow">Before</span><p>${esc(typeof f.before === "string" ? f.before : canonical(f.before))}</p></div><div><span class="eyebrow">After</span><p>${esc(typeof f.after === "string" ? f.after : canonical(f.after))}</p></div></div></article>`).join("") || "<p>No content change. Use a source check to record an unchanged review.</p>"}</div><h4>Affected assumptions and decisions</h4>${preview.affected.map((a) => `<p><strong>${esc(a.id)}</strong> · ${esc(a.statement)}<br/><span class="small muted">${esc(a.priorityId)} → ${esc(a.decisionIds.join(", "))}</span></p>`).join("") || "<p>No assumption currently depends on this record.</p>"}${preview.fields.length ? '<button type="button" class="button primary" data-commit-revision>Commit reviewed revision</button>' : ""}</section>`;
}
export function historyMarkup(ws, profileId, focusId = null) {
  const all = ws.events.filter((e) => e.profileId === profileId);
  const operations = focusId
    ? new Set(all.filter((e) => e.recordId === focusId).map((e) => e.opId))
    : null;
  const events = operations ? all.filter((e) => operations.has(e.opId)) : all;
  return events.length
    ? `<div class="history-list">${[...events]
        .reverse()
        .map(
          (e) =>
            `<article class="history-record"><div class="eyebrow">#${e.seq} · ${esc(new Date(e.at).toLocaleString("en-GB"))} · ${esc(e.actor)}</div><h4>${esc(e.type.replaceAll("_", " "))} · ${esc(e.recordId)}</h4><p>${esc(e.rationale)}</p><button class="text-button" data-event="${e.id}">Inspect before / after and revision basis →</button></article>`,
        )
        .join("")}</div>`
    : '<div class="quiet-state">No committed local revisions for this profile yet. Drafts are separate from this history.</div>';
}
