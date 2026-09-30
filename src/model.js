export const RELATIONSHIPS = { announced: 'Announced relationship', ecosystem: 'Listed ecosystem', prospective: 'Bilateral status unknown' };
export const EVIDENCE_TYPES = { verified_fact: 'Verified fact', company_claim: 'Company claim', analyst_inference: 'Analyst inference' };
export const DECISION_STATUSES = ['Proposed', 'Investigating', 'Ready for review', 'Parked', 'Declined'];
export const LANES = ['Distribution', 'Issuer partnership', 'Liquidity'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(value) {
  return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
const array = value => Array.isArray(value) ? value : [];
export function validateDataset(data) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Dataset must be an object.'];
  if (data.meta?.schemaVersion !== 1 || data.meta?.collectionMode !== 'manual') fail('Expected schemaVersion 1 and manual collection.');
  if (!validDate(data.meta?.asOf) || typeof data.meta?.version !== 'string' || !data.meta.version.trim()) fail('Missing baseline version or valid as-of date.');
  if (!Number.isInteger(data.meta?.reviewDays) || data.meta.reviewDays < 1 || data.meta.reviewDays > 365) fail('Invalid review interval.');
  const groups = ['sources', 'evidence', 'organizations', 'priorities', 'decisions', 'changes'];
  const maps = {};
  for (const group of groups) {
    if (!Array.isArray(data[group]) || !data[group].length) fail(`${group} must be a nonempty array.`);
    maps[group] = new Map();
    for (const item of array(data[group])) {
      if (!item || typeof item !== 'object' || !/^[a-zA-Z0-9-]+$/.test(item.id ?? '')) { fail(`Invalid ${group} ID.`); continue; }
      if (maps[group].has(item.id)) fail(`Duplicate ${group} ID: ${item.id}`);
      maps[group].set(item.id, item);
    }
  }
  const strings = (item, fields) => fields.forEach(key => { if (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 10000) fail(`${item.id}: invalid ${key}.`); });
  const dates = (item, fields) => fields.forEach(key => { if (!validDate(item[key])) fail(`${item.id}: invalid ${key}.`); else if (['accessedAt', 'asOf', 'recordedAt', 'evidenceReviewedAt', 'createdAt'].includes(key) && item[key] > data.meta.asOf) fail(`${item.id}: ${key} exceeds dataset as-of date.`); });
  const refs = (item, key, group, nonempty = true) => {
    if (!Array.isArray(item[key]) || (nonempty && !item[key].length)) { fail(`${item.id}: invalid ${key}.`); return; }
    for (const id of item[key]) if (!maps[group].has(id)) fail(`${item.id}: unresolved ${key} ${id}.`);
    if (new Set(item[key]).size !== item[key].length) fail(`${item.id}: duplicate ${key}.`);
  };
  const list = (item, key, nonempty = true) => { if (!Array.isArray(item[key]) || (nonempty && !item[key].length) || item[key].some(v => typeof v !== 'string' || !v.trim())) fail(`${item.id}: invalid ${key}.`); };
  for (const source of maps.sources.values()) {
    strings(source, ['title', 'publisher', 'dateNote', 'locator']); dates(source, ['accessedAt']);
    if (!safeUrl(source.url)) fail(`${source.id}: source must have an HTTPS URL.`);
    if (source.kind !== 'primary') fail(`${source.id}: only primary public sources supported.`);
    if (source.publishedAt !== null && !validDate(source.publishedAt)) fail(`${source.id}: invalid publication date.`);
    if (source.publishedAt > data.meta.asOf) fail(`${source.id}: future publication date.`);
    if (source.eventDate !== null && !validDate(source.eventDate) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(source.eventDate)) fail(`${source.id}: invalid event date.`);
    if (source.eventDate && source.eventDate > data.meta.asOf) fail(`${source.id}: future event date.`);
  }
  for (const evidence of maps.evidence.values()) {
    strings(evidence, ['statement', 'scope', 'independentCheck']); dates(evidence, ['asOf']);
    if (!Object.hasOwn(EVIDENCE_TYPES, evidence.type)) fail(`${evidence.id}: invalid evidence type.`);
    refs(evidence, 'sourceIds', 'sources'); refs(evidence, 'organizationIds', 'organizations');
  }
  for (const org of maps.organizations.values()) {
    strings(org, ['name', 'shortName', 'relationshipSummary', 'relevance', 'uncertainty']); dates(org, ['asOf']);
    if (!Object.hasOwn(RELATIONSHIPS, org.relationship) || !LANES.includes(org.lane)) fail(`${org.id}: invalid relationship/lane.`);
    ['markets', 'products', 'nextQuestions'].forEach(key => list(org, key));
    refs(org, 'evidenceIds', 'evidence'); refs(org, 'relationshipEvidenceIds', 'evidence'); refs(org, 'priorityIds', 'priorities', false);
    for (const id of array(org.relationshipEvidenceIds)) if (!array(org.evidenceIds).includes(id)) fail(`${org.id}: relationship evidence must be in evidenceIds.`);
  }
  for (const p of maps.priorities.values()) {
    strings(p, ['title', 'thesis', 'whyNow', 'nextAction', 'confidence', 'confidenceReason', 'evidenceSnapshot']); dates(p, ['evidenceReviewedAt', 'reviewBy']);
    if (!Number.isInteger(p.rank) || p.rank < 1 || !LANES.includes(p.lane)) fail(`${p.id}: invalid rank/lane.`);
    if (p.reviewBy < p.evidenceReviewedAt) fail(`${p.id}: review deadline precedes evidence review.`);
    list(p, 'assumptions'); list(p, 'disproves'); refs(p, 'organizationIds', 'organizations'); refs(p, 'evidenceIds', 'evidence');
    for (const id of array(p.organizationIds)) if (!array(maps.organizations.get(id)?.priorityIds).includes(p.id)) fail(`${p.id}: organization ${id} missing reverse priority reference.`);
  }
  if (new Set([...maps.priorities.values()].map(p => p.rank)).size !== maps.priorities.size) fail('Priority ranks must be unique.');
  for (const d of maps.decisions.values()) {
    strings(d, ['proposal', 'rationale', 'owner']); dates(d, ['createdAt', 'reviewBy']); refs(d, 'evidenceIds', 'evidence');
    if (!maps.priorities.has(d.priorityId) || !DECISION_STATUSES.includes(d.status) || typeof d.notes !== 'string') fail(`${d.id}: invalid decision.`);
  }
  for (const c of maps.changes.values()) {
    strings(c, ['title', 'summary']); dates(c, ['recordedAt']); refs(c, 'evidenceIds', 'evidence'); refs(c, 'priorityIds', 'priorities');
    if (!['baseline', 'manual_update'].includes(c.kind)) fail(`${c.id}: invalid change kind.`);
    if (c.kind === 'baseline' && c.before !== null) fail(`${c.id}: first baseline cannot contain a prior value.`);
    if (typeof c.after !== 'string' || (c.kind === 'manual_update' && typeof c.before !== 'string')) fail(`${c.id}: invalid before/after version.`);
  }
  return errors;
}
export function evidenceFingerprint(data, priority) {
  // Deliberately includes linked organization facts and newly added evidence for
  // those organizations; a changed or added source forces assumption review.
  const orgs = data.organizations.filter(o => priority.organizationIds.includes(o.id));
  const evidence = data.evidence.filter(e => priority.evidenceIds.includes(e.id) || e.organizationIds.some(id => priority.organizationIds.includes(id)));
  const sourceIds = new Set(evidence.flatMap(e => e.sourceIds));
  const canonical = JSON.stringify({ orgs, evidence, sources: data.sources.filter(s => sourceIds.has(s.id)) });
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function reviewState(data, priority, reviews = {}, today = new Date().toISOString().slice(0, 10)) {
  const local = reviews[priority.id];
  const snapshot = local?.fingerprint ?? priority.evidenceSnapshot;
  if (snapshot !== evidenceFingerprint(data, priority)) return { label: 'Evidence changed', tone: 'warn', reason: 'Linked evidence or organization facts changed. Review the assumptions before relying on this proposal.' };
  const reviewBy = local?.reviewBy ?? priority.reviewBy;
  if (today > reviewBy) return { label: 'Review overdue', tone: 'warn', reason: `Assumptions last reviewed ${local?.reviewedAt?.slice(0, 10) ?? priority.evidenceReviewedAt}; review was due ${reviewBy}.` };
  return { label: local ? 'Reviewed locally' : 'Baseline reviewed', tone: 'good', reason: `Dated analysis; next review by ${reviewBy}. No automatic source refresh.` };
}
export function filterOrganizations(data, { query = '', lane = '', relationship = '', market = '' } = {}) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return data.organizations.filter(org => {
    const evidenceText = data.evidence.filter(e => org.evidenceIds.includes(e.id)).map(e => e.statement).join(' ');
    const haystack = `${org.name} ${org.markets.join(' ')} ${org.products.join(' ')} ${org.relevance} ${org.relationshipSummary} ${org.uncertainty} ${org.nextQuestions.join(' ')} ${evidenceText}`.toLowerCase();
    return (!lane || org.lane === lane) && (!relationship || org.relationship === relationship) && (!market || org.markets.includes(market)) && terms.every(term => haystack.includes(term));
  });
}
export function blankWorkspace() { return { schemaVersion: 1, decisions: {}, reviews: {}, activity: [] }; }
export function validateWorkspace(workspace, data) {
  const errors = [];
  if (!workspace || workspace.schemaVersion !== 1 || !workspace.decisions || Array.isArray(workspace.decisions) || !workspace.reviews || Array.isArray(workspace.reviews) || !Array.isArray(workspace.activity)) return ['Invalid workspace.'];
  const decisionIds = new Set(data.decisions.map(d => d.id));
  const priorityIds = new Set(data.priorities.map(p => p.id));
  for (const [id, d] of Object.entries(workspace.decisions)) {
    if (!decisionIds.has(id) || !d || !DECISION_STATUSES.includes(d.status) || typeof d.notes !== 'string' || d.notes.length > 10000 || typeof d.owner !== 'string' || d.owner.length > 200 || !validDate(d.reviewBy)) errors.push(`Invalid local decision ${id}.`);
  }
  for (const [id, r] of Object.entries(workspace.reviews)) {
    if (!priorityIds.has(id) || !r || !/^[0-9a-f]{8}$/.test(r.fingerprint) || typeof r.note !== 'string' || !validDate(r.reviewBy) || !Number.isFinite(Date.parse(r.reviewedAt))) errors.push(`Invalid local review ${id}.`);
  }
  for (const a of workspace.activity) if (!a || typeof a.summary !== 'string' || !['decision_edit', 'assumption_review', 'dataset_import'].includes(a.kind) || !Number.isFinite(Date.parse(a.at))) errors.push('Invalid local activity.');
  return errors;
}
export function decisionFor(data, workspace, id) { const baseline = data.decisions.find(d => d.id === id); return { ...baseline, ...workspace.decisions[id] }; }
export function parseImport(text) {
  if (text.length > 2_000_000) throw new Error('Import is limited to 2 MB.');
  const input = JSON.parse(text);
  const data = input.format === 'stable-desk-workspace' ? input.dataset : input;
  const workspace = input.format === 'stable-desk-workspace' ? input.workspace : blankWorkspace();
  const errors = [...validateDataset(data), ...validateWorkspace(workspace, data)];
  if (errors.length) throw new Error(errors.slice(0, 5).join(' '));
  return { data, workspace };
}
export function exportPayload(data, workspace) { return { format: 'stable-desk-workspace', exportedAt: new Date().toISOString(), dataset: data, workspace }; }
