import { expect, test } from "@playwright/test";

test("walkthrough explains the model and links back to the demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).click();

  await expect(page).toHaveURL(/\/walkthrough\.html$/);
  await expect(page.getByRole("heading", { name: "A changed head needs calibration" })).toBeVisible();
  await expect(page.getByText("Step 1 of 5")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeHidden();

  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByRole("heading", { name: "The demo learns from completed logs" })).toBeVisible();
  await page.getByRole("button", { name: "Step 3: Check" }).click();
  await expect(page.getByRole("heading", { name: "First, check whether its story fits" })).toBeVisible();
  await page.getByRole("button", { name: "Step 4: Propose" }).click();
  await expect(page.getByText("Suite still required.")).toBeVisible();
  await page.getByRole("button", { name: "Step 5: Compare" }).click();
  await expect(page.getByRole("heading", { name: "Compare starts with the hidden answer" })).toBeVisible();
  await expect(page.getByText("Mapped with fallback")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible();

  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "Inspect head changes before the suite runs" })).toBeVisible();
});

test("walkthrough stays readable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/walkthrough.html");
  await page.getByRole("button", { name: "Step 5: Compare" }).click();

  await expect(page.getByRole("heading", { name: "Compare starts with the hidden answer" })).toBeVisible();
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
});
