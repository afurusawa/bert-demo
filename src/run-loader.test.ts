import { describe, expect, it } from "vitest";
import { loadRuns } from "./run-loader";

describe("run loading", () => {
  it("loads the complete static fixture set asynchronously", async () => {
    const runs = await loadRuns();

    expect(runs).toHaveLength(12);
    expect(runs.map((run) => run.id)).toContain("baseline-20260612-lane-3");
    expect(runs.map((run) => run.id)).toContain("later-20260708-lane-3");
    expect(runs.map((run) => run.id)).toContain("thermal-20260708-lane-3");
  });
});
