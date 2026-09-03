import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AVERAGE_CHARACTER_WIDTH_EM,
  BREAKPOINTS,
  LABEL_STYLES,
  LEDE_MEASURE_CHARACTERS,
  MEASURE_BAND_CHARACTERS,
  MINIMUM_SIZE_PX,
  ROOT_FONT_SIZE_PX,
  SURFACES,
  TEXT_CONTRAST_RATIO,
  TEXT_INKS,
  TYPE_RAMP,
  contrastRatio,
} from "./design-tokens";

/**
 * The shared foundation is the slice of the stylesheet every surface inherits:
 * base elements, the header, the banner, headings, body copy, the lede, the two
 * label classes, buttons and the footer. The per-surface rules that follow it
 * are still being migrated onto the tokens, ticket by ticket, so the checks
 * here are scoped to the marked region rather than to the whole file.
 */
const FOUNDATION_START = "/* shared foundation */";
const FOUNDATION_END = "/* end shared foundation */";

const stylesheet = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

function foundationSource(): string {
  const start = stylesheet.indexOf(FOUNDATION_START);
  const end = stylesheet.indexOf(FOUNDATION_END);

  if (start < 0 || end < start) {
    throw new Error(`styles.css has no ${FOUNDATION_START} ... ${FOUNDATION_END} region`);
  }

  return stylesheet.slice(start + FOUNDATION_START.length, end).replace(/\/\*[\s\S]*?\*\//g, "");
}

const foundation = foundationSource();

/**
 * The base rules, with the breakpoint overrides removed. Rules are matched with
 * a flat brace pair, so a rule nested in an @media block would otherwise be
 * indistinguishable from the base rule it overrides.
 */
function withoutMediaBlocks(source: string): string {
  let output = "";
  let index = 0;

  while (index < source.length) {
    const start = source.indexOf("@media", index);

    if (start < 0) {
      return output + source.slice(index);
    }

    output += source.slice(index, start);

    let depth = 0;
    let cursor = source.indexOf("{", start);

    do {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    } while (depth > 0 && cursor < source.length);

    index = cursor;
  }

  return output;
}

const baseRules = withoutMediaBlocks(foundation);

interface Declaration {
  property: string;
  value: string;
}

function declarations(source: string): Declaration[] {
  return [...source.matchAll(/([-a-z]+)\s*:\s*([^;{}]+);/g)].map((match) => ({
    property: match[1],
    value: match[2].trim(),
  }));
}

/** The declarations of every rule whose selector list mentions `selector`. */
function ruleDeclarations(selector: string): Declaration[] {
  const rules = [...baseRules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((rule) =>
    rule[1].split(",").some((candidate) => candidate.trim() === selector),
  );

  expect(rules.length, `no rule for ${selector}`).toBeGreaterThan(0);

  return rules.flatMap((rule) => declarations(rule[2]));
}

function valueOf(selector: string, property: string): string {
  const declaration = ruleDeclarations(selector)
    .filter((candidate) => candidate.property === property)
    .at(-1);

  expect(declaration, `${selector} sets no ${property}`).toBeDefined();

  return declaration!.value;
}

function tokenName(value: string, prefix: string): string {
  const match = value.match(new RegExp(String.raw`^var\(--${prefix}-([a-z-]+)\)$`));

  expect(match, `${value} is not a --${prefix} token`).not.toBeNull();

  return match![1];
}

function camelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

const foundationDeclarations = declarations(foundation);

describe("shared type foundation", () => {
  it("sets every font size from the six-step ramp", () => {
    const sizes = foundationDeclarations.filter((entry) => entry.property === "font-size");

    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(Object.keys(TYPE_RAMP)).toContain(camelCase(tokenName(size.value, "text")));
    }
  });

  it("collapses the foundation to at most the six ramp steps", () => {
    const steps = new Set(
      foundationDeclarations
        .filter((entry) => entry.property === "font-size")
        .map((entry) => entry.value),
    );

    expect(steps.size).toBeLessThanOrEqual(Object.keys(TYPE_RAMP).length);
  });

  it("renders no text below the legible floor", () => {
    for (const size of foundationDeclarations.filter((entry) => entry.property === "font-size")) {
      const step = camelCase(tokenName(size.value, "text")) as keyof typeof TYPE_RAMP;

      expect(TYPE_RAMP[step]).toBeGreaterThanOrEqual(MINIMUM_SIZE_PX);
    }
  });

  it("expresses every length as a token, leaving px to the hairline", () => {
    expect(foundation).not.toMatch(/\d+px/);
  });

  it("sets line height from the leading tokens", () => {
    const heights = foundationDeclarations.filter((entry) => entry.property === "line-height");

    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights) {
      tokenName(height.value, "leading");
    }
  });

  it("colours text only with inks that carry text", () => {
    const colors = foundationDeclarations.filter(
      (entry) => entry.property === "color" && entry.value !== "inherit",
    );

    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(Object.keys(TEXT_INKS)).toContain(camelCase(tokenName(color.value, "ink")));
    }
  });

  it("no longer colours any text with the retired faint and muted inks", () => {
    expect(foundation).not.toMatch(/--faint|--muted/);
  });

  it("names the two label classes and keeps them distinct", () => {
    const fieldLabel = ruleDeclarations(".field-label");
    const sectionKicker = ruleDeclarations(".section-kicker");

    expect(fieldLabel).not.toEqual(sectionKicker);
  });

  it("sets the field label at the label step, uppercase, at reduced tracking", () => {
    expect(valueOf(".field-label", "font-size")).toBe("var(--text-label)");
    expect(TYPE_RAMP.label).toBe(16);
    expect(valueOf(".field-label", "letter-spacing")).toBe("var(--tracking-field-label)");
    expect(LABEL_STYLES.fieldLabel.trackingEm).toBe(0.06);
    expect(valueOf(".field-label", "font-weight")).toBe("var(--weight-medium)");
    expect(LABEL_STYLES.fieldLabel.weight).toBe(500);
    expect(valueOf(".field-label", "text-transform")).toBe("uppercase");
  });

  it("draws the field label at 7:1 over every surface it sits on", () => {
    const ink = camelCase(tokenName(valueOf(".field-label", "color"), "ink")) as keyof typeof TEXT_INKS;

    for (const surface of [SURFACES.canvas, SURFACES.paper, SURFACES.soft]) {
      expect(contrastRatio(TEXT_INKS[ink], surface)).toBeGreaterThanOrEqual(TEXT_CONTRAST_RATIO);
    }
  });

  it("keeps the lede inside the comfortable measure at the new body size", () => {
    expect(valueOf(".lede", "max-width")).toBe("var(--measure-lede)");
    expect(valueOf(".lede", "font-size")).toBe("var(--text-body)");
    expect(LEDE_MEASURE_CHARACTERS).toBeGreaterThanOrEqual(MEASURE_BAND_CHARACTERS.minimum);
    expect(LEDE_MEASURE_CHARACTERS).toBeLessThanOrEqual(MEASURE_BAND_CHARACTERS.maximum);
    expect(AVERAGE_CHARACTER_WIDTH_EM).toBeGreaterThan(0);
  });

  it("reaches its breakpoints in em, so a raised font size reaches them sooner", () => {
    for (const breakpoint of Object.values(BREAKPOINTS)) {
      expect(foundation).toContain(`@media (max-width: ${breakpoint / ROOT_FONT_SIZE_PX}em)`);
    }
  });
});
