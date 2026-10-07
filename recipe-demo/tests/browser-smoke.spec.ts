import { expect, test } from "@playwright/test";

test("preserves first-read evidence while claims and rows change", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");

  const rowSelect = page.locator("#head-select");
  const typeSelect = page.locator("#type-select");
  const rail = page.locator(".rail");
  const pane = page.locator(".pane");

  await expect(page.getByRole("heading", { name: "What should we do with this head?" })).toBeVisible();
  await expect(page.locator(".acceptance-summary")).toContainText("53 of 79 known heads");
  await expect(page.locator(".acceptance-summary")).toContainText("67.1%");
  await expect(page.locator(".prototype-switcher")).toHaveCount(0);

  await expect(pane.getByRole("button", { name: "This head" })).toHaveAttribute("aria-selected", "true");
  await expect(pane.getByRole("heading", { name: "First readings" })).toBeVisible();
  await expect(pane.locator(".facts .fact")).toHaveCount(4);
  await expect(pane.getByText("How strong the electrical pulse looks on this head.")).toBeVisible();

  await rowSelect.selectOption("test-head-000");
  const initialFacts = await pane.locator(".facts .fact").allTextContents();
  expect(await typeSelect.inputValue()).toBe("reader_wider");
  await expect(rail.getByText("Map proposal")).toBeVisible();

  await typeSelect.selectOption("laser_up");

  expect(await rowSelect.inputValue()).toBe("test-head-000");
  expect(await pane.locator(".facts .fact").allTextContents()).toEqual(initialFacts);
  await expect(rail.getByText("Map refused")).toBeVisible();
  await expect(rail.getByText("Next step: run the full approximate suite.")).toBeVisible();
  await expect(rail.getByText("run the full approximate suite.", { exact: false })).toHaveCount(2);

  await pane.getByRole("button", { name: "Settings" }).click();
  await expect(pane.getByText("No proposed start")).toBeVisible();
  await expect(pane.getByText("Reuse last head (fallback starting point)")).toBeVisible();
  await expect(pane.getByText("Naive starts we compare against")).toBeVisible();
  await expect(pane.getByText("Hidden ideal settings")).toBeVisible();
  await expect(pane.getByText("exceeds this threshold", { exact: false })).toBeVisible();
  await expect(pane.locator(".summary-table tbody tr")).toHaveCount(5);

  await pane.getByRole("button", { name: "Scores" }).click();
  const metrics = pane.locator(".metric-grid");
  await expect(metrics.locator(".metric-card")).toHaveCount(2);
  await expect(metrics.getByRole("heading", { name: "Average distance from ideal settings" })).toBeVisible();
  await expect(metrics.getByRole("heading", { name: "Average invented bit-error rate" })).toBeVisible();
  await expect(metrics.locator(".score-row")).toHaveCount(6);
  await expect(metrics).toContainText("Reuse last head");
  await expect(metrics).toContainText("Average for this change");
  await expect(metrics).toContainText("Learned start");
  await expect(metrics).toContainText("75.6");
  await expect(metrics).toContainText("51.7");
  await expect(metrics).toContainText("8.23e-4");
  await expect(metrics).toContainText("7.19e-4");
  for (const metricCard of await metrics.locator(".metric-card").all()) {
    const scaleCount = await metricCard.locator(".bar-track").evaluateAll((tracks) => {
      return new Set(tracks.map((track) => track.getAttribute("data-scale-max"))).size;
    });
    expect(scaleCount).toBe(1);
    const maximumWidth = await metricCard.locator(".bar-fill").evaluateAll((fills) => {
      return Math.max(...fills.map((fill) => Number.parseFloat((fill as HTMLElement).style.width)));
    });
    expect(maximumWidth).toBe(100);
  }
  const aggregateText = await metrics.innerText();

  await pane.getByRole("button", { name: "Unknown family" }).click();
  await expect(pane.locator(".checks-table tbody tr")).toHaveCount(6);
  await expect(pane.locator(".checks-table").getByText("run the full approximate suite.", { exact: false })).toHaveCount(6);

  await rowSelect.selectOption("test-head-001");
  expect(await typeSelect.inputValue()).toBe("zone_id");
  await pane.getByRole("button", { name: "Scores" }).click();
  expect(await metrics.innerText()).toBe(aggregateText);

  await page.locator("#random-head").click();
  await pane.getByRole("button", { name: "Scores" }).click();
  expect(await metrics.innerText()).toBe(aggregateText);

  await rowSelect.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#random-head")).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.25";
  });
  await expect(page.getByRole("heading", { name: "Which start landed closer?" })).toBeVisible();
  const bodyFontSize = await page.locator("body").evaluate((body) => Number.parseFloat(getComputedStyle(body).fontSize));
  expect(bodyFontSize).toBeGreaterThanOrEqual(15);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rowSelect).toBeVisible();
  await pane.getByRole("button", { name: "Unknown family" }).click();
  await expect(pane.getByRole("heading", { name: "Unknown family" })).toBeVisible();
});
