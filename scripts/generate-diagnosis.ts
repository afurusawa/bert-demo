import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDiagnosisCorpus } from "../src/diagnosis-model";

const outputPath = fileURLToPath(new URL("../src/data/diagnosis-cases.json", import.meta.url));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(generateDiagnosisCorpus("diagnosis-corpus-v1"), null, 2)}\n`,
  "utf8",
);
