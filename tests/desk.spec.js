import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const baseline = JSON.parse(
  await readFile(new URL("../data/baseline.json", import.meta.url), "utf8"),
);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Where should XSGD go next?" }),
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
    page.getByRole("heading", { name: "First public-evidence baseline" }),
  ).toBeVisible();
  await expect(
    page.getByText("No local edits yet.", { exact: false }),
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
  expect(errors).toEqual([]);
});
test("search, compound filters, clear and empty states", async ({ page }) => {
  await page.getByRole("searchbox").fill("USDC");
  await page
    .getByRole("combobox", { name: "Filter by opportunity lane" })
    .selectOption("Issuer partnership");
  await page
    .getByRole("combobox", { name: "Filter by relationship" })
    .selectOption("prospective");
  await expect(page.locator(".org-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".org-table")).toContainText("Nium");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Filter by market" })
    .selectOption("Thailand");
  await expect(page.locator(".org-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".org-table")).toContainText("KASIKORNBANK");
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
    .getByRole("button", { name: "Open Nium details", exact: true })
    .click();
  const dialog = page.locator("#detail-dialog");
  await expect(
    dialog.getByRole("heading", { name: "Nium", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Bilateral StraitsX relationship unknown");
  await expect(dialog).toContainText("Company claim");
  await dialog
    .getByRole("button", { name: "Inspect source S12" })
    .first()
    .click();
  await expect(dialog.locator("a.source-link")).toHaveAttribute(
    "href",
    baseline.sources.find((s) => s.id === "S12").url,
  );
  await expect(dialog).toContainText("19 Aug 2026");
  await expect(dialog.locator("a.source-link")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", {
      name: "Open investigation Deepen the existing QR corridor",
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
    .getByRole("checkbox", { name: "Compare Grab", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Compare Nium", exact: true })
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
  await page.getByLabel("Owner", { exact: true }).fill("Daniel");
  await page
    .getByLabel("Research notes", { exact: true })
    .fill("Check repeat merchants and SGD settlement attribution.");
  await page.getByRole("button", { name: "Save local assessment" }).click();
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
  expect(exported.workspace.decisions.D01.owner).toBe("Daniel");
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
  await expect(second.locator(".activity-list")).toContainText(
    "saved local assessment",
  );
  await context.close();
});
test("changed evidence flags assumptions; explicit review needs reasoning and persists", async ({
  page,
}) => {
  const changed = structuredClone(baseline);
  changed.sources.find((s) => s.id === "S01").dateNote +=
    " New rollout uncertainty.";
  changed.meta.version = "2026-09-30.2";
  await page
    .getByRole("button", { name: "Workspace backup and import" })
    .click();
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "updated.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(changed)),
    });
  await expect(page.locator("#import-preview")).toContainText(
    "1 proposals need assumption review",
  );
  await page.getByRole("button", { name: "Use in this browser" }).click();
  await expect(page.locator(".priority-card").first()).toContainText(
    "Evidence changed",
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
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    });
  await expect(page.locator("#import-error")).toContainText("Import rejected");
  const malicious = structuredClone(baseline);
  malicious.sources[0].url = "javascript:alert(1)";
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "bad-url.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(malicious)),
    });
  await expect(page.locator("#import-error")).toContainText("HTTPS URL");
  expect(await page.locator("[data-apply-import]").count()).toBe(0);
  malicious.sources[0].url = baseline.sources[0].url;
  malicious.organizations[0].name =
    '<img src=x onerror="window.injected=true">';
  await page
    .locator("#import-file")
    .setInputFiles({
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
    "/data/baseline.json",
  ])
    expect((await request.get(path)).status()).toBe(200);
});
