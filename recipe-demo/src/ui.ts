import {
  FULL_APPROXIMATE_SUITE_INSTRUCTION,
  KNOWN_TYPES,
  REGISTER_NAMES,
  type ChangeType,
  type DemoModel,
  type HeadInspection,
  type StrategyName,
} from "./model";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatMeasurement(value: number): string {
  return value.toFixed(3);
}

export function formatRecipeValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatBer(value: number): string {
  return value.toExponential(2);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDistance(value: number): string {
  return value.toFixed(1);
}

export function typeLabelPlain(type: ChangeType): string {
  const labels: Record<string, string> = {
    laser_up: "Laser power up",
    reader_wider: "Wider reader",
    heater_up: "Heater up",
    zone_od: "Outer zone",
    zone_id: "Inner zone",
    unknown_family: "Unknown family",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export function optionMarkup(selected: ChangeType): string {
  return [
    ...KNOWN_TYPES.map(
      (type) =>
        `<option value="${type}"${selected === type ? " selected" : ""}>${escapeHtml(typeLabelPlain(type))}</option>`,
    ),
    `<option value="unknown_family"${selected === "unknown_family" ? " selected" : ""}>Unknown family</option>`,
  ].join("");
}

export function rowOptionMarkup(model: DemoModel, selectedRowId: string): string {
  return model.corpus.testRows
    .map(
      (row) =>
        `<option value="${row.id}"${row.id === selectedRowId ? " selected" : ""}>${escapeHtml(row.tag)} — ${escapeHtml(typeLabelPlain(row.changeType))}</option>`,
    )
    .join("");
}

export function measurementMarkupGlossed(inspection: HeadInspection): string {
  const m = inspection.row.firstRead;
  const rows: [string, number, string][] = [
    ["Amplitude", m.amp, "How strong the electrical pulse looks on this head."],
    ["Signal quality (SNR)", m.snr, "How clean the pulse is versus noise. Higher is cleaner."],
    ["Timing error", m.timing_error, "How far bit timing sits from the expected spot."],
    ["Asymmetry", m.asy, "How uneven the up and down pulse shapes are."],
  ];
  return rows
    .map(
      ([label, value, gloss]) =>
        `<div class="fact fact-glossed"><dt>${escapeHtml(label)}</dt><dd>${formatMeasurement(value)}</dd><p class="fact-gloss">${escapeHtml(gloss)}</p></div>`,
    )
    .join("");
}

function scoreBar(label: string, value: number, maximum: number, display: string): string {
  const width = maximum === 0 ? 0 : Math.max(2, (value / maximum) * 100);
  return `
    <div class="score-row">
      <div class="score-label"><span>${escapeHtml(label)}</span><strong>${display}</strong></div>
      <div class="bar-track" role="img" data-value="${value}" data-scale-max="${maximum}" aria-label="${escapeHtml(label)} ${escapeHtml(display)}"><span class="bar-fill" style="width: ${width.toFixed(1)}%"></span></div>
    </div>`;
}

export function metricMarkup(model: DemoModel): string {
  const aggregates = model.evaluation.aggregates;
  const strategies: readonly [StrategyName, string][] = [
    ["copyLast", "Reuse last head"],
    ["sameTypeMean", "Average for this change"],
    ["mappedWithFallback", "Learned start (or last head if refused)"],
  ];
  const l2Maximum = Math.max(...strategies.map(([strategy]) => aggregates[strategy].meanL2Distance));
  const berMaximum = Math.max(...strategies.map(([strategy]) => aggregates[strategy].meanBer));

  return `
    <div class="metric-grid">
      <section class="metric-card" data-metric-group="l2-distance" aria-labelledby="l2-heading">
        <h3 id="l2-heading">Average distance from ideal settings</h3>
        <p class="metric-unit">Lower is closer. The demo calls this L2 distance across the 12 settings.</p>
        ${strategies.map(([strategy, label]) => scoreBar(label, aggregates[strategy].meanL2Distance, l2Maximum, formatDistance(aggregates[strategy].meanL2Distance))).join("")}
      </section>
      <section class="metric-card" data-metric-group="synthetic-ber" aria-labelledby="ber-heading">
        <h3 id="ber-heading">Average invented bit-error rate</h3>
        <p class="metric-unit">Lower is better. Invented BER from the same distance rule for every strategy.</p>
        ${strategies.map(([strategy, label]) => scoreBar(label, aggregates[strategy].meanBer, berMaximum, formatBer(aggregates[strategy].meanBer))).join("")}
      </section>
    </div>`;
}

export function maskMetricsTable(model: DemoModel): string {
  return `
    <table class="summary-table">
      <caption>How well the map found which settings move</caption>
      <thead><tr><th scope="col">Change type</th><th scope="col">Correct of 12</th><th scope="col">Missed a mover</th><th scope="col">Marked one by mistake</th></tr></thead>
      <tbody>${KNOWN_TYPES.map((type) => {
        const metrics = model.evaluation.maskMetrics[type];
        return `<tr><th scope="row">${escapeHtml(typeLabelPlain(type))}</th><td>${metrics.correctCells}</td><td>${metrics.missedMovingRegisters}</td><td>${metrics.falsePositiveRegisters}</td></tr>`;
      }).join("")}</tbody>
    </table>`;
}

export { FULL_APPROXIMATE_SUITE_INSTRUCTION, KNOWN_TYPES, REGISTER_NAMES };
