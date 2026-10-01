import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { prepareDataset, createWorkspace, exportV2 } from "../src/workspace.js";
const newEmail = () => `reader-${randomUUID()}@example.invalid`;
async function login(page, email = newEmail()) {
  await page.goto("/pilot.html");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page
      .getByRole("heading", { name: "Choose a safe starting point" })
      .or(page.getByRole("heading", { name: "Review inbox", exact: true })),
  ).toBeVisible();
  return email;
}
async function create(page) {
  await login(page);
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
}
async function checks(page) {
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(page.locator(".footer")).toContainText("Version 1");
  await page.getByRole("button", { name: "Check source now" }).click();
  await expect(
    page.getByRole("button", { name: "Official source text changed" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Official source text changed" })
    .click();
}
test("complete source-to-review loop, preserved citations, adoption and shared desk stale assumptions", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await checks(page);
  await expect(
    page.getByRole("heading", { name: "Inspect before adopting" }),
  ).toBeVisible();
  await page
    .getByLabel("Reviewed replacement claim")
    .fill(
      "Stripe describes stablecoin payment eligibility in updated documentation. This company claim establishes no fictional STABLE acceptance.",
    );
  await page
    .getByLabel("Review rationale")
    .fill(
      "Compared the two fixture snapshots; real rollout and independent verification remain unknown.",
    );
  await page.screenshot({
    path: `artifacts/v3-${info.project.name}-review.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.locator(".footer")).toContainText("Version 3");
  await page.getByRole("link", { name: "Shared research desk" }).click();
  await expect(page.locator(".storage-banner")).toContainText(
    "Shared persistent workspace",
  );
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.locator("#main")).toContainText("Needs assumption review");
  await page.reload();
  await expect(page.locator(".storage-banner")).toContainText("version 3");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("reject, repeat network retry, weekly brief export and recovery are honest", async ({
  page,
}) => {
  await create(page);
  await checks(page);
  const state = await page.request.get("/api/desk?action=state");
  const before = (await state.json()).pilot.desk;
  await page
    .getByLabel("Review rationale")
    .fill(
      "Navigation-like fixture change is insufficient to justify a revised adopted market claim.",
    );
  await page.getByRole("button", { name: "Reject candidate" }).click();
  await expect(page.locator(".footer")).toContainText("Version 3");
  const after = (
    await (await page.request.get("/api/desk?action=state")).json()
  ).pilot;
  expect(after.desk).toEqual(before);
  await page.getByRole("button", { name: "Checks & review history" }).click();
  await expect(page.locator("main")).toContainText("rejected");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Weekly change brief" }).click();
  const file = await download,
    content = await readFile(await file.path(), "utf8");
  expect(content).toContain("0 accepted revisions; 1 rejected");
  expect(content).toContain(
    "https://docs.stripe.com/payments/stablecoin-payments",
  );
  const recovery = await (
    await page.request.get("/api/desk?action=recovery")
  ).json();
  expect(recovery.versions).toEqual([2, 1, 0]);
});
test("explicit v2 import requires backup and preserves exact local bytes/events", async ({
  page,
}) => {
  const seed = prepareDataset(
      JSON.parse(
        await readFile(
          new URL("../data/baseline.json", import.meta.url),
          "utf8",
        ),
      ),
    ),
    original = JSON.stringify(exportV2(seed, createWorkspace(seed)));
  await page.addInitScript(
    (value) => localStorage.setItem("stable-desk:v2", value),
    original,
  );
  await login(page);
  await page.getByRole("button", { name: "Preview local v2 import" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm copy to shared workspace" }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download original v2 backup" })
    .click();
  expect(await readFile(await (await download).path(), "utf8")).toEqual(
    original,
  );
  await page
    .getByRole("button", { name: "Confirm copy to shared workspace" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("stable-desk:v2")),
  ).toEqual(original);
  const result = await (
    await page.request.get("/api/desk?action=state")
  ).json();
  expect(result.pilot.desk.workspace).toEqual(JSON.parse(original).workspace);
  expect(result.pilot.creation.legacyReviewerLabelsAuthenticated).toBe(false);
});
test("separate devices share persistent state; different accounts cannot read it; signed-out desk fails closed", async ({
  page,
  browser,
}) => {
  const email = await login(page);
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4184",
    }),
    other = await context.newPage();
  try {
    await login(other, email);
    await page.getByRole("button", { name: "Check source now" }).click();
    await expect(page.locator(".footer")).toContainText("Version 1");
    await other.getByRole("button", { name: "Load latest" }).click();
    await expect(other.locator(".footer")).toContainText("Version 1");
    await other.getByRole("button", { name: "Sign out" }).click();
    await login(other);
    await expect(
      other.getByRole("heading", { name: "Choose a safe starting point" }),
    ).toBeVisible();
    expect(
      (await (await other.request.get("/api/desk?action=state")).json()).pilot,
    ).toBeNull();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/?shared=1");
    await expect(
      page.getByRole("heading", { name: "The desk could not open" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Sign in or initialize the shared pilot",
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
test("interrupted login and save preserve local work and in-memory review draft; stale update cannot adopt", async ({
  page,
}) => {
  await page.goto("/pilot.html");
  await page.evaluate(() => localStorage.setItem("preserved-test", "original"));
  await page.route("**/api/desk?action=login", (r) => r.abort());
  await page.getByLabel("Email", { exact: true }).fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  expect(
    await page.evaluate(() => localStorage.getItem("preserved-test")),
  ).toEqual("original");
  await page.unroute("**/api/desk?action=login");
  await create(page);
  await checks(page);
  await page
    .getByLabel("Reviewed replacement claim")
    .fill(
      "The reviewed company claim changes eligibility; STABLE remains a fictional placeholder.",
    );
  await page
    .getByLabel("Review rationale")
    .fill("Retain this rationale through an interrupted network save.");
  await page.route("**/api/desk?action=operate", (r) => r.abort());
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection interrupted");
  await expect(page.getByLabel("Review rationale")).toHaveValue(
    "Retain this rationale through an interrupted network save.",
  );
  await page.unroute("**/api/desk?action=operate");
  const current = (
    await (await page.request.get("/api/desk?action=state")).json()
  ).pilot;
  await page.request.post("/api/desk?action=operate", {
    headers: { origin: "http://127.0.0.1:4184" },
    data: {
      type: "check",
      opId: `OTHER-${randomUUID()}`,
      expectedVersion: current.version,
    },
  });
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Shared workspace changed",
  );
  const latest = (
    await (await page.request.get("/api/desk?action=state")).json()
  ).pilot;
  expect(latest.desk.workspace.events).toHaveLength(0);
});
test("shared manual edits use authenticated history, avoid local-key writes, and recovery copy preserves prior state", async ({
  page,
}, info) => {
  await create(page);
  await page.getByRole("link", { name: "Shared research desk" }).click();
  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  const source = page.locator(".evidence-workbench > aside #source-S-G02");
  await source
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await page
    .getByLabel("Reason for this change", { exact: true })
    .fill(
      "A manual public-page check records unchanged context without commercial endorsement.",
    );
  await page
    .locator("#detail-dialog")
    .getByRole("button", { name: "Record manual check", exact: true })
    .click();
  await expect(page.locator("#detail-dialog")).not.toBeVisible();
  await expect(page.locator(".storage-banner")).toContainText("version 1");
  const record = (
    await (await page.request.get("/api/desk?action=state")).json()
  ).pilot;
  expect(record.desk.workspace.events[0].actor).toMatch(/^user:/);
  expect(
    await page.evaluate(() => localStorage.getItem("stable-desk:v2")),
  ).toBeNull();
  await page.getByRole("link", { name: "v3 review pilot" }).click();
  const manifest = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download recovery manifest" })
    .click();
  await manifest;
  await page.getByLabel("Prior version").selectOption("0");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download selected recovery copy" })
    .click();
  const old = JSON.parse(await readFile(await (await download).path(), "utf8"));
  expect(old.version).toBe(0);
  expect(old.desk.workspace.events).toHaveLength(0);
  await page.screenshot({
    path: `artifacts/v3-${info.project.name}-recovery.png`,
    fullPage: true,
  });
});
test("shared stale drafts await latest state before rebase and expired refresh locks the view", async ({
  page,
  browser,
}, info) => {
  const email = await login(page);
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await expect(
    page.getByRole("link", { name: "Shared research desk" }),
  ).toBeVisible();
  const secondContext = await browser.newContext({
    viewport: info.project.use.viewport,
  });
  const second = await secondContext.newPage();
  try {
    await login(second, email);
    for (const device of [page, second]) {
      await device.getByRole("link", { name: "Shared research desk" }).click();
      await device.getByRole("link", { name: "Evidence", exact: true }).click();
      await device
        .locator(".evidence-workbench > aside #source-S-G02")
        .getByRole("button", { name: "Record manual check", exact: true })
        .click();
      await device
        .getByLabel("Reason for this change", { exact: true })
        .fill(
          device === page
            ? "First device reviewed the unchanged public source."
            : "Second device retains its independent review reasoning.",
        );
    }
    await page
      .locator("#detail-dialog")
      .getByRole("button", { name: "Record manual check", exact: true })
      .click();
    await expect(page.locator("#detail-dialog")).not.toBeVisible();
    await second
      .locator("#detail-dialog")
      .getByRole("button", { name: "Record manual check", exact: true })
      .click();
    await expect(second.locator(".workflow-error")).toContainText(
      "Shared workspace changed",
    );
    await second.route("**/api/desk?action=state", async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ response });
    });
    await second
      .getByRole("button", {
        name: "Use latest basis and preview again",
        exact: true,
      })
      .click();
    await expect(second.locator(".draft-note")).toContainText(
      "Latest basis loaded",
    );
    await expect(
      second.getByLabel("Reason for this change", { exact: true }),
    ).toHaveValue("Second device retains its independent review reasoning.");
    await second
      .locator("#detail-dialog")
      .getByRole("button", { name: "Record manual check", exact: true })
      .click();
    await expect(second.locator("#detail-dialog")).not.toBeVisible();
    const state = (
      await (await second.request.get("/api/desk?action=state")).json()
    ).pilot;
    expect(state.version).toBe(2);
    expect(state.desk.workspace.events).toHaveLength(2);
    expect(state.desk.workspace.events[1].rationale).toContain("Second device");
    expect(
      await second.evaluate(() => localStorage.getItem("stable-desk:v2")),
    ).toBeNull();
    await secondContext.clearCookies(); // Synthetic session expiry; no external provider claim.
    await second
      .getByRole("button", { name: "Workspace backup and import" })
      .click();
    await second
      .getByRole("button", { name: "Load latest shared work" })
      .click();
    await expect(
      second.getByRole("heading", { name: "Shared session ended" }),
    ).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
test("Blitz representative review, duplicate DELTA and fresh-session continuation preserve exact checkpoint", async ({
  page,
  browser,
}, info) => {
  const startedAt = new Date().toISOString(),
    start = Date.now(),
    email = await login(page);
  await page
    .getByRole("button", { name: "Start from public baseline" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review inbox", exact: true }),
  ).toBeVisible();
  await checks(page);
  const before = (
    await (await page.request.get("/api/desk?action=state")).json()
  ).pilot;
  await page
    .getByLabel("Reviewed replacement claim")
    .fill(
      "The fixture company documentation describes revised stablecoin eligibility. No fictional STABLE relationship is established.",
    );
  await page
    .getByLabel("Review rationale")
    .fill(
      "Representative synthetic review: exact source hashes and dates inspected; adoption claims remain unresolved.",
    );
  await page.getByRole("button", { name: "Accept reviewed revision" }).click();
  await expect(page.locator(".footer")).toContainText("Version 3");
  const adopted = (
      await (await page.request.get("/api/desk?action=state")).json()
    ).pilot,
    delta = {
      type: "check",
      opId: `DELTA-${randomUUID()}`,
      expectedVersion: adopted.version,
    };
  const first = await page.request.post("/api/desk?action=operate", {
    headers: { origin: "http://127.0.0.1:4184" },
    data: delta,
  });
  expect(first.status()).toBe(200);
  const changed = (await first.json()).pilot;
  const duplicate = await page.request.post("/api/desk?action=operate", {
    headers: { origin: "http://127.0.0.1:4184" },
    data: delta,
  });
  expect((await duplicate.json()).duplicate).toBe(true);
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4184",
  });
  try {
    const fresh = await context.newPage();
    await login(fresh, email);
    await expect(fresh.locator(".footer")).toContainText("Version 4");
    await fresh
      .getByRole("button", { name: "Official source text changed" })
      .click();
    await expect(fresh.getByLabel("Reviewed replacement claim")).toHaveValue(
      "",
    );
    const resumed = (
      await (await fresh.request.get("/api/desk?action=state")).json()
    ).pilot;
    expect(resumed).toEqual(changed);
    expect(resumed.desk).toEqual(adopted.desk);
    expect(resumed.journal).toHaveLength(4);
    const record = {
      fixture: true,
      startedAt,
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      sourceUrl: "https://docs.stripe.com/payments/stablecoin-payments",
      representativeReview: {
        beforeVersion: before.version,
        adoptedVersion: adopted.version,
        beforeHead: before.desk.workspace.events.at(-1)?.id ?? "baseline",
        afterHead: adopted.desk.workspace.events.at(-1).id,
        sourceBeforeHash: adopted.candidates[0].beforeHash,
        sourceAfterHash: adopted.candidates[0].afterHash,
      },
      continuation: {
        checkpointVersion: changed.version,
        resumedVersion: resumed.version,
        pendingCandidate: resumed.candidates.at(-1).id,
        beforeSourceHash: resumed.candidates.at(-1).beforeHash,
        afterSourceHash: resumed.candidates.at(-1).afterHash,
        writesReplayed: 0,
        duplicateDeltaIgnored: true,
      },
      retries: { duplicateDelta: 1, playwrightAutomaticRetries: 0 },
      usefulness:
        "Awaiting user acceptance; one synthetic pilot does not prove causal speedup.",
      injectedFailures:
        "Synthetic fixture source revisions; real market monitoring is unverified.",
    };
    await writeFile(
      `artifacts/blitz-pilot-${info.project.name}.json`,
      JSON.stringify(record, null, 2) + "\n",
    );
    await fresh.screenshot({
      path: `artifacts/v3-${info.project.name}-continuation.png`,
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
