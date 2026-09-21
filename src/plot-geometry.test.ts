import { describe, expect, it } from "vitest";
import { PLOT_TEXT_UNITS } from "./design-tokens";
import {
  CONTOUR_ANNOTATION,
  moveSelection,
  PLOT_TEXT,
  VIEWBOX_WIDTH,
} from "./plot-geometry";

describe("plot geometry", () => {
  it("keeps the SVG text units and contour annotation geometry with the viewBox", () => {
    expect(VIEWBOX_WIDTH).toBe(1_000);
    expect(PLOT_TEXT).toEqual({
      tickLabel: PLOT_TEXT_UNITS.tickLabel,
      axisTitle: PLOT_TEXT_UNITS.axisTitle,
      annotation: PLOT_TEXT_UNITS.annotation,
      annotationSecondary: PLOT_TEXT_UNITS.annotationSecondary,
    });
    expect(CONTOUR_ANNOTATION.width).toBe(240);
    expect(CONTOUR_ANNOTATION.height).toBe(40);
  });

  it("does not claim browser navigation keys", () => {
    expect(moveSelection(4, "Tab", 3, 3)).toBeNull();
    expect(moveSelection(4, "Enter", 3, 3)).toBeNull();
  });
});
