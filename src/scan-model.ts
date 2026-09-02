const ERFC_P = 0.3275911;
const ERFC_COEFFICIENTS = [
  1.061405429,
  -1.453152027,
  1.421413741,
  -0.284496736,
  0.254829592,
] as const;

/** Complementary error function using Abramowitz and Stegun 7.1.26. */
export function erfc(value: number): number {
  if (value === 0) {
    return 1;
  }

  if (value < 0) {
    return 2 - erfc(-value);
  }

  const t = 1 / (1 + ERFC_P * value);
  const [a5, a4, a3, a2, a1] = ERFC_COEFFICIENTS;
  const polynomial = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;

  return polynomial * Math.exp(-value * value);
}

export type RandomSource = () => number;

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    return seed >>> 0;
  }

  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Returns a small deterministic PRNG suitable for fixture generation. */
export function createSeededRandom(seed: number | string): RandomSource {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function usableRandom(random: RandomSource): number {
  return Math.min(1 - Number.EPSILON, Math.max(Number.MIN_VALUE, random()));
}

/** Samples a Poisson count, switching to a normal approximation for large means. */
export function samplePoisson(mean: number, random: RandomSource = Math.random): number {
  if (!Number.isFinite(mean) || mean <= 0) {
    return 0;
  }

  if (mean <= 30) {
    const threshold = Math.exp(-mean);
    let product = 1;
    let count = 0;

    do {
      product *= usableRandom(random);
      count += 1;
    } while (product > threshold);

    return count - 1;
  }

  const normal = Math.sqrt(-2 * Math.log(usableRandom(random))) *
    Math.cos(2 * Math.PI * usableRandom(random));
  return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal));
}

const LOG_GAMMA_COEFFICIENTS = [
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.5073432786869,
  -0.1385710952657,
  9.984369578019572e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(value: number): number {
  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }

  let shifted = value - 1;
  let sum = 0.9999999999998099;
  for (const coefficient of LOG_GAMMA_COEFFICIENTS) {
    shifted += 1;
    sum += coefficient / shifted;
  }

  const g = 7;
  const t = value + g - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (value - 0.5) * Math.log(t) - t + Math.log(sum);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const minimum = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  d = Math.abs(d) < minimum ? minimum : d;
  d = 1 / d;
  let result = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const m = iteration;
    const m2 = 2 * m;
    let term = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + term * d;
    d = Math.abs(d) < minimum ? minimum : d;
    c = 1 + term / c;
    c = Math.abs(c) < minimum ? minimum : c;
    d = 1 / d;
    result *= d * c;

    term = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + term * d;
    d = Math.abs(d) < minimum ? minimum : d;
    c = 1 + term / c;
    c = Math.abs(c) < minimum ? minimum : c;
    d = 1 / d;
    const delta = d * c;
    result *= delta;

    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  return result;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }

  const logFront =
    a * Math.log(x) + b * Math.log1p(-x) - logGamma(a) - logGamma(b) + logGamma(a + b);
  const front = Math.exp(logFront);

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }

  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function inverseRegularizedBeta(probability: number, a: number, b: number): number {
  let lower = 0;
  let upper = 1;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (regularizedIncompleteBeta(middle, a, b) < probability) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return (lower + upper) / 2;
}

/** Exact one-sided binomial upper confidence bound for an observed BER. */
export function oneSidedUpperBer(
  errorCount: number,
  bitsTested: number,
  confidence = 0.95,
): number {
  if (
    !Number.isSafeInteger(errorCount) ||
    errorCount < 0 ||
    !Number.isSafeInteger(bitsTested) ||
    bitsTested <= 0 ||
    errorCount > bitsTested ||
    confidence <= 0 ||
    confidence >= 1
  ) {
    throw new RangeError("BER confidence inputs must be safe integer counts with 0 < confidence < 1");
  }

  if (errorCount === bitsTested) {
    return 1;
  }

  const alpha = 1 - confidence;
  if (errorCount === 0) {
    return -Math.expm1(Math.log(alpha) / bitsTested);
  }

  return inverseRegularizedBeta(confidence, errorCount + 1, bitsTested - errorCount);
}

export interface AxisSpec {
  min: number;
  max: number;
  steps: number;
}

export interface SweepGeometry {
  phase: AxisSpec;
  threshold: AxisSpec;
  bitsTested: number;
}

export interface ScanCell {
  errors: number;
}

export interface ScanRun {
  id: string;
  startedAt: string;
  operator: string;
  instrument: {
    serial: string;
    firmware: string;
  };
  dut: {
    id: string;
    description: string;
  };
  lane: number;
  dataRateGbps: number;
  pattern: string;
  temperatureC: number;
  notes?: string;
  synthetic: true;
  sweep: SweepGeometry;
  cells: ScanCell[];
}

type ModelCondition = "healthy" | "degraded";

interface ModelParameters {
  amplitudeMv: number;
  voltageNoiseMv: number;
  timingJitterPs: number;
  widthUi: number;
  exponent: number;
}

const MODEL_PARAMETERS: Record<ModelCondition, ModelParameters> = {
  healthy: {
    amplitudeMv: 150,
    voltageNoiseMv: 17,
    timingJitterPs: 2.2,
    widthUi: 0.86,
    exponent: 2.5,
  },
  degraded: {
    amplitudeMv: 140,
    voltageNoiseMv: 26,
    timingJitterPs: 4,
    widthUi: 0.78,
    exponent: 2.5,
  },
};

const DEFAULT_SWEEP: SweepGeometry = {
  phase: { min: -20, max: 20, steps: 65 },
  threshold: { min: -220, max: 220, steps: 45 },
  bitsTested: 1_000_000_000,
};

function axisValue(axis: AxisSpec, index: number): number {
  if (axis.steps <= 1) {
    return axis.min;
  }
  return axis.min + ((axis.max - axis.min) * index) / (axis.steps - 1);
}

function trueBer(
  phasePs: number,
  thresholdMv: number,
  dataRateGbps: number,
  condition: ModelCondition,
): number {
  const parameters = MODEL_PARAMETERS[condition];
  const uiPs = 1_000 / dataRateGbps;
  const effectiveAmplitude =
    parameters.amplitudeMv *
    Math.max(
      0,
      1 -
        (2 * Math.abs(phasePs)) ** parameters.exponent /
          (uiPs * parameters.widthUi) ** parameters.exponent,
    );
  const sqrtTwo = Math.sqrt(2);
  const voltageBer =
    0.25 *
    (erfc((effectiveAmplitude - thresholdMv) / (sqrtTwo * parameters.voltageNoiseMv)) +
      erfc((effectiveAmplitude + thresholdMv) / (sqrtTwo * parameters.voltageNoiseMv)));
  const timingBer =
    0.25 * erfc((uiPs / 2 - Math.abs(phasePs)) / (sqrtTwo * parameters.timingJitterPs));

  return Math.min(0.5, Math.max(0, voltageBer + timingBer));
}

interface FixtureGroup {
  prefix: string;
  date: string;
  dutId: string;
  temperatureC: number;
  condition: ModelCondition;
  notes?: string;
}

const FIXTURE_GROUPS: FixtureGroup[] = [
  {
    prefix: "baseline",
    date: "2026-06-12",
    dutId: "DUT-4471",
    temperatureC: 23,
    condition: "healthy",
  },
  {
    prefix: "later",
    date: "2026-07-08",
    dutId: "DUT-5120",
    temperatureC: 23,
    condition: "healthy",
  },
  {
    prefix: "thermal",
    date: "2026-07-08",
    dutId: "DUT-4471",
    temperatureC: 70,
    condition: "degraded",
    notes: "Thermal chamber stabilized before the scan.",
  },
];

function groupCondition(group: FixtureGroup, lane: number): ModelCondition {
  return group.prefix === "later" && lane === 3 ? "degraded" : group.condition;
}

function runStartTime(group: FixtureGroup, lane: number): string {
  const hour = group.prefix === "baseline" ? 9 : group.prefix === "later" ? 10 : 13;
  const minute = group.prefix === "thermal" ? 42 : group.prefix === "later" ? 2 : 14;
  return `${group.date}T${String(hour).padStart(2, "0")}:${String(minute + lane - 1).padStart(2, "0")}:00.000Z`;
}

function generateRun(group: FixtureGroup, lane: number, random: RandomSource): ScanRun {
  const dataRateGbps = 25.78;
  const sweep: SweepGeometry = {
    phase: { ...DEFAULT_SWEEP.phase },
    threshold: { ...DEFAULT_SWEEP.threshold },
    bitsTested: DEFAULT_SWEEP.bitsTested,
  };
  const condition = groupCondition(group, lane);
  const cells: ScanCell[] = [];

  for (let thresholdIndex = 0; thresholdIndex < sweep.threshold.steps; thresholdIndex += 1) {
    for (let phaseIndex = 0; phaseIndex < sweep.phase.steps; phaseIndex += 1) {
      const phasePs = axisValue(sweep.phase, phaseIndex);
      const thresholdMv = axisValue(sweep.threshold, thresholdIndex);
      const mean = trueBer(phasePs, thresholdMv, dataRateGbps, condition) * sweep.bitsTested;
      cells.push({ errors: samplePoisson(mean, random) });
    }
  }

  return {
    id: `${group.prefix}-${group.date.replaceAll("-", "")}-lane-${lane}`,
    startedAt: runStartTime(group, lane),
    operator: lane % 2 === 0 ? "Morgan Lee" : "Riley Chen",
    instrument: {
      serial: "INST-0042",
      firmware: "FW-2.4.1",
    },
    dut: {
      id: group.dutId,
      description: "QSFP28 AOC, 3 m",
    },
    lane,
    dataRateGbps,
    pattern: "PRBS31",
    temperatureC: group.temperatureC,
    ...(group.notes ? { notes: group.notes } : {}),
    synthetic: true,
    sweep,
    cells,
  };
}

/** Creates the twelve deterministic synthetic runs used by the static demo. */
export function generateSyntheticRuns(seed: number | string): ScanRun[] {
  const random = createSeededRandom(seed);
  return FIXTURE_GROUPS.flatMap((group) =>
    [1, 2, 3, 4].map((lane) => generateRun(group, lane, random)),
  );
}

export interface DerivedCell {
  observedBer: number | null;
  upperConfidenceBer: number;
  isCensored: boolean;
  displayBer: number;
}

/** Derives display and confidence values without changing the raw fixture cell. */
export function deriveCell(cell: ScanCell, bitsTested: number): DerivedCell {
  const isCensored = cell.errors === 0;
  const observedBer = isCensored ? null : cell.errors / bitsTested;

  return {
    observedBer,
    upperConfidenceBer: oneSidedUpperBer(cell.errors, bitsTested),
    isCensored,
    displayBer: isCensored ? 1 / bitsTested : cell.errors / bitsTested,
  };
}

export type ComparisonCellKind = "exact" | "below-resolution" | "bounded";
export type ComparisonBoundDirection = "improved" | "worsened" | "uncertain";

export interface ComparisonCell {
  kind: ComparisonCellKind;
  baseline: DerivedCell;
  later: DerivedCell;
  /** Later minus baseline in log10(BER); for bounded cells this is a confidence-qualified bound. */
  logBerDelta: number | null;
  boundDirection: ComparisonBoundDirection | null;
  boundMagnitude: number | null;
}

/** Compares two aligned cells without assigning an exact BER to zero observed errors. */
export function compareScanCells(
  baselineCell: ScanCell,
  laterCell: ScanCell,
  bitsTested: number,
): ComparisonCell {
  const baseline = deriveCell(baselineCell, bitsTested);
  const later = deriveCell(laterCell, bitsTested);

  if (baseline.isCensored && later.isCensored) {
    return {
      kind: "below-resolution",
      baseline,
      later,
      logBerDelta: null,
      boundDirection: null,
      boundMagnitude: null,
    };
  }

  if (!baseline.isCensored && !later.isCensored) {
    const logBerDelta = Math.log10(later.observedBer!) - Math.log10(baseline.observedBer!);
    return {
      kind: "exact",
      baseline,
      later,
      logBerDelta,
      boundDirection: null,
      boundMagnitude: null,
    };
  }

  const baselineBer = baseline.observedBer ?? baseline.upperConfidenceBer;
  const laterBer = later.observedBer ?? later.upperConfidenceBer;
  const logBerDelta = Math.log10(laterBer) - Math.log10(baselineBer);
  const boundDirection: ComparisonBoundDirection = baseline.isCensored
    ? later.observedBer! > baseline.upperConfidenceBer
      ? "worsened"
      : "uncertain"
    : baseline.observedBer! > later.upperConfidenceBer
      ? "improved"
      : "uncertain";

  return {
    kind: "bounded",
    baseline,
    later,
    logBerDelta,
    boundDirection,
    boundMagnitude: boundDirection === "uncertain" ? null : Math.abs(logBerDelta),
  };
}

export const EYE_TARGET_BER = 1e-6;
export const BER_CONFIDENCE = 0.95;

export interface EyeMetrics {
  widthPs: number;
  widthUi: number;
  heightMv: number;
  targetBer: number;
  confidence: number;
  phaseSlicePs: number;
  thresholdSliceMv: number;
}

export interface ScanMetricSource {
  sweep: SweepGeometry;
  cells: ScanCell[];
  dataRateGbps: number;
}

function nearestAxisIndex(axis: AxisSpec, target: number): number {
  let nearestIndex = 0;
  let nearestDistance = Math.abs(axisValue(axis, 0) - target);

  for (let index = 1; index < axis.steps; index += 1) {
    const distance = Math.abs(axisValue(axis, index) - target);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

function interpolateLogBerCrossing(
  firstCoordinate: number,
  firstBer: number,
  secondCoordinate: number,
  secondBer: number,
  targetBer: number,
): number {
  const firstLog = Math.log10(Math.max(firstBer, Number.MIN_VALUE));
  const secondLog = Math.log10(Math.max(secondBer, Number.MIN_VALUE));
  const targetLog = Math.log10(targetBer);
  const fraction = (targetLog - firstLog) / (secondLog - firstLog);
  return firstCoordinate + (secondCoordinate - firstCoordinate) * fraction;
}

function largestPassingSpan(
  coordinates: number[],
  confidenceBers: number[],
  targetBer: number,
): number {
  let largestSpan = 0;
  let index = 0;

  while (index < coordinates.length) {
    if (confidenceBers[index] > targetBer) {
      index += 1;
      continue;
    }

    const start = index;
    while (index + 1 < coordinates.length && confidenceBers[index + 1] <= targetBer) {
      index += 1;
    }
    const end = index;
    const leftBoundary =
      start === 0
        ? coordinates[start]
        : interpolateLogBerCrossing(
            coordinates[start - 1],
            confidenceBers[start - 1],
            coordinates[start],
            confidenceBers[start],
            targetBer,
          );
    const rightBoundary =
      end === coordinates.length - 1
        ? coordinates[end]
        : interpolateLogBerCrossing(
            coordinates[end],
            confidenceBers[end],
            coordinates[end + 1],
            confidenceBers[end + 1],
            targetBer,
          );

    largestSpan = Math.max(largestSpan, rightBoundary - leftBoundary);
    index += 1;
  }

  return largestSpan;
}

/** Calculates the fixed 95%-confidence BER eye metrics from raw scan cells. */
export function calculateEyeMetrics(source: ScanMetricSource): EyeMetrics {
  const { phase, threshold, bitsTested } = source.sweep;
  const phaseCoordinates = Array.from({ length: phase.steps }, (_, index) => axisValue(phase, index));
  const thresholdCoordinates = Array.from(
    { length: threshold.steps },
    (_, index) => axisValue(threshold, index),
  );
  const nominalThresholdIndex = nearestAxisIndex(threshold, 0);
  const nominalPhaseIndex = nearestAxisIndex(phase, 0);
  const widthBers = phaseCoordinates.map(
    (_, phaseIndex) =>
      deriveCell(source.cells[nominalThresholdIndex * phase.steps + phaseIndex], bitsTested)
        .upperConfidenceBer,
  );
  const heightBers = thresholdCoordinates.map(
    (_, thresholdIndex) =>
      deriveCell(source.cells[thresholdIndex * phase.steps + nominalPhaseIndex], bitsTested)
        .upperConfidenceBer,
  );
  const widthPs = largestPassingSpan(phaseCoordinates, widthBers, EYE_TARGET_BER);
  const heightMv = largestPassingSpan(thresholdCoordinates, heightBers, EYE_TARGET_BER);

  return {
    widthPs,
    widthUi: widthPs / (1_000 / source.dataRateGbps),
    heightMv,
    targetBer: EYE_TARGET_BER,
    confidence: BER_CONFIDENCE,
    phaseSlicePs: phaseCoordinates[nominalPhaseIndex],
    thresholdSliceMv: thresholdCoordinates[nominalThresholdIndex],
  };
}

export interface ComparisonMetrics {
  baseline: EyeMetrics;
  later: EyeMetrics;
  widthDeltaPs: number;
  widthDeltaUi: number;
  heightDeltaMv: number;
}

function sameAxis(first: AxisSpec, second: AxisSpec): boolean {
  return first.min === second.min && first.max === second.max && first.steps === second.steps;
}

/** Calculates later-minus-baseline eye-opening deltas on a shared sweep geometry. */
export function calculateComparisonMetrics(
  baseline: ScanMetricSource,
  later: ScanMetricSource,
): ComparisonMetrics {
  if (
    !sameAxis(baseline.sweep.phase, later.sweep.phase) ||
    !sameAxis(baseline.sweep.threshold, later.sweep.threshold) ||
    baseline.sweep.bitsTested !== later.sweep.bitsTested
  ) {
    throw new RangeError("Comparison runs must use the same phase, threshold, and tested-bit geometry");
  }

  const baselineMetrics = calculateEyeMetrics(baseline);
  const laterMetrics = calculateEyeMetrics(later);

  return {
    baseline: baselineMetrics,
    later: laterMetrics,
    widthDeltaPs: laterMetrics.widthPs - baselineMetrics.widthPs,
    widthDeltaUi: laterMetrics.widthUi - baselineMetrics.widthUi,
    heightDeltaMv: laterMetrics.heightMv - baselineMetrics.heightMv,
  };
}
