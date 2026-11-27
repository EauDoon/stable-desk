import { test, expect } from "@playwright/test";

test("atlas traces a published case from the research desk and downloads the selected map", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Evidence atlas", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Evidence atlas",
  );
  await page
    .getByRole("combobox", { name: "Explore", exact: true })
    .selectOption("P-G01");
  await page.getByLabel("Find a record").fill("E-G02");
  const record = page.locator("#records button");
  await expect(record).toHaveCount(1);
  await record.focus();
  await page.keyboard.press("Enter");
  await expect(record).toBeFocused();
  await expect(page.locator("#description")).toContainText("Stripe");
  await expect(page.locator("#scope")).toContainText(
    "Verified documentation contents",
  );
  await expect(page.locator("#check")).toContainText("no merchant account");
  await expect(page.locator("#legend li")).toHaveText([
    "Source",
    "Evidence",
    "Investigation",
    "Decision",
  ]);
  await page
    .locator("#connections button")
    .filter({ hasText: "Stripe" })
    .click();
  await expect(page.locator("#source")).toHaveAttribute(
    "href",
    "https://docs.stripe.com/payments/stablecoin-payments",
  );
  const permalink = await page.locator("#permalink").getAttribute("href");
  await page.goto(permalink);
  await expect(page.locator("#kind")).toHaveText("Source / S-G02");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download map JSON" }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const graph = JSON.parse(Buffer.concat(chunks)).data.evidenceAtlas;
  expect(graph.selectedRecord).toBe("S-G02");
  expect(graph.edges).toContainEqual({
    from: "E-G02",
    to: "P-G01",
    relation: "cited by",
  });
  await expect(
    page.getByRole("link", { name: "Source review", exact: true }),
  ).toHaveAttribute("href", "./review.html");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("the atlas camera rotates on demand and resets under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/atlas.html");
  const canvas = page.locator("canvas");
  const pixels = () => canvas.evaluate((el) => el.toDataURL());
  await expect(canvas).toBeVisible();
  await expect(page.locator("#lens option")).toHaveCount(4);
  const initial = await pixels();
  const up = page.getByRole("button", { name: "Tilt up" });
  await up.focus();
  await page.keyboard.press("Enter");
  expect(await pixels()).not.toBe(initial);
  await page.getByRole("button", { name: "Reset view" }).click();
  expect(await pixels()).toBe(initial);
  await page.getByRole("button", { name: "Rotate right" }).click();
  expect(await pixels()).not.toBe(initial);
  await page.getByRole("button", { name: "Reset view" }).click();
  expect(await pixels()).toBe(initial);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 90, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 165, box.y + 100, { steps: 6 });
  await page.mouse.up();
  expect(await pixels()).not.toBe(initial);
  if (test.info().project.name === "mobile") {
    await page.getByRole("button", { name: "Reset view" }).click();
    await canvas.scrollIntoViewIfNeeded();
    const stage = await canvas.boundingBox();
    const x = stage.x + 60,
      y = stage.y + 80;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 70, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await pixels()).not.toBe(initial);
    await page.getByRole("button", { name: "Reset view" }).tap();
    await expect.poll(pixels).toBe(initial);
    await cdp.detach();
  }
});

test("atlas keeps an architecture reference with scripting disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("link", { name: "evidence atlas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Architecture reference" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(
    page.getByRole("combobox", { name: "Explore", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("link", { name: "public dataset", exact: true }),
  ).toHaveAttribute("href", "./data/baseline.json");
  await context.close();
});

test("readers compare public citations and export the synthetic case brief", async ({
  page,
}) => {
  await page.goto("/atlas.html#map=P-G01&record=E-G02");
  await page
    .getByRole("combobox", { name: "Second investigation" })
    .selectOption("P-G03");
  await expect(page.locator("#coverage")).toContainText(
    "Shared public sourcesNone",
  );
  await expect(page.locator("#coverage")).toContainText("Stripe (S-G02)");
  await expect(page.locator("#coverage")).toContainText("Coinbase (S-G07)");
  await page
    .getByText("Assumptions and disproof criteria", { exact: true })
    .click();
  await expect(page.locator("#disproves")).toContainText("No specific buyer");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download cited case brief" }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("stable-desk-P-G01-brief.md");
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const brief = Buffer.concat(chunks).toString("utf8");
  expect(brief).toContain("2026-11-27.generic.3");
  expect(brief).toContain("## Disproof criteria");
  expect(brief).toContain("supports statement: Stripe");
  expect(brief).toContain(
    "https://docs.stripe.com/payments/stablecoin-payments",
  );
  expect(brief).toContain("context only");
});
