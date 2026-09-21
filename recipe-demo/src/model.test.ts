import { describe, expect, it } from "vitest";
import { createDemoModel, KNOWN_TYPES, REGISTER_NAMES, syntheticBer } from "./model";

describe("synthetic head recipe model", () => {
  it("reproduces the seed-0 corpus with stable split identities", () => {
    const first = createDemoModel(0);
    const second = createDemoModel(0);

    expect(first.corpus).toEqual(second.corpus);
    expect(first.corpus.trainingRows).toHaveLength(320);
    expect(first.corpus.testRows).toHaveLength(80);
    expect(new Set(first.corpus.trainingRows.map((row) => row.id)).size).toBe(320);
    expect(new Set(first.corpus.testRows.map((row) => row.id)).size).toBe(80);
    const trainingIds = new Set(first.corpus.trainingRows.map((row) => row.id));
    const testIds = new Set(first.corpus.testRows.map((row) => row.id));
    expect([...trainingIds].filter((id) => testIds.has(id))).toHaveLength(0);
  });

  it("keeps every generated row valid and covers every known family in both splits", () => {
    const model = createDemoModel(0);
    const trainingTypes = new Set(model.corpus.trainingRows.map((row) => row.changeType));
    const testTypes = new Set(
      model.corpus.testRows.filter((row) => row.changeType !== "unknown_family").map((row) => row.changeType),
    );

    expect([...KNOWN_TYPES].every((type) => trainingTypes.has(type))).toBe(true);
    expect([...KNOWN_TYPES].every((type) => testTypes.has(type))).toBe(true);
    expect(model.corpus.testRows.filter((row) => row.changeType === "unknown_family")).toHaveLength(1);

    for (const row of [...model.corpus.trainingRows, ...model.corpus.testRows]) {
      expect(row.finalRecipe).toHaveLength(REGISTER_NAMES.length);
      expect(row.finalRecipe.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
      expect(Object.values(row.firstRead).every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(row.finalBer)).toBe(true);
      expect(row.finalBer).toBeGreaterThanOrEqual(1e-6);
      expect(row.finalBer).toBeLessThanOrEqual(1e-3);
    }

    for (const row of model.corpus.testRows.filter((candidate) => candidate.changeType !== "unknown_family")) {
      const movingRegisters = row.hiddenMask.filter(Boolean).length;
      expect(movingRegisters).toBeGreaterThanOrEqual(3);
      expect(movingRegisters).toBeLessThanOrEqual(5);
      expect(row.hiddenTrueRecipe).toHaveLength(REGISTER_NAMES.length);
      expect(row.hiddenTrueRecipe.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
      expect(row.hiddenTrueRecipe).not.toEqual(row.finalRecipe);
    }

    const allRows = [...model.corpus.trainingRows, ...model.corpus.testRows];
    expect(allRows.filter((row) => row.changeType === "zone_od").every((row) => row.zone === "OD")).toBe(true);
    expect(allRows.filter((row) => row.changeType === "zone_id").every((row) => row.zone === "ID")).toBe(true);

    const unknown = model.corpus.testRows.find((row) => row.changeType === "unknown_family")!;
    expect(
      model.corpus.testRows
        .filter((row) => row.changeType !== "unknown_family")
        .every((row) => row.hiddenMask.toString() !== unknown.hiddenMask.toString()),
    ).toBe(true);
    expect(unknown.hiddenTrueRecipe.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
    expect(unknown.firstRead.timing_error).toBeGreaterThan(4);
    expect(unknown.firstRead.snr).toBeLessThan(12);
  });

  it("uses one monotone BER function for a completed recipe and a starting recipe", () => {
    const model = createDemoModel(0);
    const row = model.corpus.testRows[0];
    const exact = row.hiddenTrueRecipe;
    const nearby = exact.map((value, index) => value + (index === 0 ? 4 : 0));
    const distant = exact.map((value) => value + 30);
    const evaluatedFinal = model.evaluation.knownHeads.find((head) => head.row.id === row.id)!;

    expect(row.finalBer).toBeGreaterThanOrEqual(1e-6);
    expect(syntheticBer(row.finalRecipe, row.hiddenTrueRecipe)).toBeCloseTo(row.finalBer, 12);
    expect(evaluatedFinal.final.ber).toBeCloseTo(row.finalBer, 12);
    expect(syntheticBer(exact, exact)).toBe(1e-6);
    expect(syntheticBer(nearby, exact)).toBeLessThan(syntheticBer(distant, exact));
  });

  it("fits a pooled base and recovers the moving-register masks", () => {
    const model = createDemoModel(0);

    for (const type of KNOWN_TYPES) {
      const hiddenMask = model.corpus.testRows.find((row) => row.changeType === type)!.hiddenMask;
      const learnedMask = model.fitted.types[type].learnedMask;
      const correctCells = learnedMask.filter((moving, index) => moving === hiddenMask[index]).length;

      expect(correctCells).toBeGreaterThanOrEqual(8);
    }

    expect(model.fitted.maskThreshold).toBeGreaterThan(0);
    expect(model.fitted.baseRecipe).toHaveLength(REGISTER_NAMES.length);
    expect(model.fitted.baseRecipe.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
  });

  it("keeps the two baselines separate and refuses unsupported or disagreeing claims", () => {
    const model = createDemoModel(0);
    const row = model.corpus.testRows.find((candidate) => candidate.changeType === "laser_up")!;
    const accepted = model.propose(model.fitted, {
      claimedType: row.changeType,
      firstRead: row.firstRead,
    });

    expect(accepted.status).toBe("accepted");
    expect(accepted.mappedStart).not.toBeNull();
    expect(accepted.mappedStart).toHaveLength(REGISTER_NAMES.length);
    expect(accepted.mappedStart!.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
    expect(accepted.copyLast).toEqual(model.corpus.trainingRows.at(-1)!.finalRecipe);
    expect(accepted.sameTypeMean).toEqual(
      REGISTER_NAMES.map((_, register) => {
        const rows = model.corpus.trainingRows.filter((candidate) => candidate.changeType === row.changeType);
        return rows.reduce((sum, candidate) => sum + candidate.finalRecipe[register], 0) / rows.length;
      }),
    );

    const unsupported = model.propose(model.fitted, {
      claimedType: "unknown_family",
      firstRead: row.firstRead,
    });
    expect(unsupported.status).toBe("refused");
    expect(unsupported.reason).toBe("unsupported-label");
    expect(unsupported.sameTypeMean).toBeNull();
    expect(unsupported.message).toContain("run the full approximate suite.");

    const disagreeing = model.propose(model.fitted, {
      claimedType: "zone_id",
      firstRead: row.firstRead,
    });
    expect(disagreeing.status).toBe("refused");
    expect(disagreeing.reason).toBe("type-disagreement");
    expect(disagreeing.message).toContain("run the full approximate suite.");
  });

  it("evaluates the same 79 known heads with arithmetic means and fallback accounting", () => {
    const model = createDemoModel(0);
    const evaluation = model.evaluation;
    const strategies = ["copyLast", "sameTypeMean", "mappedWithFallback"] as const;

    expect(evaluation.knownHeads).toHaveLength(79);
    expect(evaluation.acceptanceRate).toBe(evaluation.acceptedCount / 79);
    for (const strategy of strategies) {
      const aggregate = evaluation.aggregates[strategy];
      expect(aggregate.count).toBe(79);
      expect(aggregate.meanL2Distance).toBeCloseTo(
        aggregate.perHead.reduce((sum, head) => sum + head.l2Distance, 0) / 79,
        12,
      );
      expect(aggregate.meanBer).toBeCloseTo(
        aggregate.perHead.reduce((sum, head) => sum + head.ber, 0) / 79,
        12,
      );
    }

    const refused = evaluation.knownHeads.find((head) => !head.accepted);
    expect(refused).toBeDefined();
    expect(refused!.mappedWithFallback.l2Distance).toBe(refused!.copyLast.l2Distance);
    expect(refused!.mappedWithFallback.ber).toBe(refused!.copyLast.ber);
    expect(evaluation.aggregates.mappedWithFallback.meanL2Distance).toBeLessThanOrEqual(
      evaluation.aggregates.copyLast.meanL2Distance * 0.75,
    );

    for (const type of KNOWN_TYPES) {
      expect(evaluation.maskMetrics[type].correctCells).toBeGreaterThanOrEqual(8);
      expect(evaluation.maskMetrics[type].missedMovingRegisters).toBeGreaterThanOrEqual(0);
      expect(evaluation.maskMetrics[type].falsePositiveRegisters).toBeGreaterThanOrEqual(0);
    }

    expect(evaluation.unknownExample.proposal.status).toBe("refused");
    for (const type of KNOWN_TYPES) {
      expect(model.inspectTestHead(evaluation.unknownExample.row.id, type).proposal.status).toBe("refused");
    }
  });

  it("keeps random selection and held-out truth outside fitting", () => {
    const model = createDemoModel(0);
    const fittedBefore = JSON.stringify(model.fitted);
    const evaluationBefore = JSON.stringify(model.evaluation);
    const corpusBefore = JSON.stringify(model.corpus);

    const randomHead = model.randomTestHead();
    expect(model.corpus.testRows.some((row) => row.id === randomHead.id)).toBe(true);
    expect(model.randomTestHead().id).not.toBeUndefined();
    expect(JSON.stringify(model.fitted)).toBe(fittedBefore);
    expect(JSON.stringify(model.evaluation)).toBe(evaluationBefore);
    expect(JSON.stringify(model.corpus)).toBe(corpusBefore);

    const alteredTestRows = model.corpus.testRows.map((row, index) =>
      index === 0
        ? { ...row, hiddenTrueRecipe: row.hiddenTrueRecipe.map((value) => value + 40) }
        : row,
    );
    expect(JSON.stringify(model.fit(model.corpus.trainingRows))).toBe(fittedBefore);
    const alteredEvaluation = model.evaluate(model.fitted, alteredTestRows);
    expect(alteredEvaluation.knownHeads[0].final.l2Distance).not.toBe(
      model.evaluation.knownHeads[0].final.l2Distance,
    );
    expect(JSON.stringify(model.fitted)).toBe(fittedBefore);
    expect(alteredTestRows[0].hiddenTrueRecipe).not.toEqual(model.corpus.testRows[0].hiddenTrueRecipe);
  });

  it("falls back to a finite type mean when all training features are constant", () => {
    const model = createDemoModel(0);
    const constantFirstRead = { amp: 1, snr: 20, timing_error: 1, asy: 0 };
    const constantTrainingRows = model.corpus.trainingRows.map((row) => ({
      ...row,
      firstRead: constantFirstRead,
    }));
    const fitted = model.fit(constantTrainingRows);
    const proposal = model.propose(fitted, { claimedType: "laser_up", firstRead: constantFirstRead });

    expect(proposal.mappedStart).not.toBeNull();
    expect(proposal.mappedStart!.every((value) => Number.isFinite(value))).toBe(true);
    expect(proposal.mappedStart!.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);

    const singularTrainingRows = model.corpus.trainingRows.map((row, index) => {
      const variation = (index % 64) / 10;
      return {
        ...row,
        firstRead: { amp: variation, snr: 20 + variation * 2, timing_error: 1, asy: 0 },
      };
    });
    const singularFitted = model.fit(singularTrainingRows);
    for (const predictor of singularFitted.types.laser_up.predictors) {
      expect(predictor.coefficients).toHaveLength(0);
      expect(Number.isFinite(predictor.fallbackMean)).toBe(true);
    }
  });
});
