import { createSeededRandom, type RandomSource } from "./scan-model";

/**
 * The diagnosis surface asks a different question from the scan surfaces. A scan
 * says how open the eye is; a diagnosis says why it closed. Nothing in the
 * instrument answers that. The answer is learned from failures an engineer
 * already resolved and wrote a cause on, which is why this file is mostly about
 * a corpus of labelled examples and only a little about a classifier.
 *
 * Every number the diagnosis pages show is derived from that corpus when the
 * page loads. The fixture stores the examples, not the results.
 */

/**
 * The measured quantities a diagnosis is drawn from. Each one is something a
 * BERT-plus-scope test station can already produce for a link under test; the
 * model never sees the cause, only these ten numbers.
 */
export const DIAGNOSIS_FEATURES = [
  {
    key: "eyeWidthUi",
    label: "Eye width",
    unit: "UI",
    digits: 3,
    description: "Horizontal opening at the 1e-6 contour, in unit intervals.",
  },
  {
    key: "eyeHeightMv",
    label: "Eye height",
    unit: "mV",
    digits: 0,
    description: "Vertical opening at the 1e-6 contour.",
  },
  {
    key: "randomJitterPs",
    label: "Random jitter",
    unit: "ps",
    digits: 2,
    description: "Gaussian jitter component, RMS, from the bathtub fit.",
  },
  {
    key: "deterministicJitterPs",
    label: "Deterministic jitter",
    unit: "ps",
    digits: 2,
    description: "Bounded jitter component, peak to peak.",
  },
  {
    key: "noiseSigmaMv",
    label: "Amplitude noise",
    unit: "mV",
    digits: 2,
    description: "Vertical noise sigma at the sampling instant.",
  },
  {
    key: "verticalAsymmetryMv",
    label: "Eye asymmetry",
    unit: "mV",
    digits: 2,
    description: "Offset between the upper and lower eye halves.",
  },
  {
    key: "aggressorCorrelation",
    label: "Aggressor correlation",
    unit: "",
    digits: 3,
    description: "Correlation between this lane's errors and adjacent-lane activity.",
  },
  {
    key: "returnLossDb",
    label: "Return loss",
    unit: "dB",
    digits: 2,
    description: "Worst in-band return loss magnitude. Lower is worse.",
  },
  {
    key: "lossSlopeDbPerGhz",
    label: "Loss slope",
    unit: "dB/GHz",
    digits: 3,
    description: "Insertion-loss gradient across the band.",
  },
  {
    key: "thermalSensitivityMvPerC",
    label: "Thermal sensitivity",
    unit: "mV/°C",
    digits: 3,
    description: "Change in eye height per degree of ambient rise.",
  },
] as const;

export type FeatureKey = (typeof DIAGNOSIS_FEATURES)[number]["key"];
export type FeatureVector = Record<FeatureKey, number>;
export type FeatureSpec = (typeof DIAGNOSIS_FEATURES)[number];

export function featureSpec(key: FeatureKey): FeatureSpec {
  const found = DIAGNOSIS_FEATURES.find((feature) => feature.key === key);

  if (!found) {
    throw new Error(`unknown feature: ${key}`);
  }

  return found;
}

/**
 * The label set. These are causes an engineer can act on: a cause that does not
 * change what somebody does next is not worth predicting.
 */
export const DIAGNOSIS_CAUSES = [
  {
    id: "crosstalk",
    label: "Adjacent-lane crosstalk",
    short: "Crosstalk",
    signature:
      "Errors track neighbouring-lane activity; bounded jitter rises while return loss stays clean.",
    action: "Reroute or shield the offending pair, then retest with the aggressors quiet.",
  },
  {
    id: "connector-crimp",
    label: "Bad connector crimp",
    short: "Bad crimp",
    signature:
      "A near-end impedance discontinuity: return loss collapses and the eye goes lopsided.",
    action: "Re-terminate the connector and retest the same cable.",
  },
  {
    id: "insertion-loss",
    label: "Excess insertion loss",
    short: "Insertion loss",
    signature:
      "Loss climbs steeply with frequency; the eye closes vertically before it closes horizontally.",
    action: "Shorten the run, move to a lower-gauge cable, or enable more equalisation.",
  },
  {
    id: "reflection",
    label: "Impedance reflection",
    short: "Reflection",
    signature:
      "Return loss degraded with only mild asymmetry: energy returning from mid-channel.",
    action: "Sweep the channel for the discontinuity before replacing the connector.",
  },
  {
    id: "thermal-drift",
    label: "Thermal drift",
    short: "Thermal",
    signature: "Margin tracks ambient temperature, and amplitude noise rises with it.",
    action: "Re-run at a controlled ambient before condemning the link.",
  },
  {
    id: "clock-jitter",
    label: "Reference clock jitter",
    short: "Clock jitter",
    signature:
      "Random jitter dominates: the eye narrows horizontally while its height holds up.",
    action: "Check the reference clock and its supply rail before touching the cable.",
  },
  {
    id: "equaliser-preset",
    label: "Wrong equaliser preset",
    short: "EQ preset",
    signature: "Over-equalised: the eye narrows without the loss profile that would justify it.",
    action: "Re-run the link training and compare against the preset table for this reach.",
  },
  {
    id: "contact-contamination",
    label: "Contact contamination",
    short: "Contamination",
    signature: "Height and noise degrade together while the loss profile stays ordinary.",
    action: "Clean and reseat both ends before any electrical investigation.",
  },
  {
    id: "common-mode-offset",
    label: "Common-mode offset",
    short: "Common mode",
    signature: "Strong eye asymmetry with return loss intact, which is what separates it from a crimp.",
    action: "Check the ground path and the receiver's common-mode range.",
  },
  {
    id: "supply-noise",
    label: "Supply rail noise",
    short: "Supply noise",
    signature: "Amplitude noise dominates at a normal ambient, so it is not thermal.",
    action: "Scope the rail at the receiver before returning the cable.",
  },
] as const;

export type CauseId = (typeof DIAGNOSIS_CAUSES)[number]["id"];
export type CauseSpec = (typeof DIAGNOSIS_CAUSES)[number];

export function causeSpec(id: CauseId): CauseSpec {
  const found = DIAGNOSIS_CAUSES.find((cause) => cause.id === id);

  if (!found) {
    throw new Error(`unknown cause: ${id}`);
  }

  return found;
}

/**
 * How a case is used. The split is a property of the stored example, not a
 * runtime shuffle, so every reader of this fixture fits the same model.
 *
 * - `training` fits the class statistics;
 * - `calibration` fits the confidence temperature and nothing else;
 * - `holdout` is never fitted on, and every accuracy figure comes from it;
 * - `pending` has no confirmed cause yet. It is the review queue.
 */
export type CaseSplit = "training" | "calibration" | "holdout" | "pending";

export interface DiagnosisCase {
  id: string;
  recordedAt: string;
  site: string;
  dut: string;
  lane: number;
  cable: string;
  ambientC: number;
  features: FeatureVector;
  split: CaseSplit;
  /** The engineer's resolved cause. Absent while the case is still pending. */
  confirmedCause?: CauseId;
  /** Who resolved it, and the sentence they wrote when they did. */
  resolvedBy?: string;
  resolutionNote?: string;
  /** Working days between the failure being seen and its cause being written down. */
  daysToLabel?: number;
}

interface CauseProfile {
  id: CauseId;
  prevalence: number;
  means: FeatureVector;
  deviations: FeatureVector;
  /** The cause this one is mistaken for, both by the model and by people. */
  confusedWith: CauseId;
  notes: readonly string[];
}

/**
 * The generator's physics, kept deliberately overlapping. A corpus where every
 * cause separates cleanly would make the classifier look better than any real
 * one is: bad crimps and reflections share a collapsed return loss here, and the
 * model has to tell them apart on asymmetry and bounded jitter alone.
 */
const CAUSE_PROFILES: readonly CauseProfile[] = [
  {
    id: "crosstalk",
    confusedWith: "reflection",
    prevalence: 0.185,
    means: {
      eyeWidthUi: 0.5,
      eyeHeightMv: 138,
      randomJitterPs: 1.1,
      deterministicJitterPs: 6.8,
      noiseSigmaMv: 8,
      verticalAsymmetryMv: 2.6,
      aggressorCorrelation: 0.71,
      returnLossDb: 16.5,
      lossSlopeDbPerGhz: 0.6,
      thermalSensitivityMvPerC: 0.4,
    },
    deviations: {
      eyeWidthUi: 0.03,
      eyeHeightMv: 10,
      randomJitterPs: 0.15,
      deterministicJitterPs: 1,
      noiseSigmaMv: 0.9,
      verticalAsymmetryMv: 1,
      aggressorCorrelation: 0.1,
      returnLossDb: 1.5,
      lossSlopeDbPerGhz: 0.1,
      thermalSensitivityMvPerC: 0.1,
    },
    notes: [
      "Errors stopped when the adjacent pair was parked. Rerouted away from the aggressor.",
      "Confirmed by quieting lanes 2 and 4: margin returned. Shielded the bundle.",
      "Aggressor was the neighbouring transmit pair in the same bundle. Re-dressed the harness.",
    ],
  },
  {
    id: "connector-crimp",
    confusedWith: "reflection",
    prevalence: 0.2,
    means: {
      eyeWidthUi: 0.49,
      eyeHeightMv: 132,
      randomJitterPs: 1,
      deterministicJitterPs: 6.2,
      noiseSigmaMv: 8.5,
      verticalAsymmetryMv: 11.5,
      aggressorCorrelation: 0.11,
      returnLossDb: 7.5,
      lossSlopeDbPerGhz: 0.75,
      thermalSensitivityMvPerC: 0.45,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.15,
      deterministicJitterPs: 1.2,
      noiseSigmaMv: 1.2,
      verticalAsymmetryMv: 2.5,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.6,
      lossSlopeDbPerGhz: 0.15,
      thermalSensitivityMvPerC: 0.12,
    },
    notes: [
      "Re-terminated the near-end connector. The same cable passed on retest.",
      "Crimp had one strand outside the barrel. Redone, margin recovered.",
      "TDR put the discontinuity 40 mm from the plug. Bad crimp confirmed on teardown.",
      "Field crimp with the wrong die size. Replaced the connector.",
    ],
  },
  {
    id: "insertion-loss",
    confusedWith: "thermal-drift",
    prevalence: 0.135,
    means: {
      eyeWidthUi: 0.47,
      eyeHeightMv: 118,
      randomJitterPs: 1.05,
      deterministicJitterPs: 4.6,
      noiseSigmaMv: 9.5,
      verticalAsymmetryMv: 3,
      aggressorCorrelation: 0.1,
      returnLossDb: 15.5,
      lossSlopeDbPerGhz: 1.95,
      thermalSensitivityMvPerC: 0.5,
    },
    deviations: {
      eyeWidthUi: 0.03,
      eyeHeightMv: 10,
      randomJitterPs: 0.15,
      deterministicJitterPs: 0.9,
      noiseSigmaMv: 1,
      verticalAsymmetryMv: 1.2,
      aggressorCorrelation: 0.05,
      returnLossDb: 2,
      lossSlopeDbPerGhz: 0.25,
      thermalSensitivityMvPerC: 0.12,
    },
    notes: [
      "Cable was two metres longer than the build sheet. The shorter run passed.",
      "28 AWG on a reach that needs 26. Swapped the assembly.",
      "Loss budget exceeded at the top of the band. Enabled the deeper equaliser preset.",
    ],
  },
  {
    id: "reflection",
    confusedWith: "connector-crimp",
    prevalence: 0.118,
    means: {
      eyeWidthUi: 0.48,
      eyeHeightMv: 134,
      randomJitterPs: 1.05,
      deterministicJitterPs: 7.6,
      noiseSigmaMv: 8,
      verticalAsymmetryMv: 5.5,
      aggressorCorrelation: 0.12,
      returnLossDb: 9.5,
      lossSlopeDbPerGhz: 1.05,
      thermalSensitivityMvPerC: 0.42,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.15,
      deterministicJitterPs: 1.2,
      noiseSigmaMv: 1,
      verticalAsymmetryMv: 2,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.8,
      lossSlopeDbPerGhz: 0.2,
      thermalSensitivityMvPerC: 0.1,
    },
    notes: [
      "Discontinuity mid-channel, not at either plug. Backplane via stub.",
      "Reflection from an unpopulated mid-board connector. The cable was fine.",
      "Periodic return-loss suckout at 6 GHz. Traced to the paddle-card transition.",
    ],
  },
  {
    id: "thermal-drift",
    confusedWith: "insertion-loss",
    prevalence: 0.126,
    means: {
      eyeWidthUi: 0.52,
      eyeHeightMv: 128,
      randomJitterPs: 1.2,
      deterministicJitterPs: 4.2,
      noiseSigmaMv: 11.5,
      verticalAsymmetryMv: 3.5,
      aggressorCorrelation: 0.1,
      returnLossDb: 17,
      lossSlopeDbPerGhz: 0.8,
      thermalSensitivityMvPerC: 1.9,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.2,
      deterministicJitterPs: 0.9,
      noiseSigmaMv: 1.4,
      verticalAsymmetryMv: 1.4,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.5,
      lossSlopeDbPerGhz: 0.15,
      thermalSensitivityMvPerC: 0.3,
    },
    notes: [
      "Margin tracked the chamber ramp. The link is fine at 25 °C.",
      "Airflow blocked by the adjacent card. Cleared it and retested.",
      "Failure only above 60 °C ambient. Not a cable fault.",
    ],
  },
  {
    id: "clock-jitter",
    confusedWith: "crosstalk",
    prevalence: 0.076,
    means: {
      eyeWidthUi: 0.41,
      eyeHeightMv: 152,
      randomJitterPs: 3.4,
      deterministicJitterPs: 5,
      noiseSigmaMv: 7,
      verticalAsymmetryMv: 2.4,
      aggressorCorrelation: 0.09,
      returnLossDb: 17.5,
      lossSlopeDbPerGhz: 0.6,
      thermalSensitivityMvPerC: 0.35,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.5,
      deterministicJitterPs: 1,
      noiseSigmaMv: 1,
      verticalAsymmetryMv: 1,
      aggressorCorrelation: 0.04,
      returnLossDb: 1.5,
      lossSlopeDbPerGhz: 0.12,
      thermalSensitivityMvPerC: 0.1,
    },
    notes: [
      "Reference oscillator supply rail was noisy. A cable swap changed nothing.",
      "Random jitter dominant; the same cable passed in a different chassis.",
      "Traced to the PLL loop filter on the host card.",
    ],
  },
  {
    id: "equaliser-preset",
    confusedWith: "clock-jitter",
    prevalence: 0.05,
    means: {
      eyeWidthUi: 0.46,
      eyeHeightMv: 145,
      randomJitterPs: 1.3,
      deterministicJitterPs: 5.5,
      noiseSigmaMv: 9,
      verticalAsymmetryMv: 4,
      aggressorCorrelation: 0.1,
      returnLossDb: 17,
      lossSlopeDbPerGhz: 0.65,
      thermalSensitivityMvPerC: 0.4,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.2,
      deterministicJitterPs: 1,
      noiseSigmaMv: 1.1,
      verticalAsymmetryMv: 1.3,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.5,
      lossSlopeDbPerGhz: 0.12,
      thermalSensitivityMvPerC: 0.1,
    },
    notes: [
      "Host had the long-reach preset on a 1 m cable. Retrained, margin returned.",
      "Over-equalised: the loss profile never justified that much boost.",
      "Preset table on the switch firmware was stale after the update.",
    ],
  },
  {
    id: "contact-contamination",
    confusedWith: "connector-crimp",
    prevalence: 0.04,
    means: {
      eyeWidthUi: 0.53,
      eyeHeightMv: 120,
      randomJitterPs: 1.1,
      deterministicJitterPs: 4.8,
      noiseSigmaMv: 10.5,
      verticalAsymmetryMv: 6.5,
      aggressorCorrelation: 0.1,
      returnLossDb: 13,
      lossSlopeDbPerGhz: 0.9,
      thermalSensitivityMvPerC: 0.5,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.18,
      deterministicJitterPs: 1,
      noiseSigmaMv: 1.3,
      verticalAsymmetryMv: 1.8,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.8,
      lossSlopeDbPerGhz: 0.15,
      thermalSensitivityMvPerC: 0.12,
    },
    notes: [
      "Cleaned and reseated both ends. Passed without any rework.",
      "Debris on the contacts from the cable tray. No fault in the assembly.",
      "Reseating alone recovered the margin. Logged as contamination, not a crimp.",
    ],
  },
  {
    id: "common-mode-offset",
    confusedWith: "connector-crimp",
    prevalence: 0.04,
    means: {
      eyeWidthUi: 0.53,
      eyeHeightMv: 140,
      randomJitterPs: 1,
      deterministicJitterPs: 4.5,
      noiseSigmaMv: 9.5,
      verticalAsymmetryMv: 13,
      aggressorCorrelation: 0.1,
      returnLossDb: 16.5,
      lossSlopeDbPerGhz: 0.65,
      thermalSensitivityMvPerC: 0.45,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.15,
      deterministicJitterPs: 1,
      noiseSigmaMv: 1.2,
      verticalAsymmetryMv: 2.2,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.5,
      lossSlopeDbPerGhz: 0.12,
      thermalSensitivityMvPerC: 0.12,
    },
    notes: [
      "Chassis ground offset between the two racks. Return loss was clean throughout.",
      "Receiver common-mode range exceeded. Not a cable fault.",
      "Bonded the racks and the asymmetry went away.",
    ],
  },
  {
    id: "supply-noise",
    confusedWith: "thermal-drift",
    prevalence: 0.03,
    means: {
      eyeWidthUi: 0.49,
      eyeHeightMv: 122,
      randomJitterPs: 1.9,
      deterministicJitterPs: 4.4,
      noiseSigmaMv: 14.5,
      verticalAsymmetryMv: 3.2,
      aggressorCorrelation: 0.1,
      returnLossDb: 17.2,
      lossSlopeDbPerGhz: 0.62,
      thermalSensitivityMvPerC: 0.6,
    },
    deviations: {
      eyeWidthUi: 0.04,
      eyeHeightMv: 12,
      randomJitterPs: 0.3,
      deterministicJitterPs: 0.9,
      noiseSigmaMv: 1.6,
      verticalAsymmetryMv: 1.2,
      aggressorCorrelation: 0.05,
      returnLossDb: 1.5,
      lossSlopeDbPerGhz: 0.12,
      thermalSensitivityMvPerC: 0.15,
    },
    notes: [
      "Rail noise at the receiver, at a normal ambient. Nothing thermal about it.",
      "Switching regulator ripple coupled into the serdes supply.",
      "Same cable, quiet chassis, full margin. Logged against the supply.",
    ],
  },
];

const SITES = ["Fremont line 2", "Penang line 1", "Guadalajara line 4", "Fremont lab"] as const;
const CABLES = [
  "DAC 26AWG 1.0 m",
  "DAC 26AWG 2.0 m",
  "DAC 28AWG 3.0 m",
  "DAC 30AWG 3.0 m",
  "AOC 5.0 m",
  "AOC 10.0 m",
] as const;
const ENGINEERS = ["R. Okafor", "M. Delgado", "S. Whitfield", "J. Park", "A. Lindqvist"] as const;

/** Box-Muller, so the class-conditional spread is a real Gaussian rather than a ramp. */
function sampleNormal(mean: number, deviation: number, random: RandomSource): number {
  const first = Math.max(Number.MIN_VALUE, random());
  const second = random();
  const standard = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);

  return mean + deviation * standard;
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function sampleCause(random: RandomSource): CauseProfile {
  const draw = random();
  let cumulative = 0;

  for (const profile of CAUSE_PROFILES) {
    cumulative += profile.prevalence;
    if (draw <= cumulative) {
      return profile;
    }
  }

  return CAUSE_PROFILES[CAUSE_PROFILES.length - 1];
}

function profileFor(id: CauseId): CauseProfile {
  const found = CAUSE_PROFILES.find((profile) => profile.id === id);

  if (!found) {
    throw new Error(`unknown cause profile: ${id}`);
  }

  return found;
}

/**
 * Three things stop this corpus from being separable by inspection, and all
 * three are things a real one has.
 *
 * `SECONDARY_CAUSE_SHARE` is contamination: a link rarely fails for exactly one
 * reason, so some of these cases carry a second cause's signature mixed into the
 * first one's. `CONFOUND_*` are nuisance variables: a long thin cable in a hot
 * rack looks lossy whatever is actually wrong with it, so cable and ambient move
 * the same features the causes move. `LABEL_ERROR_RATE` is the human floor: some
 * of these cases have the wrong cause written on them, and no model trained on
 * them can be more right than the people who labelled them.
 */
const SECONDARY_CAUSE_PROBABILITY = 0.42;
const SECONDARY_CAUSE_SHARE = 0.34;
const SPREAD_MULTIPLIER = 1.9;
const LABEL_ERROR_RATE = 0.06;

interface Confounds {
  cableIndex: number;
  ambientC: number;
}

function applyConfounds(features: FeatureVector, confounds: Confounds): void {
  const reach = confounds.cableIndex;
  const heat = Math.max(0, confounds.ambientC - 25);

  features.lossSlopeDbPerGhz += 0.11 * reach;
  features.returnLossDb -= 0.35 * reach;
  features.eyeHeightMv -= 2.6 * reach + 0.22 * heat;
  features.eyeWidthUi -= 0.004 * reach;
  features.noiseSigmaMv += 0.035 * heat;
  features.thermalSensitivityMvPerC += 0.006 * heat;
}

function sampleFeatures(
  profile: CauseProfile,
  confounds: Confounds,
  random: RandomSource,
): FeatureVector {
  const secondary =
    random() < SECONDARY_CAUSE_PROBABILITY ? profileFor(profile.confusedWith) : undefined;
  const features = {} as FeatureVector;

  for (const feature of DIAGNOSIS_FEATURES) {
    const share = secondary ? SECONDARY_CAUSE_SHARE : 0;
    const mean =
      profile.means[feature.key] * (1 - share) + (secondary?.means[feature.key] ?? 0) * share;
    const deviation = profile.deviations[feature.key] * SPREAD_MULTIPLIER;

    features[feature.key] = sampleNormal(mean, deviation, random);
  }

  applyConfounds(features, confounds);

  for (const feature of DIAGNOSIS_FEATURES) {
    const bounded =
      feature.key === "aggressorCorrelation"
        ? Math.min(0.99, Math.max(0, features[feature.key]))
        : Math.max(0, features[feature.key]);

    features[feature.key] = Number(bounded.toFixed(feature.digits + 1));
  }

  return features;
}

const CORPUS_SIZE = 640;
const PENDING_SIZE = 42;
const CORPUS_START_MS = Date.UTC(2025, 2, 3);
const CORPUS_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The split pattern. Twenty consecutive cases give twelve training, three
 * calibration and five holdout: a 60/15/25 split that does not depend on the
 * corpus size and does not move when a case is added.
 */
function splitForIndex(index: number): Exclude<CaseSplit, "pending"> {
  const position = index % 20;

  if (position < 12) {
    return "training";
  }

  return position < 15 ? "calibration" : "holdout";
}

export function generateDiagnosisCorpus(seed: number | string): DiagnosisCase[] {
  const random = createSeededRandom(seed);
  const cases: DiagnosisCase[] = [];

  for (let index = 0; index < CORPUS_SIZE + PENDING_SIZE; index += 1) {
    const isPending = index >= CORPUS_SIZE;
    const profile = sampleCause(random);
    const recordedAt = new Date(
      CORPUS_START_MS + Math.floor(index * 1.35 + random() * 2) * CORPUS_DAY_MS,
    ).toISOString();
    const cableIndex = Math.min(CABLES.length - 1, Math.floor(random() * CABLES.length));
    const ambientC = 25 + Math.round(random() * 45);

    const base: DiagnosisCase = {
      id: `case-${String(index + 1).padStart(4, "0")}`,
      recordedAt,
      site: pick(SITES, random),
      dut: `DUT-${4000 + Math.floor(random() * 1800)}`,
      lane: 1 + Math.floor(random() * 4),
      cable: CABLES[cableIndex],
      ambientC,
      features: sampleFeatures(profile, { cableIndex, ambientC }, random),
      split: isPending ? "pending" : splitForIndex(index),
    };

    /** What the engineer wrote down, which is not always what was wrong. */
    const recordedProfile =
      random() < LABEL_ERROR_RATE ? profileFor(profile.confusedWith) : profile;

    cases.push(
      isPending
        ? base
        : {
            ...base,
            confirmedCause: recordedProfile.id,
            resolvedBy: pick(ENGINEERS, random),
            resolutionNote: pick(recordedProfile.notes, random),
            daysToLabel: 1 + Math.floor(random() * 12),
          },
    );
  }

  return cases;
}

/**
 * A Gaussian naive Bayes classifier: one mean and one variance per feature per
 * cause, plus the class prior. It is chosen for being auditable rather than for
 * being strong. Every number in it reads back to the engineer as "these are the
 * cases you labelled," and the per-feature evidence the pages show is the
 * model's own arithmetic rather than a post-hoc story about a black box.
 */
export interface ClassStatistics {
  cause: CauseId;
  prior: number;
  count: number;
  means: FeatureVector;
  variances: FeatureVector;
}

export interface Classifier {
  classes: ClassStatistics[];
  trainingSize: number;
  /** Softmax temperature fitted on the calibration split. 1 means uncalibrated. */
  temperature: number;
}

/** Keeps a class that happens to be tight on one feature from dominating on it. */
const VARIANCE_FLOOR = 1e-6;

export function fitClassifier(trainingCases: readonly DiagnosisCase[]): Classifier {
  const classes: ClassStatistics[] = [];

  for (const cause of DIAGNOSIS_CAUSES) {
    const members = trainingCases.filter((item) => item.confirmedCause === cause.id);

    if (members.length < 2) {
      continue;
    }

    const means = {} as FeatureVector;
    const variances = {} as FeatureVector;

    for (const feature of DIAGNOSIS_FEATURES) {
      const values = members.map((item) => item.features[feature.key]);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);

      means[feature.key] = mean;
      variances[feature.key] = Math.max(VARIANCE_FLOOR, variance);
    }

    classes.push({
      cause: cause.id,
      prior: members.length / trainingCases.length,
      count: members.length,
      means,
      variances,
    });
  }

  return { classes, trainingSize: trainingCases.length, temperature: 1 };
}

/** Log density of one feature under one class. */
function featureLogLikelihood(value: number, mean: number, variance: number): number {
  return -0.5 * Math.log(2 * Math.PI * variance) - (value - mean) ** 2 / (2 * variance);
}

function classLogScore(statistics: ClassStatistics, features: FeatureVector): number {
  let score = Math.log(statistics.prior);

  for (const feature of DIAGNOSIS_FEATURES) {
    score += featureLogLikelihood(
      features[feature.key],
      statistics.means[feature.key],
      statistics.variances[feature.key],
    );
  }

  return score;
}

function softmax(scores: readonly number[], temperature: number): number[] {
  const scaled = scores.map((score) => score / temperature);
  const highest = Math.max(...scaled);
  const exponentials = scaled.map((score) => Math.exp(score - highest));
  const total = exponentials.reduce((sum, value) => sum + value, 0);

  return exponentials.map((value) => value / total);
}

export interface CauseProbability {
  cause: CauseId;
  probability: number;
}

export interface FeatureEvidence {
  feature: FeatureKey;
  /** Log-odds this feature adds to the leading cause against the runner-up. */
  contribution: number;
  value: number;
  leadingMean: number;
  runnerUpMean: number;
}

export interface Diagnosis {
  ranked: CauseProbability[];
  leading: CauseId;
  confidence: number;
  runnerUp: CauseId | null;
  evidence: FeatureEvidence[];
}

export function diagnose(classifier: Classifier, features: FeatureVector): Diagnosis {
  const scores = classifier.classes.map((statistics) => classLogScore(statistics, features));
  const probabilities = softmax(scores, classifier.temperature);
  const ranked = classifier.classes
    .map((statistics, index) => ({ cause: statistics.cause, probability: probabilities[index] }))
    .sort((first, second) => second.probability - first.probability);

  const leading = classifier.classes.find((statistics) => statistics.cause === ranked[0].cause)!;
  const runnerUp = ranked[1]
    ? classifier.classes.find((statistics) => statistics.cause === ranked[1].cause) ?? null
    : null;

  const evidence = DIAGNOSIS_FEATURES.map((feature) => {
    const value = features[feature.key];
    const leadingLikelihood = featureLogLikelihood(
      value,
      leading.means[feature.key],
      leading.variances[feature.key],
    );
    const runnerUpLikelihood = runnerUp
      ? featureLogLikelihood(value, runnerUp.means[feature.key], runnerUp.variances[feature.key])
      : 0;

    return {
      feature: feature.key,
      contribution: (leadingLikelihood - runnerUpLikelihood) / classifier.temperature,
      value,
      leadingMean: leading.means[feature.key],
      runnerUpMean: runnerUp ? runnerUp.means[feature.key] : leading.means[feature.key],
    };
  }).sort((first, second) => second.contribution - first.contribution);

  return {
    ranked,
    leading: ranked[0].cause,
    confidence: ranked[0].probability,
    runnerUp: ranked[1] ? ranked[1].cause : null,
    evidence,
  };
}

const TEMPERATURE_GRID_STEPS = 120;
const TEMPERATURE_MINIMUM = 1;
const TEMPERATURE_MAXIMUM = 120;

/**
 * Naive Bayes multiplies ten features as though they were independent, and they
 * are not, so its raw scores read as 99.9% on cases it gets wrong. One scalar
 * temperature, fitted on the calibration split by minimising negative log
 * likelihood, is the standard repair. It cannot change a single prediction: it
 * only stops the confidence from lying about them.
 */
export function fitTemperature(
  classifier: Classifier,
  calibrationCases: readonly DiagnosisCase[],
): number {
  const labelled = calibrationCases.filter((item) => item.confirmedCause);

  if (labelled.length === 0) {
    return 1;
  }

  const rows = labelled.map((item) => ({
    scores: classifier.classes.map((statistics) => classLogScore(statistics, item.features)),
    index: classifier.classes.findIndex((statistics) => statistics.cause === item.confirmedCause),
  }));

  let best = TEMPERATURE_MINIMUM;
  let bestLoss = Number.POSITIVE_INFINITY;

  for (let step = 0; step <= TEMPERATURE_GRID_STEPS; step += 1) {
    const temperature =
      TEMPERATURE_MINIMUM +
      ((TEMPERATURE_MAXIMUM - TEMPERATURE_MINIMUM) * step) / TEMPERATURE_GRID_STEPS;
    let loss = 0;

    for (const row of rows) {
      if (row.index < 0) {
        continue;
      }

      loss -= Math.log(Math.max(Number.MIN_VALUE, softmax(row.scores, temperature)[row.index]));
    }

    if (loss < bestLoss) {
      bestLoss = loss;
      best = temperature;
    }
  }

  return best;
}

export interface ClassScore {
  cause: CauseId;
  support: number;
  precision: number;
  recall: number;
}

export interface Evaluation {
  accuracy: number;
  /** How often the confirmed cause is the leading call or the runner-up. */
  topTwoAccuracy: number;
  evaluated: number;
  correct: number;
  /** confusion[actual][predicted] */
  confusion: Record<CauseId, Record<CauseId, number>>;
  perClass: ClassScore[];
  /** Mean confidence. Against accuracy, it says whether the confidence is honest. */
  meanConfidence: number;
}

function emptyConfusion(): Record<CauseId, Record<CauseId, number>> {
  const table = {} as Record<CauseId, Record<CauseId, number>>;

  for (const actual of DIAGNOSIS_CAUSES) {
    const row = {} as Record<CauseId, number>;
    for (const predicted of DIAGNOSIS_CAUSES) {
      row[predicted.id] = 0;
    }
    table[actual.id] = row;
  }

  return table;
}

export function evaluate(classifier: Classifier, cases: readonly DiagnosisCase[]): Evaluation {
  const confusion = emptyConfusion();
  let evaluated = 0;
  let correct = 0;
  let withinTopTwo = 0;
  let confidenceSum = 0;

  for (const item of cases) {
    const actual = item.confirmedCause;

    if (!actual) {
      continue;
    }

    const diagnosis = diagnose(classifier, item.features);
    confusion[actual][diagnosis.leading] += 1;
    confidenceSum += diagnosis.confidence;
    evaluated += 1;

    if (diagnosis.leading === actual) {
      correct += 1;
    }

    if (diagnosis.ranked.slice(0, 2).some((entry) => entry.cause === actual)) {
      withinTopTwo += 1;
    }
  }

  const perClass = DIAGNOSIS_CAUSES.map((cause) => {
    const support = DIAGNOSIS_CAUSES.reduce(
      (sum, predicted) => sum + confusion[cause.id][predicted.id],
      0,
    );
    const predictedCount = DIAGNOSIS_CAUSES.reduce(
      (sum, actual) => sum + confusion[actual.id][cause.id],
      0,
    );
    const hits = confusion[cause.id][cause.id];

    return {
      cause: cause.id,
      support,
      precision: predictedCount === 0 ? 0 : hits / predictedCount,
      recall: support === 0 ? 0 : hits / support,
    };
  });

  return {
    accuracy: evaluated === 0 ? 0 : correct / evaluated,
    topTwoAccuracy: evaluated === 0 ? 0 : withinTopTwo / evaluated,
    evaluated,
    correct,
    confusion,
    perClass,
    meanConfidence: evaluated === 0 ? 0 : confidenceSum / evaluated,
  };
}

export interface LearningPoint {
  labelledExamples: number;
  accuracy: number;
}

/**
 * Accuracy against the number of labelled examples the model was fitted on.
 * Every point is scored on the same untouched holdout split, so the curve is a
 * statement about the corpus rather than about the classifier.
 */
export function learningCurve(
  trainingCases: readonly DiagnosisCase[],
  holdoutCases: readonly DiagnosisCase[],
  sizes: readonly number[],
): LearningPoint[] {
  return sizes
    .filter((size) => size <= trainingCases.length)
    .map((size) => ({
      labelledExamples: size,
      accuracy: evaluate(fitClassifier(trainingCases.slice(0, size)), holdoutCases).accuracy,
    }));
}

export const LEARNING_CURVE_SIZES = [12, 24, 48, 96, 144, 192, 240, 300, 384] as const;

export interface CorpusSplits {
  training: DiagnosisCase[];
  calibration: DiagnosisCase[];
  holdout: DiagnosisCase[];
  pending: DiagnosisCase[];
}

export function splitCorpus(cases: readonly DiagnosisCase[]): CorpusSplits {
  return {
    training: cases.filter((item) => item.split === "training"),
    calibration: cases.filter((item) => item.split === "calibration"),
    holdout: cases.filter((item) => item.split === "holdout"),
    pending: cases.filter((item) => item.split === "pending"),
  };
}

export interface CauseCount {
  cause: CauseId;
  count: number;
}

export interface DiagnosisWorkspace {
  cases: DiagnosisCase[];
  splits: CorpusSplits;
  classifier: Classifier;
  holdout: Evaluation;
  /** The same holdout scored before the temperature was fitted. */
  uncalibrated: Evaluation;
  curve: LearningPoint[];
  labelledCount: number;
  causeCounts: CauseCount[];
  medianDaysToLabel: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The whole derivation, in the order it has to happen: fit on training, set the
 * temperature on calibration, then score the holdout once.
 */
export function buildWorkspace(cases: readonly DiagnosisCase[]): DiagnosisWorkspace {
  const splits = splitCorpus(cases);
  const fitted = fitClassifier(splits.training);
  const classifier: Classifier = {
    ...fitted,
    temperature: fitTemperature(fitted, splits.calibration),
  };

  return {
    cases: [...cases],
    splits,
    classifier,
    holdout: evaluate(classifier, splits.holdout),
    uncalibrated: evaluate(fitted, splits.holdout),
    curve: learningCurve(splits.training, splits.holdout, LEARNING_CURVE_SIZES),
    labelledCount: cases.filter((item) => item.confirmedCause).length,
    causeCounts: DIAGNOSIS_CAUSES.map((cause) => ({
      cause: cause.id,
      count: cases.filter((item) => item.confirmedCause === cause.id).length,
    })),
    medianDaysToLabel: median(
      cases.map((item) => item.daysToLabel).filter((days): days is number => days !== undefined),
    ),
  };
}
