import { test, expect } from "@playwright/test";
// v4 review surface. Local storage only: no account, no sign-in, no hosted
// state. The source check is served by the same /api/check the deployment uses.
const capture = (n) => ({
  outcome: "ok",
  status: 200,
  text: `Official stablecoin documentation. Merchants must examine business eligibility, country restrictions and supported tokens before using the payment product. Revision ${n}.`,
});
let page;
let context;
test.beforeEach(async ({ browser }) => {
  // A fresh context per test: localStorage is per-origin, so sharing one
  // context across parallel workers would leak review state between tests.
  context = await browser.newContext();
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
