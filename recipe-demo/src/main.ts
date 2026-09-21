import {
  createDemoModel,
  FULL_APPROXIMATE_SUITE_INSTRUCTION,
  KNOWN_TYPES,
  REGISTER_NAMES,
  type ChangeType,
  type HeadInspection,
  type Recipe,
  type StrategyName,
} from "./model";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./styles.css";

const model = createDemoModel(0);
const app = document.querySelector<HTMLDivElement>("#app")!;

if (!app) {
  throw new Error("recipe demo root is missing");
}

let selectedRowId = model.corpus.testRows[0].id;
let claimedType: ChangeType = model.corpus.testRows[0].changeType;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMeasurement(value: number): string {
  return value.toFixed(3);
}

function formatRecipeValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBer(value: number): string {
  return value.toExponential(2);
}

function formatDistance(value: number): string {
  return value.toFixed(1);
}

function typeLabel(type: ChangeType): string {
  return type.replaceAll("_", " ");
}

function optionMarkup(selected: ChangeType): string {
  return [
    ...KNOWN_TYPES.map(
      (type) => `<option value="${type}"${selected === type ? " selected" : ""}>${escapeHtml(typeLabel(type))}</option>`,
    ),
    `<option value="unknown_family"${selected === "unknown_family" ? " selected" : ""}>unknown family</option>`,
  ].join("");
}

function rowOptionMarkup(): string {
  return model.corpus.testRows
    .map(
      (row) =>
        `<option value="${row.id}"${row.id === selectedRowId ? " selected" : ""}>${escapeHtml(row.tag)} — ${escapeHtml(typeLabel(row.changeType))}</option>`,
    )
    .join("");
}

function measurementMarkup(inspection: HeadInspection): string {
  const measurements = inspection.row.firstRead;
  return [
    ["amp", measurements.amp],
    ["snr", measurements.snr],
    ["timing_error", measurements.timing_error],
    ["asy (asymmetry)", measurements.asy],
  ]
    .map(
      ([label, value]) =>
        `<div class="fact"><dt>${label}</dt><dd>${formatMeasurement(value as number)}</dd></div>`,
    )
    .join("");
}

function maskCell(moving: boolean, kind: "learned" | "hidden"): string {
  const state = moving ? "move" : "skip";
  const label = moving ? "Move" : "Skip";
  return `<td class="mask-cell ${state} ${kind}" data-state="${state}"><span>${label}</span></td>`;
}

function maskMarkup(inspection: HeadInspection): string {
  if (inspection.proposal.status === "refused") {
    return `<p class="refused-map-note"><strong>Refused map:</strong> no learned move/skip instructions are available. ${FULL_APPROXIMATE_SUITE_INSTRUCTION}</p>`;
  }

  const learnedMask =
    inspection.claimedType !== "unknown_family"
      ? model.fitted.types[inspection.claimedType as (typeof KNOWN_TYPES)[number]]?.learnedMask
      : null;
  const learnedRow = learnedMask
    ? learnedMask.map((moving) => maskCell(moving, "learned")).join("")
    : REGISTER_NAMES.map(() => `<td class="mask-cell unavailable"><span>—</span></td>`).join("");
  const hiddenRow = inspection.row.hiddenMask.map((moving) => maskCell(moving, "hidden")).join("");

  return `
    <table class="mask-table">
      <caption>Learned map compared with the hidden true mask</caption>
      <thead><tr><th scope="col">register</th>${REGISTER_NAMES.map((name) => `<th scope="col">${name}</th>`).join("")}</tr></thead>
      <tbody>
        <tr><th scope="row">learned</th>${learnedRow}</tr>
        <tr><th scope="row">hidden truth</th>${hiddenRow}</tr>
      </tbody>
    </table>`;
}

function recipeRow(label: string, recipe: Recipe | null, note = "", unavailableMessage = "Unavailable for this claimed family"): string {
  const cells = recipe
    ? recipe.map((value) => `<td>${formatRecipeValue(value)}</td>`).join("")
    : `<td class="unavailable" colspan="12">${escapeHtml(unavailableMessage)}</td>`;
  return `<tr><th scope="row">${escapeHtml(label)}</th>${cells}<td class="row-note">${escapeHtml(note)}</td></tr>`;
}

function recipeMarkup(inspection: HeadInspection): string {
  const proposal = inspection.proposal;
  const isRefused = proposal.status === "refused";
  const mappedNote =
    isRefused
      ? "Refused proposal. No mapped start is available; mapped-with-fallback scoring uses copy last as the fallback starting point."
      : "Unchecked proposal. Learned moving registers; skipped registers use the estimated shared base.";
  const mappedLabel = isRefused ? "mapped start (refused)" : "mapped start (unchecked)";
  const copyLastLabel = isRefused ? "copy last (fallback starting point)" : "copy last";
  const copyLastNote =
    isRefused
      ? "Fallback starting point after refusal; one fixed last training recipe for the whole held-out batch."
      : "One fixed last training recipe for the whole held-out batch.";
  return `
    <table class="recipe-table">
      <caption>Starting recipes and hidden completed recipe</caption>
      <thead><tr><th scope="col">recipe</th>${REGISTER_NAMES.map((name) => `<th scope="col">${name}</th>`).join("")}<th scope="col">meaning</th></tr></thead>
      <tbody>
        ${recipeRow(mappedLabel, proposal.mappedStart, mappedNote, "No mapped start; the proposal was refused.")}
        ${recipeRow(copyLastLabel, proposal.copyLast, copyLastNote)}
        ${recipeRow("same-type mean", proposal.sameTypeMean, "Training rows only; no invented family mean.")}
        ${recipeRow("hidden true", inspection.row.hiddenTrueRecipe, "Evaluation evidence, never a fitting input.")}
      </tbody>
    </table>`;
}

function scoreBar(label: string, value: number, maximum: number, display: string): string {
  const width = maximum === 0 ? 0 : Math.max(2, (value / maximum) * 100);
  return `
    <div class="score-row">
      <div class="score-label"><span>${escapeHtml(label)}</span><strong>${display}</strong></div>
      <div class="bar-track" role="img" aria-label="${escapeHtml(label)} ${escapeHtml(display)}"><span class="bar-fill" style="width: ${width.toFixed(1)}%"></span></div>
    </div>`;
}

function metricMarkup(): string {
  const aggregates = model.evaluation.aggregates;
  const strategies: readonly [StrategyName, string][] = [
    ["copyLast", "copy last"],
    ["sameTypeMean", "same-type mean"],
    ["mappedWithFallback", "mapped with fallback"],
  ];
  const l2Maximum = Math.max(...strategies.map(([strategy]) => aggregates[strategy].meanL2Distance));
  const berMaximum = Math.max(...strategies.map(([strategy]) => aggregates[strategy].meanBer));

  return `
    <div class="metric-grid">
      <section class="metric-card" aria-labelledby="l2-heading">
        <h3 id="l2-heading">Mean starting L2 distance</h3>
        <p class="metric-unit">register counts · lower is closer to hidden truth</p>
        ${strategies.map(([strategy, label]) => scoreBar(label, aggregates[strategy].meanL2Distance, l2Maximum, formatDistance(aggregates[strategy].meanL2Distance))).join("")}
      </section>
      <section class="metric-card" aria-labelledby="ber-heading">
        <h3 id="ber-heading">Mean synthetic starting BER</h3>
        <p class="metric-unit">arithmetic mean of per-head BER · lower is better</p>
        ${strategies.map(([strategy, label]) => scoreBar(label, aggregates[strategy].meanBer, berMaximum, formatBer(aggregates[strategy].meanBer))).join("")}
      </section>
    </div>`;
}

function maskMetricsMarkup(): string {
  return `
    <table class="summary-table">
      <caption>Mask recovery across all five known types</caption>
      <thead><tr><th scope="col">type</th><th scope="col">correct / 12</th><th scope="col">missed moving</th><th scope="col">false positives</th></tr></thead>
      <tbody>${KNOWN_TYPES.map((type) => {
        const metrics = model.evaluation.maskMetrics[type];
        return `<tr><th scope="row">${escapeHtml(typeLabel(type))}</th><td>${metrics.correctCells}</td><td>${metrics.missedMovingRegisters}</td><td>${metrics.falsePositiveRegisters}</td></tr>`;
      }).join("")}</tbody>
    </table>`;
}

function unknownMarkup(): string {
  const inspection = model.evaluation.unknownExample;
  return `
    <section class="unknown-card" aria-labelledby="unknown-heading">
      <div class="section-heading">
        <div>
          <h2 id="unknown-heading">Unknown family stays outside the aggregates</h2>
        </div>
        <span class="status status-refused">REFUSED</span>
      </div>
      <dl class="facts facts-four">
        <div class="fact"><dt>tag</dt><dd>${escapeHtml(inspection.row.tag)}</dd></div>
        <div class="fact"><dt>actual family</dt><dd>${escapeHtml(typeLabel(inspection.row.changeType))}</dd></div>
        <div class="fact"><dt>claimed type</dt><dd>${escapeHtml(typeLabel(inspection.claimedType))}</dd></div>
        <div class="fact"><dt>zone</dt><dd>${inspection.row.zone}</dd></div>
        ${measurementMarkup(inspection)}
      </dl>
      <p class="refusal-copy">${escapeHtml(inspection.proposal.message)}</p>
      <div class="unknown-checks">
        <h3>Same first read under every claimed label</h3>
        <p class="small-note">These refusals use only the fitted first-read classifier and distance thresholds. The hidden mask is not used to make any decision.</p>
        <table class="checks-table">
          <caption>Unknown-family claims remain refused</caption>
          <thead><tr><th scope="col">claimed type</th><th scope="col">decision</th><th scope="col">visible reason and next step</th></tr></thead>
          <tbody>${model.evaluation.unknownFamilyChecks
            .map(
              (check) =>
                `<tr><th scope="row">${escapeHtml(typeLabel(check.claimedType))}</th><td><strong>REFUSED</strong></td><td class="check-reason">${escapeHtml(check.proposal.message)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </section>`;
}

function selectedMarkup(inspection: HeadInspection): string {
  const proposal = inspection.proposal;
  const statusClass = proposal.status === "accepted" ? "status-proposed" : "status-refused";
  const statusText = proposal.status === "accepted" ? "MAP PROPOSAL · UNCHECKED" : "MAP REFUSED";
  const selectedMetrics = inspection.row.changeType !== "unknown_family" ? model.evaluation.knownHeads.find((head) => head.row.id === inspection.row.id) : null;
  const finalBer = inspection.row.finalBer;

  return `
    <section class="panel selected-panel" aria-labelledby="selected-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Held-out inspection</p>
          <h2 id="selected-heading">${escapeHtml(inspection.row.tag)}</h2>
        </div>
        <span class="status ${statusClass}">${statusText}</span>
      </div>
      <dl class="facts facts-four">
        <div class="fact"><dt>actual tag / family</dt><dd>${escapeHtml(inspection.row.tag)} · ${escapeHtml(typeLabel(inspection.row.changeType))}</dd></div>
        <div class="fact"><dt>zone</dt><dd>${inspection.row.zone}</dd></div>
        ${measurementMarkup(inspection)}
      </dl>
      <p class="decision-copy"><strong>Claimed type: ${escapeHtml(typeLabel(inspection.claimedType))}.</strong> ${escapeHtml(proposal.message)}</p>
      ${selectedMetrics ? `<p class="small-note">Completed held-out log BER: <strong>${formatBer(finalBer)}</strong>. Mapped-with-fallback is scored from the start recipe, not this completed result.</p>` : ""}
      ${maskMarkup(inspection)}
      ${recipeMarkup(inspection)}
    </section>`;
}

function render(): void {
  const inspection = model.inspectTestHead(selectedRowId, claimedType);
  const knownCount = model.evaluation.knownHeads.length;
  const acceptedCount = model.evaluation.acceptedCount;

  app.innerHTML = `
    <header class="site-header">
      <div class="page-width header-inner">
        <div>
          <p class="eyebrow">Synthetic calibration recipe</p>
          <h1>Inspect head changes before the suite runs</h1>
        </div>
        <span class="header-badge">SEED 0 · OFFLINE</span>
      </div>
    </header>
    <div class="notice"><div class="page-width"><strong>Synthetic data.</strong> This is a readable model boundary for inspecting hidden rules, learned rules, baselines, and refusal cases.</div></div>
    <main class="page-width page-main">
      <section class="intro">
        <p class="eyebrow">One-page inspection flow</p>
        <h2>Choose a held-out head, then compare the proposed start with two baselines.</h2>
        <p>Training fits the shared base, register mask, and small first-read predictors. A normalized nearest-centroid check compares the four first-read measurements with training populations before a map is offered. The test row remains unseen during fitting; its hidden mask and recipe are shown only so the viewer can inspect the unchecked proposal.</p>
      </section>

      <section class="control-panel" aria-labelledby="controls-heading">
        <div class="section-heading">
          <div><h2 id="controls-heading">Select an actual held-out row</h2></div>
          <span class="population">${knownCount} known heads · ${acceptedCount} accepted · ${(model.evaluation.acceptanceRate * 100).toFixed(0)}%</span>
        </div>
        <div class="controls-grid">
          <label class="control-field" for="head-select"><span>held-out row</span><select id="head-select">${rowOptionMarkup()}</select></label>
          <button class="action-button" id="random-head" type="button">Choose random test head</button>
          <label class="control-field" for="type-select"><span>claimed change type</span><select id="type-select">${optionMarkup(claimedType)}</select></label>
        </div>
        <p class="small-note">The random button uses a separate seed. Changing the claim keeps the selected tag and first-read measurements fixed.</p>
      </section>

      ${selectedMarkup(inspection)}

      <section class="panel" aria-labelledby="metrics-heading">
        <div class="section-heading">
          <div><h2 id="metrics-heading">Starting quality on the same ${knownCount} known heads</h2></div>
          <span class="population">unknown family excluded</span>
        </div>
        ${metricMarkup()}
        <p class="small-note">Refused known heads remain in “mapped with fallback” using copy last. BER is the arithmetic mean of each head’s synthetic BER, not BER evaluated at a mean distance.</p>
      </section>

      <section class="panel" aria-labelledby="mask-summary-heading">
        <div class="section-heading"><div><h2 id="mask-summary-heading">How the five learned masks compare</h2></div></div>
        <p>The mask threshold is <strong>${model.fitted.maskThreshold.toFixed(2)} register counts</strong>. Mark a register as moving when its type-level mean absolute deviation from the pooled training median exceeds this training-only threshold. The threshold is the median of all type and register deviation scores plus three mean absolute deviations around that median.</p>
        ${maskMetricsMarkup()}
      </section>

      ${unknownMarkup()}

      <section class="limits" aria-labelledby="limits-heading">
        <h2 id="limits-heading">What this page does not claim</h2>
        <p>This map proposes a starting recipe for a synthetic example; it does not complete calibration. A new family with familiar first-read measurements could pass the first-read check, so a refusal is a safety boundary, not proof of identity.</p>
        <p><strong>${FULL_APPROXIMATE_SUITE_INSTRUCTION}</strong> when the claim is unsupported, disagrees with the first read, or is unusually distant.</p>
      </section>
    </main>
    <footer class="site-footer"><div class="page-width"><span>Synthetic head recipe inspection</span><span>Seed 0 · 320 training · 80 test</span></div></footer>`;

  document.querySelector<HTMLSelectElement>("#head-select")!.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    selectedRowId = select.value;
    const row = model.corpus.testRows.find((candidate) => candidate.id === selectedRowId)!;
    claimedType = row.changeType;
    render();
  });

  document.querySelector<HTMLButtonElement>("#random-head")!.addEventListener("click", () => {
    const row = model.randomTestHead();
    selectedRowId = row.id;
    claimedType = row.changeType;
    render();
  });

  document.querySelector<HTMLSelectElement>("#type-select")!.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    claimedType = select.value as ChangeType;
    render();
  });
}

render();
