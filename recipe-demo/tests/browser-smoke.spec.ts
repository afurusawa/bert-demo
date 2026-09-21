import { expect, test } from "@playwright/test";

test("preserves first-read evidence while claims and rows change", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");

  const rowSelect = page.locator("#head-select");
  const typeSelect = page.locator("#type-select");
  const selectedPanel = page.locator(".selected-panel");
  const metricsPanel = page.locator(".metrics-panel");

  await expect(page.locator(".acceptance-summary")).toContainText("53 of 79 known heads");
  await expect(page.locator(".acceptance-summary")).toContainText("67.1%");
  await expect(metricsPanel.locator(".metric-card")).toHaveCount(2);
  await expect(metricsPanel.locator(".metric-card").nth(0).getByRole("heading", { name: "Mean starting L2 distance" })).toBeVisible();
  await expect(metricsPanel.locator(".metric-card").nth(1).getByRole("heading", { name: "Mean synthetic starting BER" })).toBeVisible();
  await expect(metricsPanel.locator(".score-row")).toHaveCount(6);
  await expect(metricsPanel).toContainText("copy last");
  await expect(metricsPanel).toContainText("same-type mean");
  await expect(metricsPanel).toContainText("mapped with fallback");
  await expect(metricsPanel.locator(".metric-card").nth(0)).toContainText("register counts");
  await expect(metricsPanel.locator(".metric-card").nth(1)).toContainText("synthetic BER");
  await expect(metricsPanel).toContainText("75.6");
  await expect(metricsPanel).toContainText("51.7");
  await expect(metricsPanel).toContainText("8.23e-4");
  await expect(metricsPanel).toContainText("7.19e-4");
  for (const metricCard of await metricsPanel.locator(".metric-card").all()) {
    const scaleCount = await metricCard.locator(".bar-track").evaluateAll((tracks) => {
      return new Set(tracks.map((track) => track.getAttribute("data-scale-max"))).size;
    });
    expect(scaleCount).toBe(1);
    const maximumWidth = await metricCard.locator(".bar-fill").evaluateAll((fills) => {
      return Math.max(...fills.map((fill) => Number.parseFloat((fill as HTMLElement).style.width)));
    });
    expect(maximumWidth).toBe(100);
  }
  await expect(metricsPanel).toContainText("fixed mixed-workload baseline");
  const aggregateText = await metricsPanel.innerText();

  await expect(selectedPanel.locator(".mask-table tbody tr")).toHaveCount(2);
  await expect(selectedPanel.locator(".mask-table tbody tr").nth(0).locator("td")).toHaveCount(12);
  await expect(selectedPanel.locator(".mask-table tbody tr").nth(1).locator("td")).toHaveCount(12);
  await expect(selectedPanel.locator(".recipe-table tbody tr")).toHaveCount(4);
  await expect(selectedPanel.locator(".recipe-table")).toContainText("mapped start");
  const maskSummary = page.locator("section", { has: page.locator("#mask-summary-heading") });
  await expect(maskSummary.locator(".summary-table tbody tr")).toHaveCount(5);

  await rowSelect.selectOption("test-head-000");
  const initialFacts = await selectedPanel.locator(".facts .fact").allTextContents();
  expect(await typeSelect.inputValue()).toBe("reader_wider");

  await typeSelect.selectOption("laser_up");

  expect(await rowSelect.inputValue()).toBe("test-head-000");
  expect(await selectedPanel.locator(".facts .fact").allTextContents()).toEqual(initialFacts);
  expect(await metricsPanel.innerText()).toBe(aggregateText);
  await expect(selectedPanel.getByText("MAP REFUSED", { exact: true })).toBeVisible();
  await expect(selectedPanel.getByText("Claimed type: laser up.", { exact: false })).toBeVisible();
  await expect(selectedPanel.getByText("run the full approximate suite.", { exact: false })).toHaveCount(2);
  await expect(selectedPanel.getByText("Refused map:", { exact: false })).toBeVisible();
  await expect(selectedPanel.getByText("copy last (fallback starting point)", { exact: false })).toBeVisible();
  await expect(selectedPanel.getByText("mapped start (refused)", { exact: false })).toBeVisible();

  await rowSelect.selectOption("test-head-001");

  expect(await typeSelect.inputValue()).toBe("zone_id");
  await expect(selectedPanel.getByText("Claimed type: zone id.", { exact: false })).toBeVisible();
  expect(await metricsPanel.innerText()).toBe(aggregateText);

  await page.locator("#random-head").click();
  expect(await metricsPanel.innerText()).toBe(aggregateText);

  await rowSelect.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#random-head")).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.25";
  });
  await expect(page.getByRole("heading", { name: "Starting quality on the same 79 known heads" })).toBeVisible();
  const bodyFontSize = await page.locator("body").evaluate((body) => Number.parseFloat(getComputedStyle(body).fontSize));
  expect(bodyFontSize).toBeGreaterThanOrEqual(15);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rowSelect).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unknown family stays outside the aggregates" })).toBeVisible();

  const unknownPanel = page.locator(".unknown-card");
  await expect(unknownPanel.locator(".checks-table tbody tr")).toHaveCount(6);
  await expect(unknownPanel.locator(".checks-table").getByText("run the full approximate suite.", { exact: false })).toHaveCount(6);
});
