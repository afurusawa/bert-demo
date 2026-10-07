import { expect, test } from "@playwright/test";

test("walkthrough explains the model and links back to the demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).click();

  await expect(page).toHaveURL(/\/walkthrough\.html$/);
  await expect(page.getByRole("heading", { name: "A changed head needs calibration" })).toBeVisible();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeHidden();

  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "What does the model learn from 320 logs?" })).toBeVisible();
  await expect(page.getByText("Those settings worked in the simulated suite.", { exact: false })).toBeVisible();
  await expect(page.getByText("Refuse means no mapped starting recipe.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Step 3: Check" }).click();
  await expect(page.getByRole("heading", { name: "Do the first readings fit the change type?" })).toBeVisible();
  await page.getByRole("button", { name: "Step 4: Propose" }).click();
  await expect(page.getByText("Test them in the suite.")).toBeVisible();
  await page.getByRole("button", { name: "Step 5: Compare" }).click();
  await expect(page.getByRole("heading", { name: "Which start came closest?" })).toBeVisible();
  await expect(page.getByText("Mapped with fallback")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible();

  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "What should we do with this head?" })).toBeVisible();
});

test("walkthrough stays readable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/walkthrough.html");
  await page.getByRole("button", { name: "Step 2: Learn" }).click();
  await expect(page.getByText("Eighty is a demo choice", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Step 5: Compare" }).click();

  await expect(page.getByRole("heading", { name: "Which start came closest?" })).toBeVisible();
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
});
