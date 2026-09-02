import { describe, expect, it } from "vitest";
import {
  createSeededRandom,
  calculateEyeMetrics,
  calculateComparisonMetrics,
  compareScanCells,
  deriveCell,
  erfc,
  generateSyntheticRuns,
  oneSidedUpperBer,
  samplePoisson,
} from "./scan-model";

describe("scan model", () => {
  it("calculates the complementary error function accurately", () => {
    expect(erfc(0)).toBeCloseTo(1, 12);
    expect(erfc(0.5)).toBeCloseTo(0.4795001222, 6);
    expect(erfc(1)).toBeCloseTo(0.1572992071, 6);
    expect(erfc(-1)).toBeCloseTo(1.8427007929, 6);
  });

  it("samples a Poisson distribution with deterministic input", () => {
    const random = createSeededRandom("poisson-distribution");
    const samples = Array.from({ length: 4_000 }, () => samplePoisson(12, random));
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance =
      samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;

    expect(mean).toBeGreaterThan(11.5);
    expect(mean).toBeLessThan(12.5);
    expect(variance).toBeGreaterThan(10);
    expect(variance).toBeLessThan(14);
    expect(samplePoisson(0, () => 0.5)).toBe(0);
  });

  it("calculates one-sided 95% BER upper bounds for censored and measured counts", () => {
    expect(oneSidedUpperBer(0, 1_000)).toBeCloseTo(0.0029912495451, 10);
    expect(oneSidedUpperBer(0, 1_000_000_000)).toBeGreaterThan(2.99e-9);
    expect(oneSidedUpperBer(0, 1_000_000_000)).toBeLessThan(3e-9);
    expect(oneSidedUpperBer(1, 1_000)).toBeCloseTo(0.0047349935755, 10);
  });

  it("generates twelve raw, grouped scans with byte-identical seeded output", () => {
    const first = generateSyntheticRuns("fixture-seed");
    const second = generateSyntheticRuns("fixture-seed");
    const differentSeed = generateSyntheticRuns("different-fixture-seed");

    expect(first).toHaveLength(12);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(differentSeed));
    expect(first.map((run) => run.id)).toEqual([
      "baseline-20260612-lane-1",
      "baseline-20260612-lane-2",
      "baseline-20260612-lane-3",
      "baseline-20260612-lane-4",
      "later-20260708-lane-1",
      "later-20260708-lane-2",
      "later-20260708-lane-3",
      "later-20260708-lane-4",
      "thermal-20260708-lane-1",
      "thermal-20260708-lane-2",
      "thermal-20260708-lane-3",
      "thermal-20260708-lane-4",
    ]);
    expect(first.every((run) => run.synthetic)).toBe(true);
    expect(first.every((run) => run.sweep.bitsTested === 1_000_000_000)).toBe(true);
    expect(first.every((run) => run.cells.every((cell) => Number.isSafeInteger(cell.errors)))).toBe(
      true,
    );
    expect(first.find((run) => run.id === "later-20260708-lane-3")?.temperatureC).toBe(23);
    expect(first.filter((run) => run.id.startsWith("thermal-")).every((run) => run.temperatureC === 70)).toBe(
      true,
    );
  });

  it("derives measured BER separately from the confidence-qualified field", () => {
    const censored = deriveCell({ errors: 0 }, 1_000_000_000);
    const measured = deriveCell({ errors: 2 }, 1_000_000_000);

    expect(censored.observedBer).toBeNull();
    expect(censored.isCensored).toBe(true);
    expect(censored.upperConfidenceBer).toBeCloseTo(2.9957322736e-9, 15);
    expect(measured.observedBer).toBe(2e-9);
    expect(measured.isCensored).toBe(false);
    expect(measured.observedBer).not.toBeNull();
    expect(measured.upperConfidenceBer).toBeGreaterThan(measured.observedBer ?? 0);
  });

  it("finds interpolated width and height on the nominal slices", () => {
    const bitsTested = 1_000_000_000;
    const axis = { min: -2, max: 2, steps: 5 };
    const cells = Array.from({ length: 25 }, () => ({ errors: 0 }));
    const setErrors = (thresholdIndex: number, phaseIndex: number, errors: number) => {
      cells[thresholdIndex * axis.steps + phaseIndex] = { errors };
    };

    setErrors(2, 0, bitsTested);
    setErrors(2, 4, bitsTested);
    setErrors(0, 2, bitsTested);
    setErrors(4, 2, bitsTested);

    const metrics = calculateEyeMetrics({
      sweep: {
        phase: axis,
        threshold: axis,
        bitsTested,
      },
      cells,
      dataRateGbps: 25.78,
    });

    expect(metrics.widthPs).toBeCloseTo(2.5921271519, 8);
    expect(metrics.widthUi).toBeCloseTo(0.06683, 4);
    expect(metrics.heightMv).toBeCloseTo(2.5921271519, 8);
  });

  it("does not treat zero errors as passing when the tested-bit count is insufficient", () => {
    const axis = { min: -2, max: 2, steps: 5 };
    const metrics = calculateEyeMetrics({
      sweep: { phase: axis, threshold: axis, bitsTested: 1_000_000 },
      cells: Array.from({ length: 25 }, () => ({ errors: 0 })),
      dataRateGbps: 25.78,
    });

    expect(metrics.widthPs).toBe(0);
    expect(metrics.heightMv).toBe(0);
  });

  it("classifies exact, below-resolution, and confidence-bounded comparison changes", () => {
    const bitsTested = 1_000_000_000;

    const exact = compareScanCells({ errors: 20 }, { errors: 200 }, bitsTested);
    expect(exact.kind).toBe("exact");
    expect(exact.logBerDelta).toBeCloseTo(1, 12);
    expect(exact.boundDirection).toBeNull();

    const belowResolution = compareScanCells({ errors: 0 }, { errors: 0 }, bitsTested);
    expect(belowResolution.kind).toBe("below-resolution");
    expect(belowResolution.logBerDelta).toBeNull();
    expect(belowResolution.boundDirection).toBeNull();

    const bounded = compareScanCells({ errors: 0 }, { errors: 200 }, bitsTested);
    expect(bounded.kind).toBe("bounded");
    expect(bounded.boundDirection).toBe("worsened");
    expect(bounded.boundMagnitude).toBeCloseTo(
      Math.log10(200 / 2.9957322736),
      8,
    );

    const ambiguous = compareScanCells({ errors: 0 }, { errors: 1 }, bitsTested);
    expect(ambiguous.kind).toBe("bounded");
    expect(ambiguous.boundDirection).toBe("uncertain");
    expect(ambiguous.boundMagnitude).toBeNull();

    const improved = compareScanCells({ errors: 200 }, { errors: 0 }, bitsTested);
    expect(improved.kind).toBe("bounded");
    expect(improved.boundDirection).toBe("improved");
    expect(improved.boundMagnitude).toBeCloseTo(
      Math.log10(200 / 2.9957322736),
      8,
    );
  });

  it("reports width and height deltas using the later-minus-baseline convention", () => {
    const axis = { min: -2, max: 2, steps: 5 };
    const bitsTested = 1_000_000_000;
    const baselineCells = Array.from({ length: 25 }, () => ({ errors: 0 }));
    const laterCells = Array.from({ length: 25 }, () => ({ errors: bitsTested }));

    const metrics = calculateComparisonMetrics(
      {
        sweep: { phase: axis, threshold: axis, bitsTested },
        cells: baselineCells,
        dataRateGbps: 25.78,
      },
      {
        sweep: { phase: axis, threshold: axis, bitsTested },
        cells: laterCells,
        dataRateGbps: 25.78,
      },
    );

    expect(metrics.baseline.widthPs).toBe(4);
    expect(metrics.later.widthPs).toBe(0);
    expect(metrics.widthDeltaPs).toBe(-4);
    expect(metrics.widthDeltaUi).toBeCloseTo(-0.10312, 5);
    expect(metrics.heightDeltaMv).toBe(-4);
  });
});
