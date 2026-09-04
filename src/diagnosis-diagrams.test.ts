import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelineDiagram } from "./diagnosis-diagrams";

const stylesheet = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

describe("pipeline diagram styles", () => {
  it("does not let prose paragraph styling override embedded diagram copy", () => {
    expect(stylesheet).toContain(".prose-block > p {");
    expect(stylesheet).not.toContain(".prose-block p {");
  });

  it("keeps the pipeline geometry inside its SVG viewBox", () => {
    const markup = renderToStaticMarkup(PipelineDiagram({ labelledCount: 640, causeCount: 10 }));
    const boxes = [...markup.matchAll(/<rect class="diagram-box[^\"]*" x="([^\"]+)" y="([^\"]+)" width="([^\"]+)" height="([^\"]+)"/g)];
    const labels = [...markup.matchAll(/<text class="diagram-arrow-label" x="([^\"]+)" y="([^\"]+)"(?: text-anchor="([^\"]+)")?>([^<]+)<\/text>/g)];

    expect(boxes).toHaveLength(5);
    for (const box of boxes) {
      const x = Number(box[1]);
      const y = Number(box[2]);
      const width = Number(box[3]);
      const height = Number(box[4]);

      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(1000);
      expect(y + height).toBeLessThanOrEqual(470);
    }

    expect(labels).toHaveLength(3);
    for (const label of labels) {
      expect(Number(label[1])).toBeLessThanOrEqual(1000);
    }
    expect(labels.slice(1).every((label) => label[3] === "end")).toBe(true);
  });
});
