import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures.js";
import { parseV2Import } from "../src/workspace.js";

const liveKey = "stable-desk:v2";
const draftsKey = "stable-desk:drafts-v2";

async function openDesk(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where could STABLE fit?" })).toBeVisible();
}

async function rename(page, name) {
  await page.locator(".profile-switch").click();
  await page.getByRole("button", { name: "Edit active profile" }).click();
  await page.getByLabel("Profile name", { exact: true }).fill(name);
  await page.getByLabel("Reason for this change").fill("Update the fictional profile for this session.");
  await page.getByRole("button", { name: "Save profile revision" }).click();
  await expect(page.locator(".profile-switch")).toHaveText(name);
}

async function exportWorkspace(page) {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace", exact: true }).click();
  const file = await downloaded;
  return parseV2Import(await readFile(await file.path(), "utf8")).workspace;
}

async function refuseWrites(page) {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Store is full", "QuotaExceededError"); };
  });
}

// Let the test read the underlying disposable store while the app experiences
// an ordinary read failure. Writes still work, as with a partially available store.
async function refuseReads(page, key) {
  await page.addInitScript((key) => {
    const read = Storage.prototype.getItem;
    window.readTestValue = (name) => read.call(localStorage, name);
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new Error("Store read unavailable");
      return read.call(this, name);
    };
  }, key);
}

test("a denied storage getter opens a usable baseline and warns about export", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage unavailable", "SecurityError"); },
    });
  });
  await openDesk(page);
  await expect(page.locator(".storage-banner")).toContainText(/export/i);
  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What supports the assessment?" })).toBeVisible();
  expect((await exportWorkspace(page)).events).toHaveLength(0);
  await rename(page, "Getter Blocked");
  await expect(page.locator(".page-heading [data-export-status]")).toContainText("1 committed change since");
  expect((await exportWorkspace(page)).events.at(-1).after.name).toBe("Getter Blocked");
});

test("a missing storage object permits export and later recovers on the first saved edit", async ({ page }) => {
  await page.addInitScript(() => {
    const storage = window.localStorage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
    window.enableTestStorage = () => { Object.defineProperty(window, "localStorage", { value: storage }); };
  });
  await openDesk(page);
  const empty = await exportWorkspace(page);
  expect(empty.events).toHaveLength(0);
  await page.evaluate(() => window.enableTestStorage());
  await rename(page, "First Saved Edit");
  await expect(page.locator(".storage-banner")).toHaveCount(0);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).workspace, liveKey);
  expect(saved.id).toBe(empty.id);
  expect(saved.events.map((event) => event.after.name)).toEqual(["First Saved Edit"]);
});

test("a failed initial write leaves the first edit available for export", async ({ page }) => {
  await refuseWrites(page);
  await openDesk(page);
  await rename(page, "Memory Only");
  const saved = await exportWorkspace(page);
  expect(saved.events.map((event) => event.after.name)).toEqual(["Memory Only"]);
  expect(await page.evaluate((key) => localStorage.getItem(key), liveKey)).toBeNull();
});

test("a readable workspace opens when writes fail and preserves its saved version", async ({ page }) => {
  await openDesk(page);
  await rename(page, "Saved Before Reload");
  const before = await page.evaluate((key) => localStorage.getItem(key), liveKey);
  await refuseWrites(page);
  await openDesk(page);
  await expect(page.locator(".profile-switch")).toHaveText("Saved Before Reload");
  await rename(page, "Unsaved Revision");
  expect((await exportWorkspace(page)).events.map((event) => event.after.name))
    .toEqual(["Saved Before Reload", "Unsaved Revision"]);
  expect(await page.evaluate((key) => localStorage.getItem(key), liveKey)).toBe(before);
});

test("an unreadable saved workspace survives an edit in the fallback session", async ({ page }) => {
  await openDesk(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), liveKey);
  expect(before).not.toBeNull();
  await refuseReads(page, liveKey);
  await openDesk(page);
  await rename(page, "Temporary Workspace");
  expect((await exportWorkspace(page)).events.at(-1).after.name).toBe("Temporary Workspace");
  expect(await page.evaluate(([key, raw]) => window.readTestValue(key) === raw, [liveKey, before])).toBe(true);
});

test("an unreadable saved draft survives another editor's typing and commit", async ({ page }) => {
  await openDesk(page);
  const before = JSON.stringify({ other: { values: { name: ["Draft for another profile"] } } });
  await page.evaluate(([key, raw]) => localStorage.setItem(key, raw), [draftsKey, before]);
  await refuseReads(page, draftsKey);
  await openDesk(page);
  await rename(page, "Separate Profile Edit");
  expect(await page.evaluate((key) => window.readTestValue(key), draftsKey)).toBe(before);
});

test("a temporary read failure resumes saving after the original disk head can be checked", async ({ page }) => {
  await openDesk(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), liveKey);
  await page.evaluate((key) => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name) {
      if (name === key) throw new Error("Temporary read failure");
      return read.call(this, name);
    };
    window.restoreTestReads = () => { Storage.prototype.getItem = read; };
  }, liveKey);
  await rename(page, "First During Failure");
  await page.evaluate(() => window.restoreTestReads());
  expect(await page.evaluate(([key, raw]) => localStorage.getItem(key) === raw, [liveKey, before])).toBe(true);
  await rename(page, "Second After Recovery");
  await expect(page.locator(".storage-banner")).toHaveCount(0);
  await openDesk(page);
  expect((await exportWorkspace(page)).events.map((event) => event.after.name))
    .toEqual(["First During Failure", "Second After Recovery"]);
});

test("a version-zero review export counts subsequent operations only in its original period", async ({ page }) => {
  await page.route("**/api/check", (route) => route.fulfill({
    json: { capture: { outcome: "ok", status: 200, text: "Fictional stablecoin example. Merchants check the country, business and settlement requirements before enabling the payment method." } },
  }));
  await page.goto("/review.html");
  await page.getByRole("button", { name: "Start from public baseline" }).click();
  const status = page.locator(".footer [data-export-status]");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export review backup" }).click();
  const file = await downloaded;
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.version).toBe(0);
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(status).toContainText(/last exported at version 0 .*1 operation since/);
  await page.reload();
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(status).toContainText(/last exported at version 0 .*2 operations since/);
  const priorPeriod = page.waitForEvent("download");
  await page.getByRole("button", { name: "Start new review period" }).click();
  await priorPeriod;
  await page.getByRole("button", { name: "Confirm new review period" }).click();
  await expect(status).toHaveText("not exported from this browser");
});

test("an empty export followed by a first edit shows one committed change", async ({ page }) => {
  await openDesk(page);
  const empty = await exportWorkspace(page);
  expect(empty.events).toHaveLength(0);
  await rename(page, "First After Export");
  await expect(page.locator(".page-heading [data-export-status]")).toContainText("1 committed change since");
  await page.getByRole("link", { name: "Changes", exact: true }).click();
  await expect(page.locator(".history-record")).toHaveCount(1);
  const updated = await exportWorkspace(page);
  expect(updated.id).toBe(empty.id);
  expect(updated.events.map((event) => event.after.name)).toEqual(["First After Export"]);
});

test("ordinary storage reopens the same workspace identity and committed edit", async ({ page }) => {
  await openDesk(page);
  const original = await exportWorkspace(page);
  await rename(page, "Persistent Profile");
  await openDesk(page);
  await expect(page.locator(".storage-banner")).toHaveCount(0);
  await expect(page.locator(".profile-switch")).toHaveText("Persistent Profile");
  expect((await exportWorkspace(page)).id).toBe(original.id);
});
