import { describe, expect, it } from "vitest";
import { loadDiagnosisCases } from "./diagnosis-loader";
import { splitCorpus } from "./diagnosis-model";

describe("diagnosis corpus loading", () => {
  it("loads every stored case asynchronously, labelled and pending alike", async () => {
    const cases = await loadDiagnosisCases();
    const splits = splitCorpus(cases);

    expect(cases.length).toBeGreaterThan(600);
    expect(cases[0].id).toBe("case-0001");
    expect(splits.training.length + splits.calibration.length + splits.holdout.length).toBe(
      cases.filter((item) => item.confirmedCause).length,
    );
    expect(splits.pending.length).toBeGreaterThan(0);
    expect(splits.pending.every((item) => item.confirmedCause === undefined)).toBe(true);
  });

  it("returns the same array on a second call rather than reparsing", async () => {
    expect(await loadDiagnosisCases()).toBe(await loadDiagnosisCases());
  });
});
