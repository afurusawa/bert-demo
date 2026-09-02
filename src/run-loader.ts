import fixtureRuns from "./data/runs.json";
import type { ScanRun } from "./scan-model";

const staticRuns = fixtureRuns as ScanRun[];
let loadedRuns: Promise<ScanRun[]> | undefined;

/** Single asynchronous seam for replacing static fixtures with a future adapter. */
export function loadRuns(): Promise<ScanRun[]> {
  loadedRuns ??= Promise.resolve(staticRuns);
  return loadedRuns;
}
