import { describe, expect, it } from "vitest";
import { moveSelection } from "./plot-geometry";

describe("plot geometry", () => {
  it("does not claim browser navigation keys", () => {
    expect(moveSelection(4, "Tab", 3, 3)).toBeNull();
    expect(moveSelection(4, "Enter", 3, 3)).toBeNull();
  });
});
