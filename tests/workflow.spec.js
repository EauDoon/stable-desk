import { test, expect } from "./fixtures.js";
import { readFile } from "node:fs/promises";
import {
  prepareDataset,
  projectWorkspace,
  commitOperation,
  workspaceHead,
  uid,
  exportV2,
  createWorkspace,
  IMPORT_LIMIT_BYTES,
} from "../src/workspace.js";
import { blankWorkspace } from "../src/model.js";
const seed = prepareDataset(
  JSON.parse(
    await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
  ),
);
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("stable-desk:v2")));
const saveReview = (page, payload) => page.evaluate(async (desk) => {
  const { initialReview } = await import("/src/review-model.js");
  localStorage.setItem("stable-desk:review", JSON.stringify(initialReview(null, desk)));
}, payload);
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
    path: `test-results/artifacts/${info.project.name}-profile.png`,
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
    path: `test-results/artifacts/${info.project.name}-revision-preview.png`,
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
  await page.screenshot({ path: `test-results/artifacts/${info.project.name}-history.png` });
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

test("draft rebase keeps its original profile after another tab creates a profile", async ({ page, context }) => {
  const originalProfile = (await stored(page)).workspace.activeProfileId;
  const second = await context.newPage();
  await second.goto("/");
  await edit(second, "E-G03");
  const claim = second.getByLabel("Claim statement", { exact: true });
  const revised = (await claim.inputValue()) + " Original profile draft.";
  await claim.fill(revised);
  await reason(second, "Keep this revision in the original research profile.");

  await page.locator(".profile-switch").click();
  await page.getByRole("button", { name: "Create independent profile", exact: true }).click();
  await page.getByLabel("Profile name", { exact: true }).fill("Separate Research Profile");
  await page.getByLabel("Placeholder ticker", { exact: true }).fill("DEMO");
  await reason(page);
  await page.getByRole("button", { name: "Create independent profile", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  await edit(page, "E-G03");
  await page.getByLabel("Claim statement", { exact: true }).fill("Separate profile claim must remain unchanged by another profile's draft.");
  await reason(page);
  await preview(page);
  await commit(page);
  const before = await stored(page);
  const otherProfile = before.workspace.activeProfileId;

  await preview(second);
  await second.getByRole("button", { name: "Commit reviewed revision", exact: true }).click();
  await expect(second.locator(".workflow-error")).toContainText("changed in another tab");
  await second.getByRole("button", { name: "Use latest basis and preview again", exact: true }).click();
  await expect(claim).toHaveValue(revised);
  await preview(second);
  await expect(second.locator("#revision-preview")).not.toContainText("Separate profile claim");
  await commit(second);

  const after = await stored(second);
  const profiles = projectWorkspace(after.dataset, after.workspace).profiles;
  expect(after.workspace.events.at(-1).profileId).toBe(originalProfile);
  expect(profiles[originalProfile].evidence["E-G03"].value.statement).toBe(revised);
  expect(profiles[otherProfile]).toEqual(projectWorkspace(before.dataset, before.workspace).profiles[otherProfile]);
  await second.close();
});

test("draft rebase refuses a replacement workspace and retains the original draft", async ({ page, context }) => {
  const original = await stored(page);
  const second = await context.newPage();
  await second.goto("/");
  await edit(second, "E-G03");
  const claim = second.getByLabel("Claim statement", { exact: true });
  const revised = (await claim.inputValue()) + " Preserve this original workspace draft.";
  await claim.fill(revised);
  await reason(second);
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.getByRole("button", { name: "Reset local workspace", exact: true }).click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  const replacement = await stored(page);
  expect(replacement.workspace.id).not.toBe(original.workspace.id);

  await preview(second);
  await second.getByRole("button", { name: "Commit reviewed revision", exact: true }).click();
  await expect(second.locator(".workflow-error")).toContainText("changed in another tab");
  const draftBefore = await second.evaluate(() => localStorage.getItem("stable-desk:drafts-v2"));
  // Repeated attempts must not adopt the replacement as the draft's new origin.
  for (let attempt = 0; attempt < 2; attempt++) {
    await second.getByRole("button", { name: "Use latest basis and preview again", exact: true }).click();
    await expect(second.locator("#notice")).toContainText("different workspace");
    await expect(claim).toHaveValue(revised);
    expect(await stored(second)).toEqual(replacement);
    expect(await second.evaluate(() => localStorage.getItem("stable-desk:drafts-v2"))).toBe(draftBefore);
  }
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

test("a delayed import cannot replace a newer file, rejection or recovery choice", async ({ page }) => {
  const payload = await stored(page);
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== "slow.json") return read.call(this);
      return new Promise((resolve) => { window.finishImport = async () => resolve(await read.call(this)); });
    };
  });
  const file = (name, value) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  for (const newest of ["valid", "invalid"]) {
    await page.locator("#import-file").setInputFiles(file("slow.json", {
      ...payload, workspace: { ...payload.workspace, id: "WS-SLOW" },
    }));
    await page.locator("#import-file").setInputFiles(file("latest.json", newest === "valid" ? {
      ...payload, workspace: { ...payload.workspace, id: "WS-LATEST" },
    } : {}));
    if (newest === "valid") await expect(page.locator("[data-apply-import]")).toBeVisible();
    else await expect(page.locator("#import-error")).toContainText("Import rejected");
    await page.evaluate(() => window.finishImport());
    if (newest === "valid") {
      await page.locator("[data-apply-import]").click();
      await expect(page.locator("#utility-dialog")).not.toBeVisible();
      expect((await stored(page)).workspace.id).toBe("WS-LATEST");
      await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
    } else {
      await expect(page.locator("[data-apply-import]")).toHaveCount(0);
      await expect(page.locator("#import-error")).toContainText("Import rejected");
    }
  }
  await page.locator("#import-file").setInputFiles(file("slow.json", {
    ...payload, workspace: { ...payload.workspace, id: "WS-SLOW" },
  }));
  await page.locator("[data-backup]").first().click();
  await page.evaluate(() => window.finishImport());
  await page.locator("[data-apply-import]").click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  expect((await stored(page)).workspace.id).toBe(payload.workspace.id);
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.locator("#import-file").setInputFiles(file("slow.json", payload));
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.finishImport());
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await expect(page.locator("[data-apply-import]")).toHaveCount(0);
});

test("review queue separates due work and opens the exact manual review", async ({ page }, info) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  await evidence(page);
  const queue = page.locator(".review-queue");
  await expect(queue.getByRole("heading", { name: "Review queue", exact: true })).toBeVisible();
  await expect(queue.locator('[data-queue-kind="source"]')).toHaveCount(10);
  const assumptions = await queue.locator('[data-queue-kind="assumption"]').count();
  expect(assumptions).toBeGreaterThan(0);
  await page.locator("#queue-filter").selectOption("source");
  await expect(queue.locator(".queue-row")).toHaveCount(10);
  await expect(queue).toContainText("Check due today");
  const sourceRow = queue.locator('[data-queue-id="S-G01"]');
  await sourceRow.getByRole("button", { name: "Record check" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#source-check-form")).toHaveAttribute("data-record", "S-G01");
  await reason(page, "Public source reviewed unchanged; no assumption endorsement implied.");
  await dialog(page).getByRole("button", { name: "Record manual check", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator("#queue-filter")).toHaveValue("source");
  await expect(sourceRow).toHaveCount(0);

  await page.locator("#queue-filter").selectOption("assumption");
  await expect(queue.locator(".queue-row")).toHaveCount(assumptions);
  const assumptionId = await queue.locator(".queue-row").first().getAttribute("data-queue-id");
  await queue.getByRole("button", { name: "Review assumption", exact: true }).first().click();
  const checkbox = dialog(page).locator(`input[name="assumptionIds"][value="${assumptionId}"]`);
  await expect(checkbox).toBeFocused();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await page.getByLabel("Research notes", { exact: true }).fill("Reviewed only this assumption against its current evidence; other work remains due.");
  await page.getByLabel("Review by", { exact: true }).fill("2026-11-06");
  await page.getByRole("button", { name: "Save local assessment", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(queue.locator(`[data-queue-id="${assumptionId}"]`)).toHaveCount(0);
  await expect(queue.locator(".queue-row")).toHaveCount(assumptions - 1);
  await page.locator("#queue-filter").selectOption("all");
  await overflow(page);
  await queue.screenshot({ path: info.outputPath("review-queue.png") });
});

test("review queue exposes unresolved coverage and blocked dependencies without endorsement", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
  await evidence(page);
  const queue = page.locator(".review-queue");
  await expect(queue).toContainText("No reviews due for this profile");
  await page.locator('.evidence-workbench > aside #source-S-G02').getByRole("button", { name: "Record manual check" }).click();
  await page.getByLabel("Check outcome", { exact: true }).selectOption("unreachable");
  await reason(page);
  await dialog(page).getByRole("button", { name: "Record manual check", exact: true }).click();
  await expect(queue.locator('[data-queue-id="S-G02"]')).toContainText("Coverage unresolved");
  await edit(page, "E-G02");
  await page.getByLabel("Evidence status", { exact: true }).selectOption("withdrawn");
  await reason(page);
  await preview(page);
  await commit(page);
  const blocked = queue.locator('[data-queue-id="A-P-G01-2"]');
  await expect(blocked).toContainText("Blocked by evidence");
  await blocked.getByRole("button", { name: "Inspect dependencies" }).click();
  await expect(page.locator("#assumption-form")).toHaveAttribute("data-record", "A-P-G01-2");
  await close(page);
  await page.locator("#queue-filter").selectOption("decision");
  await expect(queue).toContainText("No reviews of this type need attention");
  await expect(queue.locator("#queue-count")).not.toHaveText("0 of 0 reviews need attention");
});

test("local review choice cancels delayed files and clears earlier previews on errors", async ({ page }) => {
  const payload = await stored(page);
  await saveReview(page, payload);
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== "slow.json") return read.call(this);
      return new Promise((resolve) => { window.finishImport = async () => resolve(await read.call(this)); });
    };
  });
  const file = (name) => ({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...payload, workspace: { ...payload.workspace, id: "WS-SLOW" } })) });
  await page.locator("#import-file").setInputFiles(file("slow.json"));
  await page.getByRole("button", { name: "Preview adopted source review" }).click();
  await expect(page.locator("#import-preview")).toContainText("Source review snapshot, version 0");
  await page.evaluate(() => window.finishImport());
  await expect(page.locator("#import-preview")).toContainText("Source review snapshot");
  await page.getByRole("button", { name: "Use in this browser", exact: true }).click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  expect((await stored(page)).workspace.id).toBe(payload.workspace.id);
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  for (const raw of [null, "{broken review"]) {
    await page.locator("#import-file").setInputFiles(file("valid.json"));
    await expect(page.locator("[data-apply-import]")).toBeVisible();
    await page.evaluate(value => value === null ? localStorage.removeItem("stable-desk:review") : localStorage.setItem("stable-desk:review", value), raw);
    await page.getByRole("button", { name: "Preview adopted source review" }).click();
    await expect(page.locator("#import-error")).not.toBeEmpty();
    await expect(page.locator("[data-apply-import]")).toHaveCount(0);
    await page.locator("#import-file").setInputFiles(file("slow.json"));
    await page.getByRole("button", { name: "Preview adopted source review" }).click();
    await page.evaluate(() => window.finishImport());
    await expect(page.locator("[data-apply-import]")).toHaveCount(0);
    expect((await stored(page)).workspace).toEqual(payload.workspace);
    expect(await page.evaluate(() => localStorage.getItem("stable-desk:review"))).toBe(raw);
  }
});

test("review queue supports imported assumptions without a corresponding decision", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00Z"));
  const partial = structuredClone(seed);
  partial.decisions = partial.decisions.filter(d => d.id !== "D-G03");
  await importText(page, partial);
  await page.getByRole("button", { name: "Use in this browser", exact: true }).click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  await evidence(page);
  const row = page.locator('.review-queue [data-queue-id="A-P-G03-1"]');
  await expect(row).toContainText("No linked decision is configured");
  await row.getByRole("button", { name: "Inspect dependencies", exact: true }).click();
  await expect(page.locator("#assumption-form")).toHaveAttribute("data-record", "A-P-G03-1");
});

test("same-tab edits invalidate a local review import preview", async ({ page }) => {
  const original = await stored(page);
  await saveReview(page, original);
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.getByRole("button", { name: "Preview adopted source review" }).click();
  await page.getByRole("button", { name: "Manage profiles", exact: true }).click();
  await page.getByRole("button", { name: "Edit active profile", exact: true }).click();
  await page.getByLabel("Profile name", { exact: true }).fill("Newer profile edit");
  await reason(page);
  await page.getByRole("button", { name: "Save profile revision", exact: true }).click();
  await expect(dialog(page)).not.toBeVisible();
  const newer = await stored(page);
  expect(newer.workspace.events.length).toBe(original.workspace.events.length + 1);
  await page.getByRole("button", { name: "Use in this browser", exact: true }).click();
  await expect(page.locator("#import-error")).toContainText("Workspace changed since this preview");
  expect(await stored(page)).toEqual(newer);
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

test("a plain-HTTP preview opened by LAN address still opens the desk and source review", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "One non-secure origin check covers both layouts.");
  // A LAN or VM address over HTTP is not a secure context, so crypto.randomUUID
  // is absent there. Proxy a non-loopback origin to the local server.
  await page.route("http://lan-preview.test/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:4173${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto("http://lan-preview.test/");
  expect(await page.evaluate(() => [isSecureContext, typeof crypto.randomUUID])).toEqual([false, "undefined"]);
  await expect(
    page.getByRole("heading", { name: "Where could STABLE fit?", exact: true }),
  ).toBeVisible();
  await saveDecision(page, "Assessment saved from a plain-HTTP preview origin.");
  const events = (await stored(page)).workspace.events;
  expect(events.at(-1).type).toBe("decision_saved");
  for (const event of events)
    expect(event.id).toMatch(/^EV-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await page.goto("http://lan-preview.test/review.html");
  await page.getByRole("button", { name: "Start from public baseline" }).click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".footer")).toContainText("Version 0");
});

test("wrong JSON files and vanished recovery copies are rejected in plain terms", async ({ page }) => {
  await importText(page, {});
  await expect(page.locator("#import-error")).toHaveText(
    "Import rejected: Dataset meta must be an object.",
  );
  await page.locator("#import-file").setInputFiles({
    name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{"),
  });
  await expect(page.locator("#import-error")).toHaveText("Import rejected: Import is not valid JSON.");
  await expect(page.locator("[data-apply-import]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("stable-desk:archive:1:BACKUP-gone", "{}"));
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("stable-desk:archive:1:BACKUP-gone"));
  await page.locator('[data-backup="stable-desk:archive:1:BACKUP-gone"]').click();
  await expect(page.locator("#import-error")).toHaveText(
    "Recovery rejected: That recovery copy is no longer available.",
  );
});

test("a save that would exceed the reload limit is refused and nothing is written", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Storage limits do not depend on the layout.");
  // Build a valid history just under the 4 MiB reload limit from long notes.
  const long = (i, n = 10000) => `${i} `.padEnd(n, "x");
  const base = seed.decisions.find((d) => d.id === "D-G01");
  let ws = createWorkspace(seed), i = 0;
  const save = (from, notes) => {
    const s = projectWorkspace(seed, from).profiles[from.activeProfileId];
    return commitOperation(seed, from, {
      type: "decision_saved",
      profileId: from.activeProfileId,
      recordId: "D-G01",
      expectedRevision: s.decisions["D-G01"].revision,
      expectedHead: workspaceHead(from),
      opId: uid("OP"),
      actor: "Researcher",
      rationale: notes,
      after: { status: base.status, owner: base.owner, reviewBy: base.reviewBy, notes },
      assumptionIds: [],
    }).workspace;
  };
  const size = (value) => JSON.stringify(exportV2(seed, value)).length;
  // Each event stores the previous note, the new note and the rationale (the
  // same text), plus a roughly constant overhead. Stop about 8,000 characters
  // short of the limit, so the browser's 10,000-character note cannot fit.
  let current = size(ws), previous = 0, overhead = 2000;
  while (IMPORT_LIMIT_BYTES - current > 10000) {
    const n = Math.min(10000, Math.floor((IMPORT_LIMIT_BYTES - current - 8000 - previous - overhead) / 2));
    if (n < 50) break;
    ws = save(ws, long(++i, n));
    const next = size(ws);
    overhead = next - current - previous - 2 * n;
    current = next;
    previous = n;
  }
  expect(current).toBeLessThan(IMPORT_LIMIT_BYTES);
  expect(IMPORT_LIMIT_BYTES - current).toBeLessThan(20000);
  const raw = JSON.stringify(exportV2(seed, ws));
  await page.evaluate((raw) => localStorage.setItem("stable-desk:v2", raw), raw);
  await page.reload();
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await page.getByRole("button", { name: "Review assessment", exact: false }).first().click();
  await page.getByLabel("Research notes", { exact: true }).fill("y".repeat(10000));
  await page.getByRole("button", { name: "Save local assessment", exact: true }).click();
  await expect(dialog(page).locator(".workflow-error")).toContainText(
    "would make the saved workspace exceed 4 MB",
  );
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("stable-desk:v2"))).toBe(raw);
  await page.reload();
  expect((await stored(page)).workspace.events).toHaveLength(ws.events.length);
});

test("recovery copies stay bounded, survive a full quota and can be deleted one at a time", async ({ page }) => {
  const before = (await stored(page)).workspace.id;
  // Fill the origin quota with large, valid recovery copies, as repeated
  // imports and resets used to.
  const seeded = await page.evaluate(() => {
    const padded = localStorage.getItem("stable-desk:v2").padEnd(400_000, " ");
    localStorage.setItem("stable-desk:review-history", "[]");
    let count = 0;
    for (let i = 1; i <= 40; i++) {
      try {
        localStorage.setItem(`stable-desk:archive:${1000 + i}:BACKUP-seed-${i}`, padded);
        count++;
      } catch {
        break;
      }
    }
    return count;
  });
  expect(seeded).toBeGreaterThan(10);
  expect(seeded).toBeLessThan(40); // the quota refused a further copy
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await expect(page.locator("[data-backup]")).toHaveCount(seeded);
  await page.getByRole("button", { name: "Reset local workspace", exact: true }).click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  await expect(page.locator("#notice")).toContainText("Opened validated workspace");
  const after = await page.evaluate(() => ({
    archives: Object.keys(localStorage).filter((k) => k.startsWith("stable-desk:archive:")).sort(),
    history: localStorage.getItem("stable-desk:review-history"),
  }));
  expect((await stored(page)).workspace.id).not.toBe(before);
  expect(after.history).toBe("[]");
  expect(after.archives.length).toBeGreaterThan(0);
  expect(after.archives.length).toBeLessThanOrEqual(10);
  // The newest copy is the workspace that the reset replaced.
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  const rows = page.locator("[data-backup]");
  await expect(rows).toHaveCount(after.archives.length);
  await expect(rows.first()).toContainText(before);
  expect(await rows.first().getAttribute("data-backup")).toBe(after.archives.at(-1));
  // Deleting needs a second, confirming click and removes exactly one key.
  const target = await rows.last().getAttribute("data-backup");
  const remove = page.locator(`[data-delete-backup="${target}"]`);
  await remove.click();
  await expect(remove).toHaveText("Confirm delete");
  expect(await page.evaluate((key) => localStorage.getItem(key) !== null, target)).toBe(true);
  await remove.click();
  await expect(rows).toHaveCount(after.archives.length - 1);
  const remaining = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("stable-desk:archive:")).sort());
  expect(remaining).toEqual(after.archives.filter((key) => key !== target));
  expect((await stored(page)).workspace.events).toHaveLength(0);
});

// Count full event-history replays by instrumenting the served module.
const countReplays = (page) =>
  page.route("**/src/workspace.js", async (route) => {
    const response = await route.fetch();
    const marker = "export function projectWorkspace(seed, ws) {";
    const body = (await response.text()).replace(
      marker,
      `${marker}\n  globalThis.__replays = (globalThis.__replays ?? 0) + 1;`,
    );
    expect(body).toContain("__replays");
    await route.fulfill({ response, body });
  });
const replays = (page) => page.evaluate(() => globalThis.__replays ?? 0);

test("views and decision saves reuse one projection instead of replaying history per render", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Replay counts do not depend on the layout.");
  await countReplays(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Where could STABLE fit?", exact: true })).toBeVisible();
  let before = await replays(page);
  expect(before).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-card")).toHaveCount(3);
  expect(await replays(page)).toBe(before);
  before = await replays(page);
  await saveDecision(page, "Replay budget check; public context only.");
  const added = (await replays(page)) - before;
  // commitOperation (2), the cross-tab disk re-parse and serialization (2)
  // and hydrate (1). Rendering the Decisions view adds none.
  expect(added).toBeLessThanOrEqual(5);
  await expect(page.locator(".decision-card").first()).toContainText("Replay budget check");
  before = await replays(page);
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page.getByRole("button", { name: "Open investigation Define one merchant acceptance problem" }).click();
  await expect(dialog(page)).toContainText("Load-bearing assumptions");
  expect(await replays(page)).toBe(before);
});
