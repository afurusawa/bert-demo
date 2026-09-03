import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FONT_WEIGHTS,
  HAIRLINE_WIDTH_PX,
  LABEL_STYLES,
  LARGE_TEXT_CONTRAST_RATIO,
  MINIMUM_SIZE_PX,
  NON_TEXT_CONTRAST_RATIO,
  NON_TEXT_INKS,
  NON_TEXT_PAIRS,
  PLOT_MINIMUM_VIEWBOX_SCALE,
  PLOT_TEXT_UNITS,
  SPACING_SCALE,
  SURFACES,
  TARGET_SIZES,
  TEXT_CONTRAST_RATIO,
  TEXT_INKS,
  TEXT_PAIRS,
  TOKEN_BLOCK_END,
  TOKEN_BLOCK_START,
  TYPE_RAMP,
  TYPE_RAMP_ANCHOR_PX,
  TYPE_RAMP_RATIO,
  contrastRatio,
  renderTokenBlock,
  requiredContrastRatio,
} from "./design-tokens";

const stylesheet = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

describe("design tokens", () => {
  it("offers exactly six type steps, each a 1.2 ratio from the 19px anchor", () => {
    const steps = Object.values(TYPE_RAMP);

    expect(steps).toHaveLength(6);
    expect(steps).toEqual([...steps].sort((first, second) => first - second));
    expect(steps).toEqual([-1, 0, 1, 2, 3, 4].map((exponent) =>
      Math.round(TYPE_RAMP_ANCHOR_PX * TYPE_RAMP_RATIO ** exponent),
    ));
    expect(TYPE_RAMP.body).toBe(TYPE_RAMP_ANCHOR_PX);
  });

  it("keeps every size token above the legible floor", () => {
    for (const size of [
      ...Object.values(TYPE_RAMP),
      ...Object.values(TARGET_SIZES),
      ...Object.values(PLOT_TEXT_UNITS).map((unit) => unit * PLOT_MINIMUM_VIEWBOX_SCALE),
    ]) {
      expect(size).toBeGreaterThanOrEqual(MINIMUM_SIZE_PX);
    }
  });

  it("meets 7:1 on every text pair set below the large-text size", () => {
    const bodyPairs = TEXT_PAIRS.filter((pair) => requiredContrastRatio(pair.minimumSizePx) === TEXT_CONTRAST_RATIO);

    expect(bodyPairs.length).toBeGreaterThan(0);
    for (const pair of bodyPairs) {
      expect(contrastRatio(TEXT_INKS[pair.ink], SURFACES[pair.surface])).toBeGreaterThanOrEqual(
        TEXT_CONTRAST_RATIO,
      );
    }
  });

  it("meets 4.5:1 on every text pair reserved for large text", () => {
    const largePairs = TEXT_PAIRS.filter(
      (pair) => requiredContrastRatio(pair.minimumSizePx) === LARGE_TEXT_CONTRAST_RATIO,
    );

    expect(largePairs.length).toBeGreaterThan(0);
    for (const pair of largePairs) {
      expect(contrastRatio(TEXT_INKS[pair.ink], SURFACES[pair.surface])).toBeGreaterThanOrEqual(
        LARGE_TEXT_CONTRAST_RATIO,
      );
    }
  });

  it("meets 3:1 on every border and focus pairing", () => {
    expect(NON_TEXT_PAIRS.length).toBeGreaterThan(0);
    for (const pair of NON_TEXT_PAIRS) {
      expect(contrastRatio(NON_TEXT_INKS[pair.ink], SURFACES[pair.surface])).toBeGreaterThanOrEqual(
        NON_TEXT_CONTRAST_RATIO,
      );
    }
  });

  it("computes contrast against the WCAG reference pairs", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 10);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("keeps every spacing step on the 4px grid", () => {
    expect(SPACING_SCALE.length).toBeGreaterThan(0);
    for (const step of SPACING_SCALE) {
      expect(step % 4).toBe(0);
    }
  });

  it("sizes standalone actions at 44x44 and in-context controls at 24x24", () => {
    expect(TARGET_SIZES.standaloneAction).toBeGreaterThanOrEqual(44);
    expect(TARGET_SIZES.inContextControl).toBeGreaterThanOrEqual(24);
  });

  it("keeps plot text legible once the viewBox has been scaled down", () => {
    for (const unit of Object.values(PLOT_TEXT_UNITS)) {
      expect(unit * PLOT_MINIMUM_VIEWBOX_SCALE).toBeGreaterThanOrEqual(MINIMUM_SIZE_PX);
    }
  });

  it("renders sizes in rem so a raised browser font size is honoured", () => {
    const block = renderTokenBlock();

    expect(block).toContain("--text-body: 1.1875rem;");
    expect(block).toContain("--space-4: 4px;");
    expect(block).toContain(`--ink-primary: ${TEXT_INKS.primary};`);
    expect(block).toContain(`--target-standalone-action: ${TARGET_SIZES.standaloneAction}px;`);
    expect(block).toContain(`--plot-text-tick-label: ${PLOT_TEXT_UNITS.tickLabel}px;`);
    expect(block).toContain(`--weight-medium: ${FONT_WEIGHTS.medium};`);
    expect(block).toContain(`--tracking-field-label: ${LABEL_STYLES.fieldLabel.trackingEm}em;`);
    expect(block).toContain(`--hairline: ${HAIRLINE_WIDTH_PX}px;`);
    expect(block).toContain("--measure-lede: 41.5625rem;");
    expect(block).toContain("--page-max-width: 90rem;");
  });

  it("has the committed stylesheet block that the tokens currently produce", () => {
    const start = stylesheet.indexOf(TOKEN_BLOCK_START);
    const end = stylesheet.indexOf(TOKEN_BLOCK_END);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(stylesheet.slice(start, end + TOKEN_BLOCK_END.length)).toBe(renderTokenBlock());
  });
});
