export const REGISTER_NAMES = [
  "r0",
  "r1",
  "r2",
  "r3",
  "r4",
  "r5",
  "r6",
  "r7",
  "r8",
  "r9",
  "r10",
  "r11",
] as const;

export type RegisterName = (typeof REGISTER_NAMES)[number];
export type Recipe = readonly number[];

export const KNOWN_TYPES = [
  "laser_up",
  "reader_wider",
  "heater_up",
  "zone_od",
  "zone_id",
] as const;

export type KnownType = (typeof KNOWN_TYPES)[number];
export type ChangeType = KnownType | "unknown_family";
export type Zone = "OD" | "ID";

export interface FirstRead {
  amp: number;
  snr: number;
  timing_error: number;
  /** First-read asymmetry; `asy` matches the ticket's public field name. */
  asy: number;
}

export interface TrainingLog {
  id: string;
  tag: string;
  split: "training";
  changeType: KnownType;
  zone: Zone;
  firstRead: FirstRead;
  finalRecipe: Recipe;
  finalBer: number;
}

export interface TestLog {
  id: string;
  tag: string;
  split: "test";
  changeType: ChangeType;
  zone: Zone;
  firstRead: FirstRead;
  finalRecipe: Recipe;
  finalBer: number;
  hiddenMask: readonly boolean[];
  hiddenTrueRecipe: Recipe;
}

export interface DemoCorpus {
  readonly trainingRows: readonly TrainingLog[];
  readonly testRows: readonly TestLog[];
}

export interface DemoModel {
  readonly corpus: DemoCorpus;
  readonly fitted: FittedModel;
  readonly evaluation: EvaluationSummary;
  fit(trainingRows: readonly TrainingLog[]): FittedModel;
  propose(fitted: FittedModel, input: ProposalInput): ProposalResult;
  inspectTestHead(rowId: string, claimedType?: ChangeType): HeadInspection;
  randomTestHead(): TestLog;
  evaluate(fitted?: FittedModel, testRows?: readonly TestLog[]): EvaluationSummary;
}

export const FULL_APPROXIMATE_SUITE_INSTRUCTION = "run the full approximate suite.";

export type ProposalReason =
  | "accepted"
  | "unsupported-label"
  | "type-disagreement"
  | "unusual-first-read";

export interface ProposalInput {
  readonly claimedType: ChangeType;
  readonly firstRead: FirstRead;
}

export interface ProposalResult {
  readonly claimedType: ChangeType;
  readonly status: "accepted" | "refused";
  readonly reason: ProposalReason;
  readonly message: string;
  readonly mappedStart: Recipe | null;
  readonly startForScoring: Recipe;
  readonly copyLast: Recipe;
  readonly sameTypeMean: Recipe | null;
  readonly skippedRegisters: readonly RegisterName[];
  readonly nearestType: KnownType | null;
  readonly firstReadDistance: number | null;
}

export interface RecipePredictor {
  readonly coefficients: readonly number[];
  readonly fallbackMean: number;
}

export interface FittedTypeModel {
  readonly type: KnownType;
  readonly learnedMask: readonly boolean[];
  readonly deviationScores: readonly number[];
  readonly sameTypeMean: Recipe;
  readonly centroid: FirstRead;
  readonly distanceThreshold: number;
  readonly predictors: readonly RecipePredictor[];
}

export interface FittedModel {
  readonly baseRecipe: Recipe;
  readonly copyLast: Recipe;
  readonly maskThreshold: number;
  readonly featureMeans: FirstRead;
  readonly featureScales: FirstRead;
  readonly types: Readonly<Record<KnownType, FittedTypeModel>>;
}

export type StrategyName = "copyLast" | "sameTypeMean" | "mappedWithFallback";

export interface StrategyScore {
  readonly l2Distance: number;
  readonly ber: number;
}

export interface HeadEvaluation {
  readonly row: TestLog;
  readonly accepted: boolean;
  readonly reason: ProposalReason;
  readonly copyLast: StrategyScore;
  readonly sameTypeMean: StrategyScore;
  readonly mappedWithFallback: StrategyScore;
  readonly final: StrategyScore;
}

export interface AggregateMetric {
  readonly count: number;
  readonly meanL2Distance: number;
  readonly meanBer: number;
  readonly perHead: readonly StrategyScore[];
}

export interface MaskMetrics {
  readonly correctCells: number;
  readonly missedMovingRegisters: number;
  readonly falsePositiveRegisters: number;
}

export interface HeadInspection {
  readonly row: TestLog;
  readonly claimedType: ChangeType;
  readonly proposal: ProposalResult;
}

export interface EvaluationSummary {
  readonly knownHeads: readonly HeadEvaluation[];
  readonly acceptedCount: number;
  readonly acceptanceRate: number;
  readonly aggregates: Readonly<Record<StrategyName, AggregateMetric>>;
  readonly maskMetrics: Readonly<Record<KnownType, MaskMetrics>>;
  readonly unknownExample: HeadInspection;
}

const FIRST_READ_KEYS = ["amp", "snr", "timing_error", "asy"] as const;

interface TypeProfile {
  readonly type: ChangeType;
  readonly zone: Zone | "mixed";
  readonly firstReadMean: FirstRead;
  readonly firstReadSpread: FirstRead;
  readonly mask: readonly number[];
  readonly offsets: readonly number[];
}

const SHARED_BASE: readonly number[] = [92, 148, 110, 64, 176, 121, 83, 201, 137, 72, 158, 104];

const TYPE_PROFILES: readonly TypeProfile[] = [
  {
    type: "laser_up",
    zone: "mixed",
    firstReadMean: { amp: 1.08, snr: 23.8, timing_error: 0.75, asy: 0.02 },
    firstReadSpread: { amp: 0.1, snr: 1.35, timing_error: 0.16, asy: 0.06 },
    mask: [0, 3, 7, 10],
    offsets: [28, 0, 0, 34, 0, 0, 0, -25, 0, 0, 22, 0],
  },
  {
    type: "reader_wider",
    zone: "mixed",
    firstReadMean: { amp: 0.99, snr: 22.9, timing_error: 1.26, asy: 0.08 },
    firstReadSpread: { amp: 0.1, snr: 1.45, timing_error: 0.18, asy: 0.06 },
    mask: [1, 4, 8],
    offsets: [0, -27, 0, 0, 25, 0, 0, 0, 31, 0, 0, 0],
  },
  {
    type: "heater_up",
    zone: "mixed",
    firstReadMean: { amp: 1.04, snr: 23.2, timing_error: 1.02, asy: 0.16 },
    firstReadSpread: { amp: 0.11, snr: 1.5, timing_error: 0.18, asy: 0.07 },
    mask: [2, 5, 9, 11],
    offsets: [0, 0, 31, 0, 0, 28, 0, 0, 0, -27, 0, 30],
  },
  {
    type: "zone_od",
    zone: "OD",
    firstReadMean: { amp: 1.14, snr: 24.55, timing_error: 0.92, asy: 0.01 },
    firstReadSpread: { amp: 0.1, snr: 1.4, timing_error: 0.17, asy: 0.06 },
    mask: [0, 4, 6, 9, 10],
    offsets: [-26, 0, 0, 0, -23, 0, 30, 0, 0, 24, -28, 0],
  },
  {
    type: "zone_id",
    zone: "ID",
    firstReadMean: { amp: 0.94, snr: 23.95, timing_error: 1.14, asy: -0.1 },
    firstReadSpread: { amp: 0.1, snr: 1.45, timing_error: 0.18, asy: 0.07 },
    mask: [1, 5, 7, 8],
    offsets: [0, 24, 0, 0, 0, -30, 0, 29, -25, 0, 0, 0],
  },
  {
    type: "unknown_family",
    zone: "mixed",
    firstReadMean: { amp: 2.8, snr: 10.2, timing_error: 5.5, asy: 0.78 },
    firstReadSpread: { amp: 0.08, snr: 0.55, timing_error: 0.3, asy: 0.04 },
    mask: [0, 2, 4, 6, 8, 11],
    offsets: [19, 0, -30, 0, 25, 0, -23, 0, 29, 0, 0, -27],
  },
];

function typeProfile(type: ChangeType): TypeProfile {
  const profile = TYPE_PROFILES.find((candidate) => candidate.type === type);

  if (!profile) {
    throw new Error(`unknown synthetic type: ${type}`);
  }

  return profile;
}

function createRandom(seed: number): () => number {
  let state = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(mean: number, standardDeviation: number, random: () => number): number {
  const first = Math.max(Number.MIN_VALUE, random());
  const second = random();
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function clipInteger(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function readValue(mean: number, spread: number, random: () => number): number {
  return sampleNormal(mean, spread, random);
}

function firstReadFor(profile: TypeProfile, random: () => number): FirstRead {
  return {
    amp: readValue(profile.firstReadMean.amp, profile.firstReadSpread.amp, random),
    snr: readValue(profile.firstReadMean.snr, profile.firstReadSpread.snr, random),
    timing_error: readValue(profile.firstReadMean.timing_error, profile.firstReadSpread.timing_error, random),
    asy: readValue(profile.firstReadMean.asy, profile.firstReadSpread.asy, random),
  };
}

function electricalSignal(firstRead: FirstRead, profile: TypeProfile): number {
  const amp = (firstRead.amp - profile.firstReadMean.amp) / profile.firstReadSpread.amp;
  const snr = (firstRead.snr - profile.firstReadMean.snr) / profile.firstReadSpread.snr;
  const timing = (firstRead.timing_error - profile.firstReadMean.timing_error) / profile.firstReadSpread.timing_error;
  const asymmetry = (firstRead.asy - profile.firstReadMean.asy) / profile.firstReadSpread.asy;

  return 0.38 * amp - 0.28 * snr + 0.2 * timing + 0.32 * asymmetry;
}

function trueRecipeFor(
  profile: TypeProfile,
  firstRead: FirstRead,
  random: () => number,
): Recipe {
  const signal = electricalSignal(firstRead, profile);

  return SHARED_BASE.map((base, register) => {
    const moves = profile.mask.includes(register);
    const electricalOffset = moves ? (7 + ((register + profile.mask.length) % 4) * 1.4) * signal : 0;
    const unpredictableVariation = sampleNormal(0, moves ? 1.8 : 1.5, random);
    return clipInteger(base + profile.offsets[register] + electricalOffset + unpredictableVariation);
  });
}

function completedRecipeFor(hiddenTrueRecipe: Recipe, random: () => number): Recipe {
  return hiddenTrueRecipe.map((value) => clipInteger(value + sampleNormal(0, 0.9, random)));
}

function l2Distance(first: Recipe, second: Recipe): number {
  return Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0));
}

export function syntheticBer(startRecipe: Recipe, hiddenTrueRecipe: Recipe): number {
  const distance = l2Distance(startRecipe, hiddenTrueRecipe);
  return 1e-6 + 0.000999 * (1 - Math.exp(-distance / 35));
}

function zoneFor(profile: TypeProfile, index: number): Zone {
  if (profile.zone !== "mixed") {
    return profile.zone;
  }

  return index % 2 === 0 ? "OD" : "ID";
}

function buildLog(
  split: "training" | "test",
  index: number,
  type: ChangeType,
  random: () => number,
): TrainingLog | TestLog {
  const profile = typeProfile(type);
  const firstRead = firstReadFor(profile, random);
  const hiddenTrueRecipe = trueRecipeFor(profile, firstRead, random);
  const finalRecipe = completedRecipeFor(hiddenTrueRecipe, random);
  const common = {
    id: `${split}-head-${String(index).padStart(3, "0")}`,
    tag: `SYN-${split === "training" ? "TR" : "TE"}-${String(index + 1).padStart(3, "0")}`,
    split,
    zone: zoneFor(profile, index),
    firstRead,
    finalRecipe,
    finalBer: syntheticBer(finalRecipe, hiddenTrueRecipe),
  } as const;

  if (split === "training") {
    return { ...common, split: "training", changeType: type as KnownType };
  }

  return {
    ...common,
    split: "test",
    changeType: type,
    hiddenMask: REGISTER_NAMES.map((_, register) => profile.mask.includes(register)),
    hiddenTrueRecipe,
  };
}

function generateCorpus(seed: number): DemoCorpus {
  const random = createRandom(seed);
  const trainingRows = Array.from({ length: 320 }, (_, index) =>
    buildLog("training", index, KNOWN_TYPES[index % KNOWN_TYPES.length], random),
  ) as TrainingLog[];
  const knownTestRows = Array.from({ length: 79 }, (_, index) =>
    buildLog("test", index, KNOWN_TYPES[(index * 3 + 1) % KNOWN_TYPES.length], random),
  ) as TestLog[];
  const unknownRow = buildLog("test", 79, "unknown_family", random) as TestLog;

  return {
    trainingRows,
    testRows: [...knownTestRows, unknownRow],
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function meanAbsoluteDeviation(values: readonly number[], center: number): number {
  return mean(values.map((value) => Math.abs(value - center)));
}

function featureVector(firstRead: FirstRead, featureMeans: FirstRead, featureScales: FirstRead): number[] {
  return FIRST_READ_KEYS.map((key) => (firstRead[key] - featureMeans[key]) / featureScales[key]);
}

function firstReadValues(rows: readonly TrainingLog[], key: (typeof FIRST_READ_KEYS)[number]): number[] {
  return rows.map((row) => row.firstRead[key]);
}

function firstReadFromValues(values: readonly number[]): FirstRead {
  return {
    amp: values[0],
    snr: values[1],
    timing_error: values[2],
    asy: values[3],
  };
}

function averageFirstRead(rows: readonly TrainingLog[]): FirstRead {
  return firstReadFromValues(FIRST_READ_KEYS.map((key) => mean(firstReadValues(rows, key))));
}

function standardDeviation(values: readonly number[], center: number): number {
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

function firstReadScales(rows: readonly TrainingLog[], center: FirstRead): FirstRead {
  return firstReadFromValues(
    FIRST_READ_KEYS.map((key) => Math.max(standardDeviation(firstReadValues(rows, key), center[key]), 0.05)),
  );
}

function recipeMean(rows: readonly TrainingLog[]): Recipe {
  return REGISTER_NAMES.map((_, register) => mean(rows.map((row) => row.finalRecipe[register])));
}

function solveLinearSystem(matrix: number[][], rightHandSide: readonly number[]): number[] | null {
  const size = rightHandSide.length;
  const augmented = matrix.map((row, rowIndex) => [...row, rightHandSide[rowIndex]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-9) {
      return null;
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    const pivot = augmented[column][column];
    for (let value = column; value <= size; value += 1) {
      augmented[column][value] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      for (let value = column; value <= size; value += 1) {
        augmented[row][value] -= factor * augmented[column][value];
      }
    }
  }

  const solution = augmented.map((row) => row[size]);
  return solution.every(Number.isFinite) ? solution : null;
}

function fitPredictor(
  rows: readonly TrainingLog[],
  register: number,
  featureMeans: FirstRead,
  featureScales: FirstRead,
  fallbackMean: number,
): RecipePredictor {
  const inputs = rows.map((row) => [1, ...featureVector(row.firstRead, featureMeans, featureScales)]);
  const hasFeatureVariation = FIRST_READ_KEYS.some((_, column) => {
    const values = inputs.map((input) => input[column + 1]);
    return Math.max(...values) - Math.min(...values) > 1e-8;
  });

  if (!hasFeatureVariation || rows.length < FIRST_READ_KEYS.length + 2) {
    return { coefficients: [], fallbackMean };
  }

  const matrix = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  const rightHandSide = Array<number>(5).fill(0);
  for (const [rowIndex, input] of inputs.entries()) {
    const target = rows[rowIndex].finalRecipe[register];
    for (let left = 0; left < input.length; left += 1) {
      rightHandSide[left] += input[left] * target;
      for (let right = 0; right < input.length; right += 1) {
        matrix[left][right] += input[left] * input[right];
      }
    }
  }

  const stabilityCheck = solveLinearSystem(
    matrix.map((row) => [...row]),
    rightHandSide,
  );
  if (!stabilityCheck) {
    return { coefficients: [], fallbackMean };
  }

  for (let diagonal = 1; diagonal < matrix.length; diagonal += 1) {
    matrix[diagonal][diagonal] += 0.02;
  }

  const regularizedCoefficients = solveLinearSystem(matrix, rightHandSide);
  return regularizedCoefficients
    ? { coefficients: regularizedCoefficients, fallbackMean }
    : { coefficients: [], fallbackMean };
}

function predict(predictor: RecipePredictor, firstRead: FirstRead, featureMeans: FirstRead, featureScales: FirstRead): number {
  if (predictor.coefficients.length === 0) {
    return predictor.fallbackMean;
  }

  const input = [1, ...featureVector(firstRead, featureMeans, featureScales)];
  const value = predictor.coefficients.reduce((sum, coefficient, index) => sum + coefficient * input[index], 0);
  return Number.isFinite(value) ? value : predictor.fallbackMean;
}

function standardizedDistance(firstRead: FirstRead, centroid: FirstRead, featureScales: FirstRead): number {
  return Math.sqrt(
    FIRST_READ_KEYS.reduce(
      (sum, key) => sum + ((firstRead[key] - centroid[key]) / featureScales[key]) ** 2,
      0,
    ),
  );
}

function quantile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

function proposalForRefusal(
  fitted: FittedModel,
  input: ProposalInput,
  reason: Exclude<ProposalReason, "accepted">,
  typeModel: FittedTypeModel | null,
  nearestType: KnownType | null,
  firstReadDistance: number | null,
  explanation: string,
): ProposalResult {
  return {
    claimedType: input.claimedType,
    status: "refused",
    reason,
    message: `Refused: ${explanation} ${FULL_APPROXIMATE_SUITE_INSTRUCTION}`,
    mappedStart: null,
    startForScoring: [...fitted.copyLast],
    copyLast: [...fitted.copyLast],
    sameTypeMean: typeModel ? [...typeModel.sameTypeMean] : null,
    skippedRegisters: [],
    nearestType,
    firstReadDistance,
  };
}

export function proposeRecipe(fitted: FittedModel, input: ProposalInput): ProposalResult {
  if (input.claimedType === "unknown_family") {
    return proposalForRefusal(
      fitted,
      input,
      "unsupported-label",
      null,
      null,
      null,
      "the claimed family is not supported by a learned map.",
    );
  }

  const typeModel = fitted.types[input.claimedType];
  const distances = KNOWN_TYPES.map((type) => ({
    type,
    distance: standardizedDistance(input.firstRead, fitted.types[type].centroid, fitted.featureScales),
  })).sort((first, second) => first.distance - second.distance);
  const nearest = distances[0];
  const claimedDistance = distances.find((candidate) => candidate.type === input.claimedType)!.distance;

  if (nearest.type !== input.claimedType) {
    return proposalForRefusal(
      fitted,
      input,
      "type-disagreement",
      typeModel,
      nearest.type,
      claimedDistance,
      `the first read is closer to ${nearest.type} than to ${input.claimedType}.`,
    );
  }

  if (claimedDistance > typeModel.distanceThreshold) {
    return proposalForRefusal(
      fitted,
      input,
      "unusual-first-read",
      typeModel,
      nearest.type,
      claimedDistance,
      `the first read is unusually far from the ${input.claimedType} training population.`,
    );
  }

  const mappedStart = REGISTER_NAMES.map((_, register) =>
    typeModel.learnedMask[register]
      ? clipInteger(predict(typeModel.predictors[register], input.firstRead, fitted.featureMeans, fitted.featureScales))
      : fitted.baseRecipe[register],
  );
  const skippedRegisters = REGISTER_NAMES.filter((_, register) => !typeModel.learnedMask[register]);

  return {
    claimedType: input.claimedType,
    status: "accepted",
    reason: "accepted",
    message:
      skippedRegisters.length > 0
        ? `Unchecked proposal: skipped ${skippedRegisters.join(", ")} use the shared base recipe.`
        : "Unchecked proposal: every register has a learned adjustment.",
    mappedStart,
    startForScoring: [...mappedStart],
    copyLast: [...fitted.copyLast],
    sameTypeMean: [...typeModel.sameTypeMean],
    skippedRegisters,
    nearestType: nearest.type,
    firstReadDistance: claimedDistance,
  };
}

function isKnownTestRow(row: TestLog): row is TestLog & { changeType: KnownType } {
  return row.changeType !== "unknown_family";
}

function scoreRecipe(startRecipe: Recipe, row: TestLog): StrategyScore {
  return {
    l2Distance: l2Distance(startRecipe, row.hiddenTrueRecipe),
    ber: syntheticBer(startRecipe, row.hiddenTrueRecipe),
  };
}

function averageScore(scores: readonly StrategyScore[]): StrategyScore {
  return {
    l2Distance: mean(scores.map((score) => score.l2Distance)),
    ber: mean(scores.map((score) => score.ber)),
  };
}

function evaluateCorpus(fitted: FittedModel, corpus: DemoCorpus): EvaluationSummary {
  const knownRows = corpus.testRows.filter(isKnownTestRow);
  const knownHeads = knownRows.map((row) => {
    const proposal = proposeRecipe(fitted, {
      claimedType: row.changeType,
      firstRead: row.firstRead,
    });
    const sameTypeMean = proposal.sameTypeMean;
    if (!sameTypeMean) {
      throw new Error(`missing same-type mean for ${row.changeType}`);
    }

    return {
      row,
      accepted: proposal.status === "accepted",
      reason: proposal.reason,
      copyLast: scoreRecipe(proposal.copyLast, row),
      sameTypeMean: scoreRecipe(sameTypeMean, row),
      mappedWithFallback: scoreRecipe(proposal.startForScoring, row),
      final: scoreRecipe(row.finalRecipe, row),
    } satisfies HeadEvaluation;
  });

  const aggregate = (strategy: StrategyName): AggregateMetric => {
    const perHead = knownHeads.map((head) => head[strategy]);
    const average = averageScore(perHead);
    return {
      count: perHead.length,
      meanL2Distance: average.l2Distance,
      meanBer: average.ber,
      perHead,
    };
  };

  const maskMetrics = {} as Record<KnownType, MaskMetrics>;
  for (const type of KNOWN_TYPES) {
    const heldOut = knownRows.find((row) => row.changeType === type)!;
    const learnedMask = fitted.types[type].learnedMask;
    const hiddenMask = heldOut.hiddenMask;
    maskMetrics[type] = {
      correctCells: learnedMask.filter((moving, register) => moving === hiddenMask[register]).length,
      missedMovingRegisters: hiddenMask.filter((moving, register) => moving && !learnedMask[register]).length,
      falsePositiveRegisters: learnedMask.filter((moving, register) => moving && !hiddenMask[register]).length,
    };
  }

  const unknownRow = corpus.testRows.find((row) => row.changeType === "unknown_family");
  if (!unknownRow) {
    throw new Error("unknown-family example is missing");
  }

  const unknownExample: HeadInspection = {
    row: unknownRow,
    claimedType: unknownRow.changeType,
    proposal: proposeRecipe(fitted, {
      claimedType: unknownRow.changeType,
      firstRead: unknownRow.firstRead,
    }),
  };

  return {
    knownHeads,
    acceptedCount: knownHeads.filter((head) => head.accepted).length,
    acceptanceRate: knownHeads.length === 0 ? 0 : knownHeads.filter((head) => head.accepted).length / knownHeads.length,
    aggregates: {
      copyLast: aggregate("copyLast"),
      sameTypeMean: aggregate("sameTypeMean"),
      mappedWithFallback: aggregate("mappedWithFallback"),
    },
    maskMetrics,
    unknownExample,
  };
}

export function fitTrainingLogs(trainingRows: readonly TrainingLog[]): FittedModel {
  if (trainingRows.length === 0) {
    throw new Error("at least one training row is required");
  }

  const featureMeans = averageFirstRead(trainingRows);
  const featureScales = firstReadScales(trainingRows, featureMeans);
  const baseRecipe = REGISTER_NAMES.map((_, register) =>
    clipInteger(median(trainingRows.map((row) => row.finalRecipe[register]))),
  );
  const scoresByType = {} as Record<KnownType, number[]>;
  const rowsByType = {} as Record<KnownType, TrainingLog[]>;

  for (const type of KNOWN_TYPES) {
    const rows = trainingRows.filter((row) => row.changeType === type);
    rowsByType[type] = rows;
    scoresByType[type] = REGISTER_NAMES.map((_, register) =>
      mean(rows.map((row) => Math.abs(row.finalRecipe[register] - baseRecipe[register]))),
    );
  }

  const allScores = KNOWN_TYPES.flatMap((type) => scoresByType[type]);
  const scoreCenter = median(allScores);
  const maskThreshold = Math.max(5, scoreCenter + 3 * meanAbsoluteDeviation(allScores, scoreCenter));
  const types = {} as Record<KnownType, FittedTypeModel>;

  for (const type of KNOWN_TYPES) {
    const rows = rowsByType[type];
    const scores = scoresByType[type];
    const learnedMask = scores.map((score) => score > maskThreshold);
    const sameTypeMean = recipeMean(rows);
    const centroid = averageFirstRead(rows);
    const distances = rows.map((row) => standardizedDistance(row.firstRead, centroid, featureScales));
    const predictors = REGISTER_NAMES.map((_, register) =>
      fitPredictor(rows, register, featureMeans, featureScales, sameTypeMean[register]),
    );
    types[type] = {
      type,
      learnedMask,
      deviationScores: scores,
      sameTypeMean,
      centroid,
      distanceThreshold: Math.max(2.5, quantile(distances, 0.98) + 0.35),
      predictors,
    };

  }

  return {
    baseRecipe,
    copyLast: [...trainingRows[trainingRows.length - 1].finalRecipe],
    maskThreshold,
    featureMeans,
    featureScales,
    types,
  };
}

export function createDemoModel(seed = 0): DemoModel {
  const corpus = generateCorpus(seed);
  const fitted = fitTrainingLogs(corpus.trainingRows);
  const random = createRandom(seed ^ 0x51ed270b);
  const evaluate = (candidate = fitted, testRows = corpus.testRows): EvaluationSummary =>
    evaluateCorpus(candidate, { trainingRows: corpus.trainingRows, testRows });
  const inspectTestHead = (rowId: string, claimedType?: ChangeType): HeadInspection => {
    const row = corpus.testRows.find((candidate) => candidate.id === rowId);
    if (!row) {
      throw new Error(`unknown test head: ${rowId}`);
    }

    const selectedType = claimedType ?? row.changeType;
    return {
      row,
      claimedType: selectedType,
      proposal: proposeRecipe(fitted, { claimedType: selectedType, firstRead: row.firstRead }),
    };
  };

  const model: DemoModel = {
    corpus,
    fitted,
    evaluation: evaluate(),
    fit: fitTrainingLogs,
    propose: proposeRecipe,
    inspectTestHead,
    randomTestHead: () => corpus.testRows[Math.floor(random() * corpus.testRows.length)],
    evaluate,
  };

  return model;
}
