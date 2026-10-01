import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const preview = spawn(
  process.execPath,
  ["scripts/server.mjs", "--dist", "--port", "4176"],
  { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
const report = {
  checkedAt: new Date().toISOString(),
  build: "dist/",
  checks: [],
  errors: [],
};
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Build preview did not start.")),
      5000,
    );
    preview.once("error", reject);
    preview.once("exit", (code) => {
      if (code !== null) reject(new Error(`Preview exited ${code}.`));
    });
    preview.stdout.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto("http://127.0.0.1:4176/");
    await page
      .getByRole("heading", { name: "Where could STABLE fit?", exact: true })
      .waitFor();
    assert.equal(await page.locator(".org-table tbody tr").count(), 10);
    for (const view of ["Opportunities", "Evidence", "Changes", "Decisions"]) {
      await page.getByRole("link", { name: view, exact: true }).click();
      await page
        .locator("main h1")
        .filter({
          hasText: {
            Opportunities: "Where could STABLE fit?",
            Evidence: "What supports the assessment?",
            Changes: "What changed, and what needs a second look?",
            Decisions: "What should happen next?",
          }[view],
        })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await page.getByRole("link", { name: "Evidence", exact: true }).click();
    await page.locator(".evidence-workbench").waitFor();
    await page.screenshot({ path: `artifacts/${name}-build-evidence.png` });
    await page
      .locator('#evidence-results [data-edit-evidence="E-G09"]')
      .click();
    const statement = page.getByLabel("Claim statement", { exact: true });
    const old = await statement.inputValue();
    await statement.fill(
      old + " Build smoke qualification; no execution evidence added.",
    );
    await page
      .getByLabel("Reason for this change", { exact: true })
      .fill("Local build smoke; original public provenance preserved.");
    await page
      .getByRole("button", { name: "Preview revision", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Commit reviewed revision", exact: true })
      .click();
    await page.locator("#detail-dialog").waitFor({ state: "hidden" });
    await page.reload();
    const events = await page.evaluate(
      () => JSON.parse(localStorage.getItem("stable-desk:v2")).workspace.events,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "evidence_revision");
    assert.match(events[0].after.statement, /Build smoke qualification/);
    await page
      .getByRole("link", { name: "Opportunities", exact: true })
      .click();
    assert.match(
      await page.locator(".priority-card").nth(2).textContent(),
      /Needs assumption review/,
    );
    // v4: the review surface must open with no account, no sign-in form and
    // no hosted-provisioning state, and the research desk must link into it.
    await page.goto("http://127.0.0.1:4176/review.html");
    await page
      .getByRole("heading", { name: "Choose a safe starting point" })
      .waitFor();
    assert.equal(await page.locator("#login-form").count(), 0);
    assert.equal(await page.locator('[data-action="logout"]').count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: `artifacts/v4-${name}-review.png`, fullPage: true });
    await page.goto("http://127.0.0.1:4176/");
    await page
      .getByRole("link", { name: "Source review →" })
      .waitFor();
    report.checks.push({
      viewport: name,
      allViews: true,
      overflow: false,
      revisionCommit: true,
      reloadPersistence: true,
      reviewOpensWithoutAccount: true,
    });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.errors.push(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill();
  await writeFile(
    "artifacts/build-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report, null, 2));
