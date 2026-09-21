import { expect, test } from "@playwright/test";

test("preserves first-read evidence while claims and rows change", async ({ page }) => {
  await page.goto("/");

  const rowSelect = page.locator("#head-select");
  const typeSelect = page.locator("#type-select");
  const selectedPanel = page.locator(".selected-panel");

  await rowSelect.selectOption("test-head-000");
  const initialFacts = await selectedPanel.locator(".facts .fact").allTextContents();
  expect(await typeSelect.inputValue()).toBe("reader_wider");

  await typeSelect.selectOption("laser_up");

  expect(await rowSelect.inputValue()).toBe("test-head-000");
  expect(await selectedPanel.locator(".facts .fact").allTextContents()).toEqual(initialFacts);
  await expect(selectedPanel.getByText("MAP REFUSED", { exact: true })).toBeVisible();
  await expect(selectedPanel.getByText("Claimed type: laser up.", { exact: false })).toBeVisible();
  await expect(selectedPanel.getByText("run the full approximate suite.", { exact: false })).toHaveCount(2);
  await expect(selectedPanel.getByText("Refused map:", { exact: false })).toBeVisible();
  await expect(selectedPanel.getByText("copy last (fallback starting point)", { exact: false })).toBeVisible();
  await expect(selectedPanel.getByText("mapped start (refused)", { exact: false })).toBeVisible();

  await rowSelect.selectOption("test-head-001");

  expect(await typeSelect.inputValue()).toBe("zone_id");
  await expect(selectedPanel.getByText("Claimed type: zone id.", { exact: false })).toBeVisible();

  await rowSelect.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#random-head")).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rowSelect).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unknown family stays outside the aggregates" })).toBeVisible();

  const unknownPanel = page.locator(".unknown-card");
  await expect(unknownPanel.locator(".checks-table tbody tr")).toHaveCount(6);
  await expect(unknownPanel.locator(".checks-table").getByText("run the full approximate suite.", { exact: false })).toHaveCount(6);
});
