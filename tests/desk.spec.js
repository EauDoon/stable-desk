import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const baseline = JSON.parse(
  await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Stable Desk · Generic stablecoin research");
  await expect(page.locator(".brand")).toContainText("Stable Desk");
  await expect(
    page.getByRole("heading", { name: "Where could STABLE fit?" }),
  ).toBeVisible();
});
const noOverflow = async (page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
const closeDetail = async (page) =>
  page
    .locator("#detail-dialog")
    .getByRole("button", { name: "Close details" })
    .click();
test("desktop/mobile layout, all views, genuine baseline, no JS errors", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".org-table tbody tr")).toHaveCount(10);
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-opportunities.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Generic demo baseline" }),
  ).toBeVisible();
  await expect(
    page.getByText("No committed local revisions", { exact: false }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-changes.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-card")).toHaveCount(3);
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-decisions.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  await expect(
    page.locator("#evidence-results > .evidence-ledger > .evidence-record"),
  ).toHaveCount(13);
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-evidence.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("search, compound filters, clear and empty states", async ({ page }) => {
  await page.getByRole("searchbox").fill("USDC");
  await page
    .getByRole("combobox", { name: "Filter by opportunity lane" })
    .selectOption("Distribution");
  await page
    .getByRole("combobox", { name: "Filter by relationship" })
    .selectOption("demo");
  await expect(page.locator(".org-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".org-table")).toContainText("Stripe");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filter by market" })
    .selectOption("United Kingdom page");
  await expect(page.locator(".org-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".org-table")).toContainText("Coinbase");
  await page.getByRole("searchbox").fill("nothing-matches");
  await expect(
    page.getByRole("heading", { name: "No matching organizations" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .last()
    .click();
  await expect(page.locator(".org-table tbody tr")).toHaveCount(10);
});
test("organization detail, source lineage, priority and keyboard dismissal", async ({
  page,
}, testInfo) => {
  await page
    .getByRole("button", { name: "Open Visa details", exact: true })
    .click();
  const dialog = page.locator("#detail-dialog");
  await expect(
    dialog.getByRole("heading", { name: "Visa", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "No issuer relationship exists in this demo",
  );
  await expect(dialog).toContainText("Company claim");
  await dialog
    .getByRole("button", { name: "Inspect source S-G04" })
    .first()
    .click();
  await expect(dialog.locator("a.source-link")).toHaveAttribute(
    "href",
    baseline.sources.find((s) => s.id === "S-G04").url,
  );
  await expect(dialog).toContainText("API access is described as coming soon");
  await expect(dialog.locator("a.source-link")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", {
      name: "Open investigation Define one merchant acceptance problem",
    })
    .click();
  await expect(dialog).toContainText("What could disprove it");
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-priority-detail.png`,
  });
  await expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
test("compare 2–3 organizations and enforce the selection limit", async ({
  page,
}) => {
  await page
    .getByRole("checkbox", { name: "Compare Stripe", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Compare Paxos", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Compare Coinbase", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Compare Visa", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Compare Visa", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Compare selected", exact: true })
    .click();
  const dialog = page.locator("#detail-dialog");
  await expect(
    dialog.getByRole("heading", { name: "Compare ecosystem fit" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Important uncertainty");
  await expect(dialog.locator(".compare-title")).toHaveCount(3);
  await expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
test("save local assessment, reload, export and restore in another browser context", async ({
  page,
  browser,
}) => {
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await page.getByRole("button", { name: "Review assessment" }).first().click();
  await page
    .getByLabel("Status", { exact: true })
    .selectOption("Investigating");
  await page.getByLabel("Owner", { exact: true }).fill("Researcher");
  await page
    .getByLabel("Research notes", { exact: true })
    .fill("Check repeat merchants and settlement requirements.");
  await page.getByRole("button", { name: "Save local assessment" }).click();
  await expect(page.locator("#detail-dialog")).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".decision-card").first()).toContainText(
    "Investigating",
  );
  await expect(page.locator(".decision-card").first()).toContainText(
    "Check repeat merchants",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  const download = await downloadPromise;
  const exportPath = await download.path();
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  expect(
    exported.workspace.events.find((e) => e.type === "decision_saved").after
      .owner,
  ).toBe("Researcher");
  expect(exported.dataset.sources).toHaveLength(baseline.sources.length);
  const context = await browser.newContext();
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:4173");
  await second
    .getByRole("button", { name: "Workspace backup and import" })
    .click();
  await second.locator("#import-file").setInputFiles(exportPath);
  await second.getByRole("button", { name: "Use in this browser" }).click();
  await second.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(second.locator(".decision-card").first()).toContainText(
    "Investigating",
  );
  await second.getByRole("link", { name: "Changes", exact: true }).click();
  await expect(second).toHaveURL(/#changes$/);
  await expect(second.locator(".history-list")).toContainText("decision saved");
  await context.close();
});
test("changed evidence flags assumptions; explicit review needs reasoning and persists", async ({
  page,
}) => {
  const changed = structuredClone(baseline);
  changed.sources.find((s) => s.id === "S-G02").dateNote +=
    " New rollout uncertainty.";
  changed.meta.version = "2026-09-30.generic.2";
  await page
    .getByRole("button", { name: "Workspace backup and import" })
    .click();
  await page.locator("#import-file").setInputFiles({
    name: "updated.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(page.locator("#import-preview")).toContainText(
    "1 proposals need assumption review",
  );
  await page.getByRole("button", { name: "Use in this browser" }).click();
  await expect(page.locator(".priority-card").first()).toContainText(
    "Needs assumption review",
  );
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await page.getByRole("button", { name: "Review assessment" }).first().click();
  await page
    .getByRole("checkbox", {
      name: "I reviewed these assumptions against the current evidence.",
    })
    .check();
  await page.getByRole("button", { name: "Save local assessment" }).click();
  await expect(page.locator("#decision-error")).toContainText("Add a note");
  await page
    .getByLabel("Research notes", { exact: true })
    .fill(
      "Public announcement scope checked; incremental corridor demand remains unproven.",
    );
  await page.getByRole("button", { name: "Save local assessment" }).click();
  await expect(page.locator(".decision-card").first()).toContainText(
    "Reviewed locally",
  );
  await page.reload();
  await expect(page.locator(".decision-card").first()).toContainText(
    "Reviewed locally",
  );
});
test("invalid imports rejected, dataset remains intact, imported prose escaped", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Workspace backup and import" })
    .click();
  await page.locator("#import-file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.locator("#import-error")).toContainText("Import rejected");
  const malicious = structuredClone(baseline);
  malicious.sources[0].url = "javascript:alert(1)";
  await page.locator("#import-file").setInputFiles({
    name: "bad-url.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malicious)),
  });
  await expect(page.locator("#import-error")).toContainText("HTTPS URL");
  expect(await page.locator("[data-apply-import]").count()).toBe(0);
  malicious.sources[0].url = baseline.sources[0].url;
  malicious.organizations[0].name =
    '<img src=x onerror="window.injected=true">';
  await page.locator("#import-file").setInputFiles({
    name: "escaped.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(malicious)),
  });
  await page.getByRole("button", { name: "Use in this browser" }).click();
  await expect(page.locator(".org-table")).toContainText("<img src=x");
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator(".org-table img")).toHaveCount(0);
});
test("all source and documentation links render their correct targets", async ({
  page,
  request,
}) => {
  await page
    .getByRole("button", { name: "Evidence coverage", exact: true })
    .click();
  const links = await page
    .locator("#utility-dialog .source-link")
    .evaluateAll((nodes) => nodes.map((n) => n.href));
  expect(links).toEqual(baseline.sources.map((s) => s.url));
  for (const path of [
    "/docs/ARCHITECTURE.md",
    "/docs/UPDATING.md",
    "/docs/PRIORITIES.md",
    "/docs/V2_PLAN.md",
    "/data/baseline.json",
  ])
    expect((await request.get(path)).status()).toBe(200);
});

test("fictional identity, provenance labels and legacy workspace isolation", async ({
  page,
}) => {
  await expect(page.locator("[data-demo-notice]")).toContainText(
    "Generic Stablecoin (STABLE) is fictional",
  );
  await expect(page.locator(".org-table .relationship-hint")).toHaveCount(10);
  await page
    .getByRole("button", {
      name: "Open investigation Define one merchant acceptance problem",
    })
    .click();
  await expect(page.locator("#detail-dialog")).toContainText(
    "Synthetic example",
  );
  await expect(page.locator("#detail-dialog")).toContainText(
    "not proof of demo fit",
  );
  await closeDetail(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "stable-desk:v1",
      JSON.stringify({
        data: { legacy: true },
        workspace: {
          decisions: { D01: { notes: "Legacy assessment must stay isolated" } },
        },
      }),
    ),
  );
  await page.reload();
  await expect(page.locator("#notice")).toContainText(
    "legacy workspace is preserved separately",
  );
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator(".decision-list")).not.toContainText(
    "Legacy assessment must stay isolated",
  );
  expect(
    await page.evaluate(() => !!localStorage.getItem("stable-desk:v1")),
  ).toBe(true);
  const legacy = structuredClone(baseline);
  delete legacy.profile;
  await page
    .getByRole("button", { name: "Workspace backup and import" })
    .click();
  await page.locator("#import-file").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator("#import-error")).toContainText(
    "fictional demo profile",
  );
  await expect(page.locator("[data-apply-import]")).toHaveCount(0);
});
test("configured fictional placeholder updates labels and flags profile assumptions", async ({
  page,
}) => {
  const changed = structuredClone(baseline);
  changed.profile.name = "Example Stablecoin";
  changed.profile.ticker = "EXAMPLE";
  await page
    .getByRole("button", { name: "Workspace backup and import" })
    .click();
  await page.locator("#import-file").setInputFiles({
    name: "profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(page.locator("#import-preview")).toContainText(
    "3 proposals need assumption review",
  );
  await page.getByRole("button", { name: "Use in this browser" }).click();
  await expect(
    page.getByRole("heading", { name: "Where could EXAMPLE fit?" }),
  ).toBeVisible();
  await expect(page.locator("[data-demo-notice]")).toContainText(
    "Example Stablecoin (EXAMPLE) is fictional",
  );
  await expect(page.locator(".priority-card .review-dot.warn")).toHaveCount(3);
  await noOverflow(page);
});
