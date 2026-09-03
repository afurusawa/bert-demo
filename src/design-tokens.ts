/**
 * The single source of truth for every sizing and colour decision in the
 * interface. See docs/adr/0001-typography-sized-by-viewing-distance.md: type is
 * sized by the ISO 9241-303 angular method at an assumed 600mm desk viewing
 * distance, not by a design system's type scale.
 */

/** The reader's unmodified root font size, used only to express px as rem. */
export const ROOT_FONT_SIZE_PX = 16;

/** 16 arcminutes at 600mm. No text may render smaller than this. */
export const MINIMUM_SIZE_PX = 15;

/** At and above this size, WCAG's large-text contrast threshold applies. */
export const LARGE_TEXT_SIZE_PX = 24;

export const TEXT_CONTRAST_RATIO = 7;
export const LARGE_TEXT_CONTRAST_RATIO = 4.5;
export const NON_TEXT_CONTRAST_RATIO = 3;

/** The modular ramp: 19px body, stepped by 1.2, from one step below to four above. */
export const TYPE_RAMP_ANCHOR_PX = 19;
export const TYPE_RAMP_RATIO = 1.2;

export const TYPE_RAMP = {
  label: 16,
  body: 19,
  heading: 23,
  headingLarge: 27,
  display: 33,
  displayLarge: 39,
} as const;

export const LINE_HEIGHTS = {
  body: 1.5,
  heading: 1.3,
  tableCell: 1.4,
} as const;

/** Every spacing value in the interface, on a 4px grid. */
export const SPACING_SCALE = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const SURFACES = {
  canvas: "#f4f6f5",
  paper: "#ffffff",
  soft: "#edf1f0",
  accent: "#3d4e50",
} as const;

/** Inks that carry text. Retired: the old faint ink, which measured 2.7:1. */
export const TEXT_INKS = {
  primary: "#192326",
  secondary: "#43514f",
  accent: "#596a6c",
  onAccent: "#ffffff",
} as const;

/** Inks that never carry text: borders, focus rings, swatch outlines. */
export const NON_TEXT_INKS = {
  border: "#7d8a89",
  borderStrong: "#5f6c6b",
  focusRing: "#3d4e50",
} as const;

export interface TextPair {
  ink: keyof typeof TEXT_INKS;
  surface: keyof typeof SURFACES;
  /** The smallest ramp step this pair may be used at. */
  minimumSizePx: number;
}

/**
 * Every ink and surface pairing the interface is allowed to draw text with.
 * A pair used below the large-text size must clear 7:1; the accent ink is
 * admitted only at display sizes, where 4.5:1 applies.
 */
export const TEXT_PAIRS: readonly TextPair[] = [
  { ink: "primary", surface: "canvas", minimumSizePx: TYPE_RAMP.label },
  { ink: "primary", surface: "paper", minimumSizePx: TYPE_RAMP.label },
  { ink: "primary", surface: "soft", minimumSizePx: TYPE_RAMP.label },
  { ink: "secondary", surface: "canvas", minimumSizePx: TYPE_RAMP.label },
  { ink: "secondary", surface: "paper", minimumSizePx: TYPE_RAMP.label },
  { ink: "secondary", surface: "soft", minimumSizePx: TYPE_RAMP.label },
  { ink: "onAccent", surface: "accent", minimumSizePx: TYPE_RAMP.label },
  { ink: "accent", surface: "canvas", minimumSizePx: TYPE_RAMP.display },
  { ink: "accent", surface: "paper", minimumSizePx: TYPE_RAMP.display },
];

export interface NonTextPair {
  ink: keyof typeof NON_TEXT_INKS;
  surface: keyof typeof SURFACES;
}

export const NON_TEXT_PAIRS: readonly NonTextPair[] = [
  { ink: "border", surface: "canvas" },
  { ink: "border", surface: "paper" },
  { ink: "border", surface: "soft" },
  { ink: "borderStrong", surface: "canvas" },
  { ink: "borderStrong", surface: "paper" },
  { ink: "focusRing", surface: "canvas" },
  { ink: "focusRing", surface: "paper" },
];

/** Fitts's Law, not one imported constant: standalone actions are hit from further away. */
export const TARGET_SIZES = {
  standaloneAction: 44,
  inContextControl: 24,
} as const;

/**
 * Plot text is written in drawing units, not px: the SVG declares a
 * 1000-unit viewBox and renders at 100% width, so a unit becomes
 * (rendered width / 1000) px. At the 1440px design width both plot surfaces
 * render at least 1.1x, which is the scale these units are sized against.
 */
export const PLOT_MINIMUM_VIEWBOX_SCALE = 1.1;

export const PLOT_TEXT_UNITS = {
  tickLabel: 15,
  axisTitle: 14,
  annotation: 15,
  annotationSecondary: 14,
} as const;

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.2 relative contrast between two opaque hex colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/** The contrast a pair must clear: 4.5:1 once it is only ever set at large text. */
export function requiredContrastRatio(minimumSizePx: number): number {
  return minimumSizePx >= LARGE_TEXT_SIZE_PX ? LARGE_TEXT_CONTRAST_RATIO : TEXT_CONTRAST_RATIO;
}

function rem(px: number): string {
  return `${Number((px / ROOT_FONT_SIZE_PX).toFixed(4))}rem`;
}

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export const TOKEN_BLOCK_START = "/* generated by npm run generate:tokens - do not edit by hand */";
export const TOKEN_BLOCK_END = "/* end generated tokens */";

/**
 * The custom-property block committed into the stylesheet. Sizes are emitted in
 * rem so a reader who has raised their browser font size is honoured; px is
 * retained for hairlines, target sizes and plot drawing units.
 */
export function renderTokenBlock(): string {
  const declarations = [
    ...Object.entries(TYPE_RAMP).map(([name, size]) => `--text-${kebabCase(name)}: ${rem(size)};`),
    ...Object.entries(LINE_HEIGHTS).map(([name, height]) => `--leading-${kebabCase(name)}: ${height};`),
    ...SPACING_SCALE.map((step) => `--space-${step}: ${step}px;`),
    ...Object.entries(SURFACES).map(([name, color]) => `--surface-${kebabCase(name)}: ${color};`),
    ...Object.entries(TEXT_INKS).map(([name, color]) => `--ink-${kebabCase(name)}: ${color};`),
    ...Object.entries(NON_TEXT_INKS).map(([name, color]) => `--edge-${kebabCase(name)}: ${color};`),
    ...Object.entries(TARGET_SIZES).map(([name, size]) => `--target-${kebabCase(name)}: ${size}px;`),
    ...Object.entries(PLOT_TEXT_UNITS).map(([name, size]) => `--plot-text-${kebabCase(name)}: ${size}px;`),
  ];

  return [
    TOKEN_BLOCK_START,
    ":root {",
    ...declarations.map((declaration) => `  ${declaration}`),
    "}",
    TOKEN_BLOCK_END,
  ].join("\n");
}
