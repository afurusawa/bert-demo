/**
 * Decision-first workspace for the head-calibration demo.
 * Left rail = pick a head and see the verdict. Right pane swaps detail tabs.
 */
import type { ChangeType, DemoModel, HeadInspection } from "./model";
import {
  escapeHtml,
  formatBer,
  formatDistance,
  formatPercent,
  formatRecipeValue,
  maskMetricsTable,
  measurementMarkupGlossed,
  metricMarkup,
  optionMarkup,
  rowOptionMarkup,
  typeLabelPlain,
  FULL_APPROXIMATE_SUITE_INSTRUCTION,
  KNOWN_TYPES,
  REGISTER_NAMES,
} from "./ui";

export type DetailTab = "head" | "settings" | "scores" | "unknown";

function verdictBlock(inspection: HeadInspection): string {
  const refused = inspection.proposal.status === "refused";
  const title = refused ? "No mapped start" : "Starting recipe ready to test";
  const next = refused
    ? `Next step: ${FULL_APPROXIMATE_SUITE_INSTRUCTION}`
    : "Next step: run the calibration suite on these settings. A start is a guess until the suite checks it.";
  return `
    <div class="verdict ${refused ? "verdict-refuse" : "verdict-ok"}">
      <p class="verdict-kicker">${refused ? "Map refused" : "Map proposal"}</p>
      <h2>${title}</h2>
      <p>${escapeHtml(inspection.proposal.message)}</p>
      <p class="verdict-next">${escapeHtml(next)}</p>
    </div>`;
}

function settingChips(model: DemoModel, inspection: HeadInspection): string {
  if (inspection.proposal.status === "refused") {
    return `<p class="refused-map-note">The map will not suggest which settings to move. ${FULL_APPROXIMATE_SUITE_INSTRUCTION}</p>`;
  }
  const learnedMask =
    inspection.claimedType !== "unknown_family"
      ? model.fitted.types[inspection.claimedType as (typeof KNOWN_TYPES)[number]]?.learnedMask
      : null;
  if (!learnedMask) {
    return `<p class="small-note">No learned move list for this claim.</p>`;
  }
  const hidden = inspection.row.hiddenMask;
  return `
    <div class="setting-legend">
      <span class="chip move">Adjust</span> set from this head's first readings
      ·
      <span class="chip skip">Shared base</span> fill in the common default for that setting
    </div>
    <p class="small-note">Shared base is a lab-wide default estimated from past finished recipes for that register.</p>
    <div class="setting-grid" role="list">
      ${REGISTER_NAMES.map((name, i) => {
        const move = learnedMask[i];
        const truth = hidden[i];
        const match = move === truth;
        const demoRule = truth ? "Adjust" : "Shared base";
        const compare = match ? "Matches demo rule" : `Demo rule: ${demoRule}`;
        return `<div class="setting-card ${move ? "move" : "skip"}" role="listitem">
          <strong>${name}</strong>
          <span>${move ? "Adjust" : "Shared base"}</span>
          <em>${compare}</em>
        </div>`;
      }).join("")}
    </div>`;
}

function recipeValues(recipe: readonly number[]): string {
  return `<div class="recipe-values">${recipe
    .map((v, i) => `<span><em>${REGISTER_NAMES[i]}</em>${formatRecipeValue(v)}</span>`)
    .join("")}</div>`;
}

function recipeCards(inspection: HeadInspection): string {
  const proposal = inspection.proposal;
  const mapped = proposal.mappedStart ? [...proposal.mappedStart] : null;
  const copyLast = [...proposal.copyLast];
  const sameType = proposal.sameTypeMean ? [...proposal.sameTypeMean] : null;
  const ideal = [...inspection.row.hiddenTrueRecipe];

  const proposalCard = mapped
    ? `<article class="recipe-card recipe-card-primary">
        <p class="recipe-kicker">What the map proposes</p>
        <h3>Proposed start</h3>
        <p>Built from past finished recipes for this change type, plus this head's four first readings. The calibration suite still has to check these numbers before they count as a finished recipe.</p>
        ${recipeValues(mapped)}
      </article>`
    : `<article class="recipe-card unavailable recipe-card-primary">
        <p class="recipe-kicker">What the map proposes</p>
        <h3>No proposed start</h3>
        <p>The map refused. ${FULL_APPROXIMATE_SUITE_INSTRUCTION} On the Scores tab, refused known heads are scored with "reuse last head" so the average still covers every head.</p>
      </article>`;

  const baselines = `
    <div class="recipe-baseline-block">
      <h4>Naive starts we compare against</h4>
      <p>Lazy alternatives used only for scoring. The Scores tab asks whether the map lands closer than these.</p>
      <div class="recipe-cards recipe-cards-compact">
        <article class="recipe-card recipe-card-baseline">
          <h3>${mapped ? "Reuse last head" : "Reuse last head (fallback starting point)"}</h3>
          <p>${
            mapped
              ? "Copy one finished recipe onto every new head. Ignores this head's change type and first readings."
              : "Fallback starting point after refusal. Copy one finished recipe onto every new head for scoring. Ignores this head's change type and first readings."
          }</p>
          ${recipeValues(copyLast)}
        </article>
        <article class="recipe-card recipe-card-baseline ${sameType ? "" : "unavailable"}">
          <h3>Average for this change</h3>
          <p>${
            sameType
              ? "Mean of finished training recipes tagged with this claimed change. Uses the change type, but ignores this head's first readings."
              : "No average available for this claim."
          }</p>
          ${sameType ? recipeValues(sameType) : ""}
        </article>
      </div>
    </div>`;

  const idealCard = `
    <article class="recipe-card recipe-card-demo">
      <p class="recipe-kicker">Demo only</p>
      <h3>Hidden ideal settings</h3>
      <p>In this invented world we already know the scoring target register values. The map never trains on them. This row exists only so the demo can measure distance.</p>
      ${recipeValues(ideal)}
    </article>`;

  return `${proposalCard}${baselines}${idealCard}`;
}

function tabButton(id: DetailTab, current: DetailTab, label: string): string {
  return `<button type="button" class="pane-tab" data-detail-tab="${id}" aria-selected="${id === current}">${label}</button>`;
}

function paneContent(
  model: DemoModel,
  inspection: HeadInspection,
  tab: DetailTab,
): string {
  const knownCount = model.evaluation.knownHeads.length;
  const aggregates = model.evaluation.aggregates;
  const sameTypeL2 = aggregates.sameTypeMean.meanL2Distance;
  const mappedL2 = aggregates.mappedWithFallback.meanL2Distance;

  if (tab === "head") {
    const finishedBerNote =
      inspection.row.changeType !== "unknown_family"
        ? `<p class="small-note">After a finished calibration suite on this invented head, bit error rate (BER) landed at ${formatBer(inspection.row.finalBer)}. BER is how often a written bit comes back wrong. Lower is better. That finished number is separate from the starting-guess scores on the Scores tab.</p>`
        : "";
    return `
      <h3>This test head</h3>
      <p>Tag <strong>${escapeHtml(inspection.row.tag)}</strong>. Actual change <strong>${escapeHtml(typeLabelPlain(inspection.row.changeType))}</strong>. Zone ${inspection.row.zone}.</p>
      <p>You claimed <strong>${escapeHtml(typeLabelPlain(inspection.claimedType))}</strong>. Changing the claim keeps these four first readings fixed.</p>
      <h4 class="read-heading">First readings</h4>
      <p class="read-intro">Quick electrical measurements taken before anyone picks a start recipe. The map uses them to check whether your claimed change type fits, and to estimate which settings to adjust.</p>
      <dl class="facts facts-four plain-facts facts-glossed">${measurementMarkupGlossed(inspection)}</dl>
      ${finishedBerNote}`;
  }

  if (tab === "settings") {
    return `
      <h3>Which settings get a head-specific value?</h3>
      <p>Green settings are adjusted from this head's first readings. Tan settings take the shared base default for that register.</p>
      ${settingChips(model, inspection)}
      <h3 class="spaced">Starting numbers</h3>
      ${recipeCards(inspection)}
      <h3 class="spaced">Mask recovery by change type</h3>
      <p>Threshold used while learning: <strong>${model.fitted.maskThreshold.toFixed(2)}</strong> register counts. A register is marked Adjust when its training variation from the shared base exceeds this threshold.</p>
      ${maskMetricsTable(model)}`;
  }

  if (tab === "scores") {
    return `
      <h3>Which start landed closer?</h3>
      <p>Same ${knownCount} known test heads for every bar. The unknown family is left out. Shorter bars are better.</p>
      ${metricMarkup(model)}
      <p class="small-note">Bars measure distance to the demo's hidden ideal settings. Reuse last head and average for this change are the lazy baselines from the Settings tab. When the map refuses a known head, "learned start" scoring uses reuse-last-head so every head stays in the average.</p>
      <p class="small-note">Learned start with fallback is ${formatPercent(mappedL2 / sameTypeL2)} of the average-for-this-change distance (${formatDistance(mappedL2)} vs ${formatDistance(sameTypeL2)}). That comparison only describes this invented world.</p>`;
  }

  const unknown = model.evaluation.unknownExample;
  return `
    <h3>Unknown family</h3>
    <p>One test head uses a change family the map never trained on. It stays out of the average scores above.</p>
    <div class="verdict verdict-refuse">
      <p class="verdict-kicker">Always refused here</p>
      <p>${escapeHtml(unknown.proposal.message)}</p>
    </div>
    <table class="checks-table">
      <caption>Same first readings under every claim</caption>
      <thead><tr><th scope="col">Claimed change</th><th scope="col">Decision</th><th scope="col">Why</th></tr></thead>
      <tbody>${model.evaluation.unknownFamilyChecks
        .map(
          (check) =>
            `<tr><th scope="row">${escapeHtml(typeLabelPlain(check.claimedType))}</th><td><strong>Refused</strong></td><td class="check-reason">${escapeHtml(check.proposal.message)}</td></tr>`,
        )
        .join("")}</tbody>
    </table>`;
}

export function renderPage(
  model: DemoModel,
  selectedRowId: string,
  claimedType: ChangeType,
  detailTab: DetailTab,
): string {
  const inspection = model.inspectTestHead(selectedRowId, claimedType);
  const knownCount = model.evaluation.knownHeads.length;
  const acceptedCount = model.evaluation.acceptedCount;

  return `
    <header class="site-header">
      <div class="page-width header-inner">
        <div>
          <p class="eyebrow">Synthetic demo</p>
          <h1>What should we do with this head?</h1>
        </div>
        <div class="header-actions"><a class="guide-link" href="./walkthrough.html">How it works</a><span class="header-badge">SEED 0 · OFFLINE</span></div>
      </div>
    </header>
    <div class="notice"><div class="page-width"><strong>Invented data.</strong> No instrument is connected. A closer start here is still only a starting guess for made-up heads.</div></div>
    <main class="page-width page-main">
      <p class="lead">Pick a test head and a claimed change. The map either offers a starting recipe or tells you to run the lab's usual shorter suite.</p>

      <div class="workspace">
        <aside class="rail" aria-label="Head controls">
          <h2>Pick a head</h2>
          <p class="acceptance-summary rail-stat">Map offered a start for ${acceptedCount} of ${knownCount} known heads (${formatPercent(model.evaluation.acceptanceRate)}).</p>
          <label class="control-field" for="head-select"><span>Test head</span><select id="head-select">${rowOptionMarkup(model, selectedRowId)}</select></label>
          <button class="action-button" id="random-head" type="button">Random test head</button>
          <label class="control-field" for="type-select"><span>Change you claim</span><select id="type-select">${optionMarkup(claimedType)}</select></label>
          <p class="small-note">Changing the claim keeps the same head and the same four first readings.</p>
          ${verdictBlock(inspection)}
        </aside>

        <section class="pane" aria-label="Details">
          <div class="pane-tabs" role="tablist">
            ${tabButton("head", detailTab, "This head")}
            ${tabButton("settings", detailTab, "Settings")}
            ${tabButton("scores", detailTab, "Scores")}
            ${tabButton("unknown", detailTab, "Unknown family")}
          </div>
          <div class="pane-body">
            ${paneContent(model, inspection, detailTab)}
          </div>
        </section>
      </div>

      <section class="limits" aria-labelledby="limits-heading">
        <h2 id="limits-heading">Limits</h2>
        <p>The map only proposes a start for an invented example. The suite still has to finish calibration. A new family with familiar first readings could still slip through, so treat refusal as a safety cut.</p>
      </section>
    </main>
    <footer class="site-footer"><div class="page-width"><span>Synthetic head recipe inspection</span><span>Seed 0 · 320 training · 80 test</span></div></footer>`;
}
