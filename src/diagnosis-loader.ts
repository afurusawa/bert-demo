import fixtureCases from "./data/diagnosis-cases.json";
import type { DiagnosisCase } from "./diagnosis-model";

const staticCases = fixtureCases as DiagnosisCase[];
let loadedCases: Promise<DiagnosisCase[]> | undefined;

/** Single asynchronous seam for replacing the labelled corpus with a real one. */
export function loadDiagnosisCases(): Promise<DiagnosisCase[]> {
  loadedCases ??= Promise.resolve(staticCases);
  return loadedCases;
}
