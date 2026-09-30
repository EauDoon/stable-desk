import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  prepareDataset,
  projectWorkspace,
  commitOperation,
  workspaceHead,
  uid,
  exportV2,
} from "../src/workspace.js";
import { blankWorkspace } from "../src/model.js";
const seed = prepareDataset(
  JSON.parse(
    await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
  ),
);
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("stable-desk:v2")));
const ledger = (page) => page.locator("#evidence-results > .evidence-ledger");
const dialog = (page) => page.locator("#detail-dialog");
const overflow = async (page) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (await dialog(page).isVisible())
    expect(
      await dialog(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
};
const close = async (page) => {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toBeVisible();
};
const evidence = async (page) => {
  await page.getByRole("link", { name: "Evidence", exact: true }).click();
};
const edit = async (page, id) => {
  await evidence(page);
  await ledger(page)
    .locator(".evidence-record")
    .filter({ has: page.locator(`[data-edit-evidence="${id}"]`) })
    .getByRole("button", { name: "Revise claim", exact: false })
    .click();
};
const reason = async (
  page,
  note = "Public context checked; issuer eligibility remains unknown.",
) => page.getByLabel("Reason for this change", { exact: true }).fill(note);
const saveDecision = async (
  page,
  note = "Public market context reviewed. Fictional fit and commercial terms remain unproven.",
  reviewed = true,
) => {
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("button", { name: "Review assessment", exact: false })
    .first()
    .click();
  const rebase = page.getByRole("button", {
    name: "Use latest basis and preview again",
    exact: true,
  });
  if (await rebase.isVisible()) await rebase.click();
  await page.getByLabel("Research notes", { exact: true }).fill(note);
  await page
    .getByLabel("Status", { exact: true })
    .selectOption("Investigating");
  if (reviewed)
    await page
      .getByRole("checkbox", {
        name: "I reviewed these assumptions against the current evidence.",
        exact: true,
      })
      .check();
  await page
    .getByRole("button", { name: "Save local assessment", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
};
const preview = async (page) => {
  await page
    .getByRole("button", { name: "Preview revision", exact: true })
    .click();
  await expect(page.locator("#revision-preview")).toContainText(
    "Review the change before committing",
  );
};
const commit = async (page) => {
  await page
    .getByRole("button", { name: "Commit reviewed revision", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
};
const importText = async (page, value) => {
  await page
    .getByRole("button", { name: "Workspace backup and import", exact: true })
    .click();
  await page.locator("#import-file").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      typeof value === "string" ? value : JSON.stringify(value),
    ),
  });
};
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Where could STABLE fit?", exact: true }),
  ).toBeVisible();
});

test("independent profiles, intended settings and deliberate real-mode enablement", async ({
  page,
}, info) => {
  await saveDecision(page, "First profile assessment must stay isolated.");
  const first = (await stored(page)).workspace.activeProfileId;
  await page.locator(".profile-switch").click();
  await page
    .getByRole("button", { name: "Create independent profile", exact: true })
    .click();
  await page
    .getByLabel("Profile name", { exact: true })
    .fill("Second Research Profile");
  await page.getByLabel("Placeholder ticker", { exact: true }).fill("DEMO");
  await page
    .getByLabel("Reference currency (intended)", { exact: true })
    .fill("USD");
  await page
    .getByLabel("Intended markets (comma-separated)", { exact: true })
    .fill("Example market");
  await reason(page);
  await page
    .getByRole("button", { name: "Create independent profile", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("[data-demo-notice]")).toContainText(
    "Second Research Profile (DEMO) is fictional",
  );
  await expect(page.locator(".decision-list")).not.toContainText(
    "First profile assessment",
  );
  await expect(page.locator(".decision-card .pill.warn")).toHaveCount(3);
  await page.locator(".profile-switch").click();
  await page
    .getByRole("button", { name: "Edit active profile", exact: true })
    .click();
  await page
    .getByLabel("Profile mode", { exact: true })
    .selectOption("researched_profile");
  await page
    .getByLabel("Issuer subject (optional; real research mode only)", {
      exact: true,
    })
    .fill("Example public research subject");
  await reason(page);
  await page
    .getByRole("button", { name: "Save profile revision", exact: true })
    .click();
  await expect(page.locator(".workflow-error")).toContainText(
    "explicit confirmation",
  );
  await page
    .getByRole("checkbox", {
      name: "I deliberately enable a real research subject;",
      exact: false,
    })
    .check();
  await page
    .getByRole("button", { name: "Save profile revision", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("[data-demo-notice]")).toContainText(
    "unverified research subject",
  );
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page.locator(".org-table")).toContainText(
    "Issuer relationship unverified",
  );
  await overflow(page);
  await page.screenshot({
    path: `artifacts/${info.project.name}-profile.png`,
    fullPage: true,
  });
  const exported = await stored(page),
    states = projectWorkspace(exported.dataset, exported.workspace).profiles;
  expect(states[first].decisions["D-G01"].value.notes).toContain(
    "must stay isolated",
  );
  expect(
    states[exported.workspace.activeProfileId].decisions["D-G01"].value.notes,
  ).toBe("");
  await page.locator(".profile-switch").click();
  await page.locator(`[data-switch-profile="${first}"]`).click();
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-card").first()).toContainText(
    "First profile assessment",
  );
});

test("unchanged and unreachable checks preserve original dates, claims and reviewed assumptions", async ({
  page,
}) => {
  await evidence(page);
  const original = await stored(page);
  const source = page.locator(".evidence-workbench > aside #source-S-G02");
  await source
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await reason(
    page,
    "Original source read unchanged; no content claim revised.",
  );
  await page.getByLabel("Review cadence (days)", { exact: true }).fill("7");
  await dialog(page)
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(source).toContainText("Check recorded");
  await source
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await page
    .getByLabel("Check outcome", { exact: true })
    .selectOption("unreachable");
  await reason(
    page,
    "Page inaccessible during this review; adoption remains unknown.",
  );
  await dialog(page)
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(source).toContainText("Coverage unresolved");
  const value = await stored(page),
    s = projectWorkspace(value.dataset, value.workspace).profiles[
      value.workspace.activeProfileId
    ],
    before = projectWorkspace(original.dataset, original.workspace).profiles[
      original.workspace.activeProfileId
    ];
  expect(s.sources["S-G02"]).toEqual(before.sources["S-G02"]);
  expect(s.evidence["E-G02"]).toEqual(before.evidence["E-G02"]);
  expect(s.assumptions["A-P-G01-2"].review).toEqual(
    before.assumptions["A-P-G01-2"].review,
  );
  expect(s.checks.map((c) => c.outcome)).toEqual(["unchanged", "unreachable"]);
  await overflow(page);
});

test("source revision preview, exact impact, stale decision and inspectable atomic history", async ({
  page,
}, info) => {
  await saveDecision(page);
  await evidence(page);
  await page
    .locator(".evidence-workbench > aside #source-S-G02")
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await page
    .getByLabel("Check outcome", { exact: true })
    .selectOption("content_revised");
  await reason(
    page,
    "Manually qualified the public product scope; no fictional acceptance inferred.",
  );
  await dialog(page)
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  const claim = page.getByLabel("Claim statement", { exact: true });
  const old = await claim.inputValue();
  await claim.fill(
    old +
      " Example researcher qualification: issuer eligibility remains unproven.",
  );
  await preview(page);
  const panel = page.locator("#revision-preview");
  await expect(panel).toContainText(old);
  await expect(panel).toContainText("A-P-G01-2");
  await expect(panel).toContainText("D-G01");
  await expect(panel).not.toContainText("A-P-G01-1");
  await expect(panel).not.toContainText("D-G02");
  await overflow(page);
  await page.screenshot({
    path: `artifacts/${info.project.name}-revision-preview.png`,
  });
  await commit(page);
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-card").first()).toContainText(
    "Decision stale",
  );
  await expect(page.locator(".decision-card").nth(1)).toContainText(
    "Baseline reviewed",
  );
  const payload = await stored(page),
    events = payload.workspace.events.slice(-2);
  expect(events.map((e) => e.type)).toEqual([
    "evidence_revision",
    "source_check",
  ]);
  expect(events[0].opId).toBe(events[1].opId);
  await page.getByRole("link", { name: "Changes", exact: true }).click();
  await page.locator(`[data-event="${events[0].id}"]`).click();
  await expect(dialog(page)).toContainText(old);
  await expect(dialog(page)).toContainText("Example researcher qualification");
  await expect(dialog(page)).toContainText("Researcher");
  await overflow(page);
  await page.screenshot({ path: `artifacts/${info.project.name}-history.png` });
});

test("withdrawal blocks endorsement; dependency revision and review retain earlier decisions", async ({
  page,
}) => {
  await saveDecision(page);
  await edit(page, "E-G02");
  await page
    .getByLabel("Evidence status", { exact: true })
    .selectOption("withdrawn");
  await reason(
    page,
    "Withdraw this locally unsupported reading; original revision remains available.",
  );
  await preview(page);
  await commit(page);
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("button", { name: "Review assessment", exact: false })
    .first()
    .click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed these assumptions against the current evidence.",
      exact: true,
    })
    .check();
  await page
    .getByLabel("Research notes", { exact: true })
    .fill("Cannot endorse an assumption that depends on withdrawn evidence.");
  const count = (await stored(page)).workspace.events.length;
  await page
    .getByRole("button", { name: "Save local assessment", exact: true })
    .click();
  await expect(page.locator("#decision-error")).toContainText(
    "blocks assumption endorsement",
  );
  expect((await stored(page)).workspace.events).toHaveLength(count);
  await page.locator('[data-edit-assumption="A-P-G01-2"]').click();
  await page.locator('input[name="evidenceIds"][value="E-G02"]').uncheck();
  await reason(
    page,
    "Remove withdrawn claim from the current assumption basis; other limitations retained.",
  );
  await page
    .getByRole("button", { name: "Save assumption revision", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  await saveDecision(
    page,
    "Rechecked remaining public context; fictional demand remains a hypothesis.",
  );
  await expect(page.locator(".decision-card").first()).toContainText(
    "Reviewed locally",
  );
  const events = (await stored(page)).workspace.events;
  expect(events.filter((e) => e.type === "decision_saved")).toHaveLength(2);
  expect(
    events.some(
      (e) => e.type === "evidence_revision" && e.after.status === "withdrawn",
    ),
  ).toBe(true);
});

test("add original source and claim with mandatory explicit assumption dependencies", async ({
  page,
}) => {
  await evidence(page);
  await page
    .getByRole("button", { name: "Add original source", exact: true })
    .click();
  await page
    .getByLabel("Original source title", { exact: true })
    .fill("Example researcher-entered source record");
  await page.getByLabel("Publisher", { exact: true }).fill("Circle");
  await page
    .getByLabel("Original HTTPS URL", { exact: true })
    .fill("https://www.circle.com/circle-mint");
  await page
    .getByLabel("Location in source", { exact: true })
    .fill("Circle Mint product overview");
  await page
    .getByLabel("Date and scope caveats", { exact: true })
    .fill("Example manual entry of a public page; no new factual claim.");
  await reason(page);
  await dialog(page)
    .getByRole("button", { name: "Add original source", exact: true })
    .click();
  await expect(dialog(page)).not.toBeVisible();
  const sourceId = (await stored(page)).workspace.events.at(-1).recordId;
  await page.getByRole("button", { name: "Add evidence", exact: true }).click();
  await page
    .getByLabel("Claim statement", { exact: true })
    .fill(
      "Synthetic example: assess intended merchant settlement requirements.",
    );
  await page
    .getByLabel("Classification", { exact: true })
    .selectOption("synthetic_example");
  await page
    .getByLabel("Scope and important limits", { exact: true })
    .fill(
      "Constructed example; no fictional product support or partnership exists.",
    );
  await page
    .getByLabel("Independent check coverage", { exact: true })
    .fill("No external verification of fictional fit.");
  await page.locator(`input[name="sourceIds"][value="${sourceId}"]`).check();
  await page.locator('input[name="organizationIds"][value="stripe"]').check();
  await reason(page);
  await page
    .getByRole("button", { name: "Preview new evidence", exact: true })
    .click();
  await expect(page.locator(".workflow-error")).toContainText(
    "selected assumptions",
  );
  await page.locator('input[name="assumptionIds"][value="A-P-G01-1"]').check();
  await page
    .getByRole("button", { name: "Preview new evidence", exact: true })
    .click();
  await expect(page.locator("#revision-preview")).toContainText("A-P-G01-1");
  await commit(page);
  await page
    .getByRole("searchbox", { name: "Search evidence ledger", exact: true })
    .fill("intended merchant");
  await expect(ledger(page).locator(".evidence-record")).toHaveCount(1);
  await expect(ledger(page)).toContainText("Synthetic example");
  const payload = await stored(page),
    s = projectWorkspace(payload.dataset, payload.workspace).profiles[
      payload.workspace.activeProfileId
    ];
  const id = payload.workspace.events.findLast(
    (e) => e.type === "evidence_added",
  ).recordId;
  expect(s.assumptions["A-P-G01-1"].value.evidenceIds).toContain(id);
  expect(s.evidence[id].value.sourceRole).toBe("context_only");
  await overflow(page);
});

test("interrupted drafts recover and repeated commits produce one revision", async ({
  page,
}) => {
  await edit(page, "E-G03");
  const claim = page.getByLabel("Claim statement", { exact: true });
  const old = await claim.inputValue();
  await claim.fill(old + " Local draft caveat preserved.");
  await reason(page, "Draft recovery test with public context only.");
  await preview(page);
  expect((await stored(page)).workspace.events).toHaveLength(0);
  await page.reload();
  await edit(page, "E-G03");
  await expect(page.getByLabel("Claim statement", { exact: true })).toHaveValue(
    old + " Local draft caveat preserved.",
  );
  await expect(page.locator(".draft-note")).toContainText("Recovered");
  await preview(page);
  const button = page.getByRole("button", {
    name: "Commit reviewed revision",
    exact: true,
  });
  await button.evaluate((el) => {
    el.click();
    el.click();
  });
  await expect(dialog(page)).not.toBeVisible();
  expect(
    (await stored(page)).workspace.events.filter(
      (e) => e.type === "evidence_revision",
    ),
  ).toHaveLength(1);
  await page.reload();
  const value = await stored(page);
  expect(value.workspace.events).toHaveLength(1);
  await edit(page, "E-G03");
  await expect(page.getByLabel("Claim statement", { exact: true })).toHaveValue(
    old + " Local draft caveat preserved.",
  );
});

test("two-tab conflict retains draft and explicit rebase previews the actual latest basis", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator(".brand")).toBeVisible();
  await edit(page, "E-G03");
  await edit(second, "E-G03");
  const original = await page
    .getByLabel("Claim statement", { exact: true })
    .inputValue();
  await second
    .getByLabel("Claim statement", { exact: true })
    .fill(original + " Second tab draft.");
  await reason(second, "Second tab retained draft.");
  await page
    .getByLabel("Claim statement", { exact: true })
    .fill(original + " First tab committed.");
  await reason(page, "First tab scope revision.");
  await preview(page);
  await commit(page);
  await expect(second.locator(".storage-banner")).toContainText(
    "changed in another tab",
  );
  await preview(second);
  await second
    .getByRole("button", { name: "Commit reviewed revision", exact: true })
    .click();
  await expect(second.locator(".workflow-error")).toContainText(
    "changed in another tab",
  );
  await expect(
    second.getByLabel("Claim statement", { exact: true }),
  ).toHaveValue(original + " Second tab draft.");
  expect((await stored(page)).workspace.events).toHaveLength(1);
  await second
    .getByRole("button", {
      name: "Use latest basis and preview again",
      exact: true,
    })
    .click();
  await preview(second);
  await expect(second.locator("#revision-preview")).toContainText(
    "First tab committed.",
  );
  await expect(second.locator("#revision-preview")).toContainText(
    "Second tab draft.",
  );
  await commit(second);
  expect((await stored(second)).workspace.events).toHaveLength(2);
  await second.close();
});

test("validated import rejects tampered and divergent histories without replacing saved work", async ({
  page,
}) => {
  await saveDecision(page);
  const payload = await stored(page);
  const altered = structuredClone(payload);
  altered.workspace.events[0].after.eventId = "EV-invalid";
  await importText(page, altered);
  await expect(page.locator("#import-error")).toContainText("Import rejected");
  expect((await stored(page)).workspace.events).toEqual(
    payload.workspace.events,
  );
  await page.keyboard.press("Escape");
  const prefix = { ...payload.workspace, events: [] };
  const s = projectWorkspace(payload.dataset, prefix).profiles[
    prefix.activeProfileId
  ];
  const divergent = commitOperation(payload.dataset, prefix, {
    type: "evidence_revision",
    profileId: prefix.activeProfileId,
    recordId: "E-G03",
    after: {
      ...s.evidence["E-G03"].value,
      scope: "Alternate research branch; eligibility unknown.",
    },
    expectedRevision: s.evidence["E-G03"].revision,
    expectedHead: workspaceHead(prefix),
    opId: uid("OP"),
    actor: "Researcher",
    rationale: "Divergent local evidence branch.",
  }).workspace;
  await importText(page, exportV2(payload.dataset, divergent));
  await expect(page.locator("#import-error")).toContainText(
    "Divergent revision history",
  );
  await expect(page.locator("[data-apply-import]")).toHaveCount(0);
  expect((await stored(page)).workspace.events).toEqual(
    payload.workspace.events,
  );
});

test("generic v1 migration preserves exact notes, reviews and original activity; reset archives v2", async ({
  page,
}) => {
  const legacy = blankWorkspace();
  legacy.decisions["D-G01"] = {
    status: "Parked",
    owner: "Researcher",
    notes: "Preserve this original generic note.",
    reviewBy: "2026-10-30",
  };
  legacy.reviews["P-G01"] = {
    fingerprint: "1234abcd",
    reviewedAt: "2026-09-30T01:00:00.000Z",
    reviewBy: "2026-10-30",
    note: "Original generic review.",
  };
  legacy.activity.push({
    kind: "decision_edit",
    at: "2026-09-30T01:00:00.000Z",
    summary: "Original generic local activity.",
  });
  const raw = JSON.stringify({ data: null, workspace: legacy });
  await page.evaluate((raw) => {
    localStorage.removeItem("stable-desk:v2");
    localStorage.setItem("stable-desk:generic-v1", raw);
  }, raw);
  await page.reload();
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-card").first()).toContainText(
    "Preserve this original generic note",
  );
  await expect(page.locator(".decision-card").first()).toContainText(
    "Legacy decision retained",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("stable-desk:generic-v1")),
  ).toBe(raw);
  await page.getByRole("link", { name: "Changes", exact: true }).click();
  await page.locator(".legacy-history summary").click();
  await expect(page.locator(".legacy-history")).toContainText(
    "Original generic local activity",
  );
  const old = (await stored(page)).workspace.id;
  await page
    .getByRole("button", { name: "Workspace backup and import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset local workspace", exact: true })
    .click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Workspace backup and import", exact: true })
    .click();
  await page.locator("[data-backup]").first().click();
  await expect(page.locator("#import-preview")).toContainText("Validated");
  await page
    .getByRole("button", { name: "Use in this browser", exact: true })
    .click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  expect((await stored(page)).workspace.id).toBe(old);
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-card").first()).toContainText(
    "Preserve this original generic note",
  );
});

test("browser-storage failure leaves coherent memory state and truthful export", async ({
  page,
}) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await saveDecision(page, "Memory-only assessment exported before reload.");
  await expect(page.locator(".storage-banner")).toContainText("in memory only");
  await expect(page.locator(".decision-card").first()).toContainText(
    "Memory-only assessment",
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  const file = await downloaded;
  const value = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(
    value.workspace.events.find((e) => e.type === "decision_saved").after.notes,
  ).toContain("Memory-only");
  expect(
    projectWorkspace(value.dataset, value.workspace).profiles[
      value.workspace.activeProfileId
    ].decisions["D-G01"].value.notes,
  ).toContain("Memory-only");
  expect((await stored(page)).workspace.events).toHaveLength(0);
});

test("invalid saved cache stays intact until explicit archive/reset and raw recovery", async ({
  page,
}) => {
  const raw = "{invalid saved snapshot";
  await page.evaluate(
    (raw) => localStorage.setItem("stable-desk:v2", raw),
    raw,
  );
  await page.reload();
  await expect(page.locator(".storage-banner")).toContainText(
    "invalid and preserved",
  );
  await page
    .getByRole("button", { name: "Workspace backup and import", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download unparsed saved data", exact: true })
    .click();
  const file = await downloaded;
  expect(await readFile(await file.path(), "utf8")).toBe(raw);
  await page
    .getByRole("button", { name: "Reset local workspace", exact: true })
    .click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("stable-desk:archive:"))
        .map((k) => localStorage.getItem(k)),
    ),
  ).toContain(raw);
  expect((await stored(page)).workspace.events).toHaveLength(0);
});

test("maintenance uses local interactions without automatic third-party collection", async ({
  page,
}) => {
  const outside = [];
  page.on("request", (req) => {
    if (new URL(req.url()).hostname !== "127.0.0.1") outside.push(req.url());
  });
  await saveDecision(page);
  await edit(page, "E-G02");
  await reason(page, "No automatic source fetching.");
  await page
    .getByLabel("Claim statement", { exact: true })
    .fill(
      "Example local qualification of original public market scope; eligibility unknown.",
    );
  await preview(page);
  await commit(page);
  await page.reload();
  expect(outside).toEqual([]);
});

test("a cache corrupted during editing is retained rather than mistaken for storage failure", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("button", { name: "Review assessment", exact: false })
    .first()
    .click();
  await page
    .getByLabel("Research notes", { exact: true })
    .fill("Retained draft while cache is corrupt.");
  const raw = JSON.stringify({ unrecognized: "malformed cache with no seed" });
  await page.evaluate(
    (raw) => localStorage.setItem("stable-desk:v2", raw),
    raw,
  );
  await page
    .getByRole("button", { name: "Save local assessment", exact: true })
    .click();
  await expect(page.locator("#decision-error")).toContainText("preserved");
  expect(
    await page.evaluate(() => localStorage.getItem("stable-desk:v2")),
  ).toBe(raw);
  await expect(page.getByLabel("Research notes", { exact: true })).toHaveValue(
    "Retained draft while cache is corrupt.",
  );
  await close(page);
  await page
    .getByRole("button", { name: "Workspace backup and import", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Download unparsed saved data",
      exact: true,
    }),
  ).toBeVisible();
});
