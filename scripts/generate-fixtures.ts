import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSyntheticRuns } from "../src/scan-model";

const outputPath = fileURLToPath(new URL("../src/data/runs.json", import.meta.url));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(`${outputPath}`, `${JSON.stringify(generateSyntheticRuns("eye-scan-results-v1"), null, 2)}\n`, "utf8");
