import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TOKEN_BLOCK_END, TOKEN_BLOCK_START, renderTokenBlock } from "../src/design-tokens";

const stylesheetPath = fileURLToPath(new URL("../src/styles.css", import.meta.url));
const stylesheet = await readFile(stylesheetPath, "utf8");
const start = stylesheet.indexOf(TOKEN_BLOCK_START);
const end = stylesheet.indexOf(TOKEN_BLOCK_END);

if (start < 0 || end < start) {
  throw new Error(
    `${stylesheetPath} has no generated token block: expected ${TOKEN_BLOCK_START} ... ${TOKEN_BLOCK_END}`,
  );
}

const updated =
  stylesheet.slice(0, start) + renderTokenBlock() + stylesheet.slice(end + TOKEN_BLOCK_END.length);

await writeFile(stylesheetPath, updated, "utf8");
