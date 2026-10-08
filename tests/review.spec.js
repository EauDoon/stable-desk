import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
// v4 review surface. Local storage only: no account, no sign-in, no hosted
// state. The source check is served by the same /api/check the deployment uses.
const capture = (n) => ({
  outcome: "ok",
  status: 200,
  text: `Official stablecoin documentation. Merchants must examine business eligibility, country restrictions and supported tokens before using the payment product. Revision ${n}.`,
});
let page;
let context;
test.beforeEach(async ({ browser }, info) => {
  // A fresh context per test: localStorage is per-origin, so sharing one
  // context across parallel workers would leak review state between tests.
  context = await browser.newContext(info.project.use);
  page = await context.newPage();
  // A deterministic capture keeps the test offline and repeatable.
  let n = 0;
  await page.route("**/api/check", (route) => {
    n += 1;
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ capture: capture(n) }),
    });
  });
});
test.afterEach(async () => {
  await context.close();
});

test("review opens with no account, no sign-in and no hosted state", async () => {
  await page.goto("/review.html");
  await expect(
    page.getByRole("heading", { name: "Choose a safe starting point" }),
  ).toBeVisible();
  await expect(page.locator("#login-form")).toHaveCount(0);
  await expect(page.locator('[data-action="logout"]')).toHaveCount(0);
  await expect(
    page.getByText("Nothing is uploaded", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".review-header .pill")).toHaveText(
    `v${pkg.version} · bounded source review`,
  );
});

test("review file inputs are disabled until the selected backup finishes reading", async () => {
  await page.goto("/review.html");
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function () {
      return new Promise((resolve) => { window.finishImport = async () => resolve(await read.call(this)); });
    };
  });
  const desk = await page.evaluate(async () => {
    const { prepareDataset, createWorkspace, exportV2 } = await import("/src/workspace.js");
    const seed = prepareDataset(await (await fetch("/data/baseline.json")).json());
    return exportV2(seed, createWorkspace(seed));
  });
  await page.locator("#import-file").setInputFiles({
    name: "desk.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(desk)),
  });
  await expect(page.locator("#import-file")).toBeDisabled();
  await expect(page.locator("#restore-file")).toBeDisabled();
  await page.evaluate(() => window.finishImport());
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible();
  await expect(page.locator("#import-file")).toBeEnabled();
  await expect(page.locator("#restore-file")).toBeEnabled();
});

test("the desk links into review and review links back", async () => {
  await page.goto("/");
  await page.getByRole("link", { name: "Source review →" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a safe starting point" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Research desk" }).click();
  // Back on the desk: the four-view navigation and the review link are present.
  await expect(page.getByRole("navigation", { name: "Desk views" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Source review →" })).toBeVisible();
});

test("first check is a baseline and the second stages a review candidate", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await expect(page.locator(".review-empty")).toContainText(
    "No candidates pending",
  );
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 2");
  await expect(page.locator(".review-candidate")).toHaveCount(1);
});

test("accepting a candidate adopts a revision and flags the assumption", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await page.getByRole("button", { name: "Check source now" }).click();
  await page.locator(".review-candidate").click();
  await expect(page.locator("#candidate-detail")).toBeVisible();
  await page
    .getByLabel("Reviewed replacement claim")
    .fill("Stripe supports stablecoin settlement for eligible merchants.");
  await page
    .getByLabel("Review rationale")
    .fill("The published page now states merchant eligibility explicitly.");
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.locator(".footer")).toContainText("Version 3");
  await expect(page.locator(".review-candidate")).toHaveCount(0);
  // The adopted revision is visible in the review history with its hash.
  await page.getByRole("button", { name: /Checks & review history/ }).click();
  await expect(page.locator(".journal-event").first()).toContainText("accepted");
  await expect(page.locator(".journal-event").first()).toContainText("local-reviewer");
});

test("an unchanged claim is refused by the model, not silently adopted", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await page.getByRole("button", { name: "Check source now" }).click();
  await page.locator(".review-candidate").click();
  const current = await page
    .locator("#candidate-detail p", { hasText: "Currently adopted claim" })
    .textContent();
  const claim = current.replace("Currently adopted claim:", "").trim();
  expect(claim.length).toBeGreaterThan(15);
  await page.getByLabel("Reviewed replacement claim").fill(claim);
  await page
    .getByLabel("Review rationale")
    .fill("Attempting to adopt an unchanged claim, which must be refused.");
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.locator('[role="alert"]')).toContainText(
    /Unchanged claims/,
  );
  // Version must not advance on a refused operation.
  await expect(page.locator(".footer")).toContainText("Version 2");
});

test("adopted source review copies into the desk only after preview and confirmation", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where could STABLE fit?", exact: true })).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem("stable-desk:v2"));
  await page.goto("/review.html");
  await page.getByRole("button", { name: "Import local v2 export" }).click();
  await page.getByRole("button", { name: "Download original v2 backup" }).click();
  await page.getByRole("button", { name: "Confirm import", exact: true }).click();
  for (const version of [1, 2]) {
    await page.getByRole("button", { name: "Check source now" }).click();
    await expect(page.locator(".footer")).toContainText(`Version ${version}`);
  }
  await page.locator(".review-candidate").click();
  const claim = "Stripe documents revised merchant eligibility in this synthetic source-review test.";
  await page.getByLabel("Reviewed replacement claim").fill(claim);
  await page.getByLabel("Review rationale").fill("Reviewed the changed eligibility scope; no commercial acceptance inferred.");
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.locator(".footer")).toContainText("Version 3");
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 4");
  const reviewRaw = await page.evaluate(() => localStorage.getItem("stable-desk:review"));
  const review = JSON.parse(reviewRaw);
  expect(review.candidates.filter(c => c.status === "pending")).toHaveLength(1);
  await page.getByRole("link", { name: "Research desk", exact: true }).click();
  await page.getByRole("button", { name: "Workspace backup and import", exact: true }).click();
  await page.getByRole("button", { name: "Preview adopted source review" }).click();
  await expect(page.locator("#import-preview")).toContainText("Source review snapshot, version 4");
  await expect(page.locator("#import-preview")).toContainText("Pending candidates stay in Source review");
  expect(await page.evaluate(() => localStorage.getItem("stable-desk:v2"))).toBe(original);
  await page.getByRole("button", { name: "Use in this browser", exact: true }).click();
  await expect(page.locator("#utility-dialog")).not.toBeVisible();
  const desk = await page.evaluate(() => JSON.parse(localStorage.getItem("stable-desk:v2")));
  expect(desk.workspace.events).toEqual(review.desk.workspace.events);
  expect(await page.evaluate(() => localStorage.getItem("stable-desk:review"))).toBe(reviewRaw);
  const archives = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("stable-desk:archive:")).map(k => localStorage.getItem(k)));
  expect(archives).toContain(original);
  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  await expect(page.locator("#evidence-results")).toContainText(claim);
  await expect(page.locator('.review-queue [data-queue-id="A-P-G01-2"]')).toContainText("Needs assumption review");
  await page.reload();
  await expect(page.locator("#evidence-results")).toContainText(claim);
});

test("work survives a reload and can be exported", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await page.reload();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review backup" }).click();
  expect((await download).suggestedFilename()).toBe(
    "stable-desk-v4-review-backup.json",
  );
});

test("the weekly brief downloads and names the source", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Weekly change brief" }).click();
  expect((await download).suggestedFilename()).toBe(
    "stable-desk-weekly-brief.md",
  );
});

test("a failed source check is recorded as unresolved, not as a change", async () => {
  await page.goto("/review.html");
  await page.route("**/api/check", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        capture: {
          outcome: "unreachable",
          status: 403,
          note: "Restricted page; no candidate or adoption inferred.",
        },
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await expect(page.locator(".review-empty")).toContainText(
    "No candidates pending",
  );
  await page.getByRole("button", { name: /Checks & review history/ }).click();
  await expect(page.locator(".review-event").first()).toContainText(
    "unreachable",
  );
  await expect(page.locator(".journal-event")).toHaveCount(1);
});

test("a rejected candidate preserves the adopted claim", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await page.getByRole("button", { name: "Check source now" }).click();
  await page.locator(".review-candidate").click();
  await page
    .getByLabel("Review rationale")
    .fill("Page churn only; no material change to merchant eligibility.");
  await page.getByRole("button", { name: "Reject candidate" }).click();
  await expect(page.locator(".footer")).toContainText("Version 3");
  await expect(page.locator(".review-candidate")).toHaveCount(0);
});

test("reset is explicit: it downloads first and needs a second confirmation", async () => {
  await page.goto("/review.html");
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  // The first click downloads and only offers confirmation.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Reset local review" }).click();
  expect((await download).suggestedFilename()).toBe(
    "stable-desk-v4-review-before-reset.json",
  );
  await expect(
    page.getByRole("button", { name: "Confirm erase local review" }),
  ).toBeVisible();
  // Still present until confirmed.
  await expect(page.locator(".footer")).toContainText("Version 1");
  await page.getByRole("button", { name: "Confirm erase local review" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a safe starting point" }),
  ).toBeVisible();
  // And it is really gone after a reload.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Choose a safe starting point" }),
  ).toBeVisible();
});

test('unreadable bytes survive initialization and require guarded raw recovery', async () => {
  await page.goto('/review.html');
  await page.evaluate(() => localStorage.setItem('stable-desk:review', '{broken saved bytes'));
  await page.reload();
  await page.getByRole('button', { name: 'Start from public baseline' }).click();
  await expect(page.getByRole('alert')).toContainText('unreadable');
  expect(await page.evaluate(() => localStorage.getItem('stable-desk:review'))).toBe('{broken saved bytes');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download raw review' }).click();
  const stream = await (await download).createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe('{broken saved bytes');
  await page.evaluate(() => localStorage.setItem('stable-desk:review', '{newer saved bytes'));
  await page.getByRole('button', { name: 'Confirm discard unreadable review' }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  expect(await page.evaluate(() => localStorage.getItem('stable-desk:review'))).toBe('{newer saved bytes');
});

test('a stale reset cannot erase another tab commit', async () => {
  await page.goto('/review.html');
  await page.getByRole('button', { name: 'Start from public baseline' }).click();
  await page.getByRole('button', { name: 'Check source now' }).click();
  await expect(page.locator('.footer')).toContainText('Version 1');
  await page.getByRole('button', { name: 'Reset local review' }).click();
  const other = await context.newPage();
  await other.route('**/api/check', route => route.fulfill({ json: { capture: capture(2) } }));
  await other.goto('/review.html');
  await other.getByRole('button', { name: 'Check source now' }).click();
  await expect(other.locator('.footer')).toContainText('Version 2');
  const latest = await other.evaluate(() => localStorage.getItem('stable-desk:review'));
  await page.getByRole('button', { name: 'Confirm erase local review' }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  expect(await page.evaluate(() => localStorage.getItem('stable-desk:review'))).toBe(latest);
});

test('review cycles restore in a fresh browser and hand adopted evidence back to Decisions', async ({ browser }, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Decisions', exact: true }).click();
  await page.getByRole('button', { name: 'Review assessment', exact: false }).first().click();
  await page.getByLabel('Research notes', { exact: true }).fill('Original decision basis before eligibility changed.');
  await page.getByLabel('Status', { exact: true }).selectOption('Investigating');
  await page.getByRole('checkbox', { name: 'I reviewed these assumptions against the current evidence.', exact: true }).check();
  await page.getByRole('button', { name: 'Save local assessment', exact: true }).click();
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('stable-desk:v2')).workspace.events);
  await page.goto('/review.html');
  await page.getByRole('button', { name: 'Import local v2 export' }).click();
  await page.getByRole('button', { name: 'Download original v2 backup' }).click();
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click();
  for (const version of [1, 2]) {
    await page.getByRole('button', { name: 'Check source now' }).click();
    await expect(page.locator('.footer')).toContainText(`Version ${version}`);
  }
  await page.locator('.review-candidate').click();
  const adopted = 'Stripe documents revised merchant eligibility; independent performance remains unverified.';
  await page.getByLabel('Reviewed replacement claim').fill(adopted);
  await page.getByLabel('Review rationale').fill('Material eligibility change in the synthetic test capture.');
  await page.getByRole('button', { name: 'Accept reviewed revision' }).click();
  await expect(page.locator('.footer')).toContainText('Version 3');
  await page.getByRole('button', { name: 'Check source now' }).click();
  await expect(page.locator('.footer')).toContainText('Version 4');
  await page.locator('.review-candidate').click();
  await page.getByLabel('Review rationale').fill('Synthetic navigation churn only; retain the adopted eligibility claim.');
  await page.getByRole('button', { name: 'Reject candidate' }).click();
  await expect(page.locator('.footer')).toContainText('Version 5');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stable-desk:review')));
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export review backup' }).click();
  const backup = await (await exported).path();
  const fresh = await browser.newContext(info.project.use);
  try {
    const restored = await fresh.newPage();
    await restored.goto('/review.html');
    await restored.locator('#restore-file').setInputFiles(backup);
    await expect(restored.getByRole('heading', { name: 'Restore preview' })).toBeVisible();
    await restored.getByRole('button', { name: 'Download backup before restore' }).click();
    await restored.getByRole('button', { name: 'Confirm restore' }).click();
    await expect(restored.locator('.footer')).toContainText('Version 5');
    expect(await restored.evaluate(() => JSON.parse(localStorage.getItem('stable-desk:review')))).toEqual(saved);
    // Malformed, oversized and divergent imports never replace current bytes.
    for (const bad of ['{broken', 'x'.repeat(4 * 1024 * 1024 + 1)]) {
      await restored.locator('#restore-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
      await expect(restored.getByRole('alert')).toBeVisible();
      expect(await restored.evaluate(() => JSON.parse(localStorage.getItem('stable-desk:review')))).toEqual(saved);
    }
    await restored.locator('#restore-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...saved, version: 0, journal: [], checks: [], snapshots: {}, candidates: [] })) });
    await restored.getByRole('button', { name: 'Download backup before restore' }).click();
    await restored.getByRole('button', { name: 'Confirm restore' }).click();
    await expect(restored.getByRole('alert')).toContainText('diverges');
    const handoff = restored.waitForEvent('download');
    await restored.getByRole('button', { name: 'Export adopted workspace' }).click();
    const handoffPath = await (await handoff).path();
    await restored.getByRole('link', { name: 'Research desk', exact: true }).click();
    await restored.getByRole('button', { name: 'Workspace backup and import', exact: true }).click();
    await restored.locator('#import-file').setInputFiles(handoffPath);
    await expect(restored.locator('#import-preview')).toContainText('Validated');
    await restored.getByRole('button', { name: 'Use in this browser', exact: true }).click();
    await expect(restored.locator('#utility-dialog')).not.toBeVisible();
    const received = await restored.evaluate(() => JSON.parse(localStorage.getItem('stable-desk:v2')));
    expect(received.workspace.events.slice(0, original.length)).toEqual(original);
    expect(received.workspace.events.find(event => event.type === 'evidence_revision').after.statement).toBe(adopted);
    await restored.getByRole('link', { name: 'Evidence', exact: true }).click();
    await expect(restored.getByText(adopted, { exact: true })).toBeVisible();
    await restored.getByRole('link', { name: 'Opportunities', exact: true }).click();
    await expect(restored.locator('.priority-card').first()).toContainText('Needs assumption review');
    await restored.getByRole('link', { name: 'Decisions', exact: true }).click();
    await expect(restored.locator('.decision-card').first()).toContainText('Decision stale');
    await expect(restored.locator('.decision-card').first()).toContainText('Original decision basis');
    expect(await restored.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await restored.screenshot({ path: info.outputPath('restored-decision-handoff.png'), fullPage: true });
  } finally { await fresh.close(); }
});

test("switching review tabs does not decode the adopted desk again", async () => {
  await page.route("**/src/workspace.js", async (route) => {
    const response = await route.fetch();
    const marker = "export function projectWorkspace(seed, ws) {";
    const body = (await response.text()).replace(
      marker,
      `${marker}\n  globalThis.__replays = (globalThis.__replays ?? 0) + 1;`,
    );
    await route.fulfill({ response, body });
  });
  const replays = () => page.evaluate(() => globalThis.__replays ?? 0);
  await page.goto("/review.html");
  await page.getByRole("button", { name: "Start from public baseline" }).click();
  await expect(page.getByRole("heading", { name: "Review inbox", exact: true })).toBeVisible();
  const before = await replays();
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Checks & review history/ }).click();
  await expect(page.getByRole("heading", { name: "Actual recorded checks" })).toBeVisible();
  await page.getByRole("button", { name: /Review inbox/ }).click();
  await expect(page.getByRole("heading", { name: "Review inbox", exact: true })).toBeVisible();
  expect(await replays()).toBe(before);
});

test("review actions keep keyboard focus, expose tab state and use visible file inputs", async () => {
  await page.goto("/review.html");
  await expect(page.locator("noscript")).toHaveCount(1);
  expect(await page.locator('meta[name="description"]').getAttribute("content")).toContain("source checks");
  for (const id of ["#restore-file", "#import-file"]) {
    await expect(page.locator(id)).toBeVisible();
    expect(await page.locator(id).getAttribute("hidden")).toBeNull();
  }
  await expect(page.getByRole("heading", { name: "Restore a review backup" })).toBeVisible();
  await page.getByRole("button", { name: "Start from public baseline" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Review inbox", exact: true })).toBeVisible();
  // The starting button is gone, so focus lands on the new panel heading.
  await expect(page.getByRole("heading", { name: "Review inbox", exact: true })).toBeFocused();
  const history = page.getByRole("button", { name: /Checks & review history/ });
  await expect(history).toHaveAttribute("aria-pressed", "false");
  await history.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Actual recorded checks" })).toBeVisible();
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Review inbox/ })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /Review inbox/ }).focus();
  await page.keyboard.press("Enter");
  const check = page.getByRole("button", { name: "Check source now" });
  for (const version of [1, 2]) {
    await check.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".footer")).toContainText(`Version ${version}`);
    // The busy render disabled the button; focus returns once it is enabled.
    await expect(check).toBeFocused();
  }
  await page.locator(".review-candidate").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#candidate-detail h2")).toBeFocused();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export adopted workspace" }).click();
  await exported;
  await expect(page.getByRole("status").filter({ hasText: "Preview adopted source review" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
