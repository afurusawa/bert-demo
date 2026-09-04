import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_CAUSES,
  DIAGNOSIS_FEATURES,
  LEARNING_CURVE_SIZES,
  buildWorkspace,
  causeSpec,
  diagnose,
  evaluate,
  featureSpec,
  fitClassifier,
  fitTemperature,
  generateDiagnosisCorpus,
  learningCurve,
  splitCorpus,
  type DiagnosisCase,
} from "./diagnosis-model";

const corpus = generateDiagnosisCorpus("fixture-seed");
const splits = splitCorpus(corpus);

describe("diagnosis corpus", () => {
  it("generates a byte-identical corpus from the same seed and a different one from another", () => {
    const first = generateDiagnosisCorpus("repeat-seed");
    const second = generateDiagnosisCorpus("repeat-seed");

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(generateDiagnosisCorpus("other-seed")));
  });

  it("stores a complete feature vector and a resolution for every labelled case", () => {
    for (const item of corpus) {
      for (const feature of DIAGNOSIS_FEATURES) {
        expect(Number.isFinite(item.features[feature.key])).toBe(true);
      }

      if (item.split === "pending") {
        expect(item.confirmedCause).toBeUndefined();
      } else {
        expect(item.confirmedCause).toBeDefined();
        expect(item.resolutionNote).toBeTruthy();
        expect(item.resolvedBy).toBeTruthy();
      }
    }
  });

  it("holds out cases the model is never fitted or calibrated on", () => {
    const fitted = new Set([...splits.training, ...splits.calibration].map((item) => item.id));

    expect(splits.holdout.length).toBeGreaterThan(0);
    expect(splits.holdout.some((item) => fitted.has(item.id))).toBe(false);
  });

  it("names every cause and feature it references", () => {
    for (const cause of DIAGNOSIS_CAUSES) {
      expect(causeSpec(cause.id).label).toBeTruthy();
    }
    for (const feature of DIAGNOSIS_FEATURES) {
      expect(featureSpec(feature.key).label).toBeTruthy();
    }
  });
});

describe("classifier", () => {
  const classifier = fitClassifier(splits.training);

  it("fits one class per cause with priors that sum to one", () => {
    const priors = classifier.classes.reduce((sum, entry) => sum + entry.prior, 0);

    expect(classifier.classes).toHaveLength(DIAGNOSIS_CAUSES.length);
    expect(classifier.trainingSize).toBe(splits.training.length);
    expect(priors).toBeCloseTo(1, 10);
    expect(classifier.classes.every((entry) => entry.count > 0)).toBe(true);
  });

  it("returns a ranked, normalised posterior with the leading cause first", () => {
    const diagnosis = diagnose(classifier, splits.holdout[0].features);
    const total = diagnosis.ranked.reduce((sum, entry) => sum + entry.probability, 0);

    expect(diagnosis.ranked).toHaveLength(DIAGNOSIS_CAUSES.length);
    expect(total).toBeCloseTo(1, 10);
    expect(diagnosis.leading).toBe(diagnosis.ranked[0].cause);
    expect(diagnosis.confidence).toBeCloseTo(diagnosis.ranked[0].probability, 12);
    expect(diagnosis.runnerUp).toBe(diagnosis.ranked[1].cause);
    expect(diagnosis.ranked[0].probability).toBeGreaterThanOrEqual(diagnosis.ranked[1].probability);
  });

  it("attributes the leading call to individual features", () => {
    const diagnosis = diagnose(classifier, splits.holdout[0].features);

    expect(diagnosis.evidence).toHaveLength(DIAGNOSIS_FEATURES.length);
    expect(diagnosis.evidence.every((entry) => Number.isFinite(entry.contribution))).toBe(true);
  });

  it("beats chance on cases it has never seen", () => {
    const scored = evaluate(classifier, splits.holdout);

    expect(scored.evaluated).toBe(splits.holdout.length);
    expect(scored.correct / scored.evaluated).toBeCloseTo(scored.accuracy, 12);
    expect(scored.accuracy).toBeGreaterThan(2 / DIAGNOSIS_CAUSES.length);
    expect(scored.topTwoAccuracy).toBeGreaterThan(scored.accuracy);
  });

  it("counts every holdout case exactly once in the confusion matrix", () => {
    const scored = evaluate(classifier, splits.holdout);
    const total = DIAGNOSIS_CAUSES.reduce(
      (sum, actual) =>
        sum + DIAGNOSIS_CAUSES.reduce((row, predicted) => row + scored.confusion[actual.id][predicted.id], 0),
      0,
    );
    const diagonal = DIAGNOSIS_CAUSES.reduce(
      (sum, cause) => sum + scored.confusion[cause.id][cause.id],
      0,
    );

    expect(total).toBe(splits.holdout.length);
    expect(diagonal).toBe(scored.correct);
  });

  it("softens overconfident posteriors rather than sharpening them", () => {
    const temperature = fitTemperature(classifier, splits.calibration);
    const calibrated = { ...classifier, temperature };
    const raw = evaluate(classifier, splits.holdout);
    const scaled = evaluate(calibrated, splits.holdout);

    expect(temperature).toBeGreaterThan(1);
    expect(scaled.meanConfidence).toBeLessThan(raw.meanConfidence);
    expect(scaled.accuracy).toBe(raw.accuracy);
  });

  it("leaves the temperature at one when there is nothing to calibrate on", () => {
    expect(fitTemperature(classifier, [] as DiagnosisCase[])).toBe(1);
  });
});

describe("learning curve", () => {
  it("scores every prefix on the same holdout and ends where the full fit does", () => {
    const curve = learningCurve(splits.training, splits.holdout, LEARNING_CURVE_SIZES);

    expect(curve.length).toBeGreaterThan(2);
    expect(curve.every((point) => point.labelledExamples <= splits.training.length)).toBe(true);
    expect(curve[curve.length - 1].accuracy).toBeGreaterThan(curve[0].accuracy);
  });

  it("stops at the number of examples actually held", () => {
    expect(learningCurve(splits.training.slice(0, 20), splits.holdout, [12, 24, 48])).toHaveLength(1);
  });
});

describe("workspace", () => {
  it("derives the whole page from the stored cases in fitting order", () => {
    const workspace = buildWorkspace(corpus);
    const counted = workspace.causeCounts.reduce((sum, entry) => sum + entry.count, 0);

    expect(workspace.classifier.temperature).toBeGreaterThan(1);
    expect(workspace.labelledCount).toBe(counted);
    expect(workspace.labelledCount).toBe(corpus.length - workspace.splits.pending.length);
    expect(workspace.holdout.accuracy).toBeGreaterThan(2 / DIAGNOSIS_CAUSES.length);
    expect(workspace.uncalibrated.meanConfidence).toBeGreaterThan(workspace.holdout.meanConfidence);
    expect(workspace.medianDaysToLabel).toBeGreaterThan(0);
  });
});
