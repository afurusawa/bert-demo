import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  compareScanCells,
  type ComparisonCell,
  type ScanRun,
} from "./scan-model";
import {
  axisSamplePosition,
  axisValue,
  buildContourPath,
  cellIndexFromPointer,
  cellBounds,
  moveSelection,
  PLOT,
  samplePoint,
  tickValues,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
} from "./plot-geometry";
import {
  BELOW_RESOLUTION_COLOR,
  berColor,
  BOUNDED_IMPROVED_COLOR,
  BOUNDED_UNCERTAIN_COLOR,
  BOUNDED_WORSENED_COLOR,
  differenceColor,
  ZERO_ERROR_COLOR,
} from "./plot-colors";
import { formatBer, formatNumber, formatSigned } from "./formatters";

type ComparisonPlotMode = "contours" | "difference";

interface ComparisonPlotCell {
  phaseIndex: number;
  thresholdIndex: number;
  phasePs: number;
  phaseUi: number;
  thresholdMv: number;
  baselineErrors: number;
  laterErrors: number;
  comparison: ComparisonCell;
}

interface ComparisonPlotData {
  cells: ComparisonPlotCell[];
  baselineContourPath: string;
  laterContourPath: string;
  belowResolutionPath: string;
  boundedPath: string;
}

function buildCellMarkerPath(
  cells: ComparisonPlotCell[],
  phaseSteps: number,
  thresholdSteps: number,
  kind: ComparisonCell["kind"],
): string {
  const pathParts: string[] = [];

  for (const cell of cells) {
    if (cell.comparison.kind !== kind) {
      continue;
    }

    const bounds = cellBounds(cell.phaseIndex, cell.thresholdIndex, phaseSteps, thresholdSteps);
    if (kind === "below-resolution") {
      const markSize = Math.min(2.5, bounds.width / 4, bounds.height / 4);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      pathParts.push(
        `M ${(centerX - markSize).toFixed(2)} ${centerY.toFixed(2)} L ${(centerX + markSize).toFixed(2)} ${centerY.toFixed(2)}`,
        `M ${centerX.toFixed(2)} ${(centerY - markSize).toFixed(2)} L ${centerX.toFixed(2)} ${(centerY + markSize).toFixed(2)}`,
      );
      continue;
    }

    pathParts.push(
      `M ${(bounds.x + 1).toFixed(2)} ${(bounds.y + 1).toFixed(2)} H ${(bounds.x + bounds.width - 1).toFixed(2)}`,
      `M ${(bounds.x + 1).toFixed(2)} ${(bounds.y + 1).toFixed(2)} V ${(bounds.y + bounds.height - 1).toFixed(2)}`,
    );
  }

  return pathParts.join(" ");
}

function buildComparisonPlotData(baseline: ScanRun, later: ScanRun): ComparisonPlotData {
  const { phase, threshold, bitsTested } = baseline.sweep;
  const unitIntervalPs = 1_000 / baseline.dataRateGbps;
  const cells: ComparisonPlotCell[] = [];
  const baselineUpperBounds: number[] = [];
  const laterUpperBounds: number[] = [];

  for (let thresholdIndex = 0; thresholdIndex < threshold.steps; thresholdIndex += 1) {
    for (let phaseIndex = 0; phaseIndex < phase.steps; phaseIndex += 1) {
      const index = thresholdIndex * phase.steps + phaseIndex;
      const baselineCell = baseline.cells[index];
      const laterCell = later.cells[index];
      const comparison = compareScanCells(baselineCell, laterCell, bitsTested);
      baselineUpperBounds.push(comparison.baseline.upperConfidenceBer);
      laterUpperBounds.push(comparison.later.upperConfidenceBer);
      cells.push({
        phaseIndex,
        thresholdIndex,
        phasePs: axisValue(phase, phaseIndex),
        phaseUi: axisValue(phase, phaseIndex) / unitIntervalPs,
        thresholdMv: axisValue(threshold, thresholdIndex),
        baselineErrors: baselineCell.errors,
        laterErrors: laterCell.errors,
        comparison,
      });
    }
  }

  return {
    cells,
    baselineContourPath: buildContourPath(baselineUpperBounds, phase.steps, threshold.steps),
    laterContourPath: buildContourPath(laterUpperBounds, phase.steps, threshold.steps),
    belowResolutionPath: buildCellMarkerPath(cells, phase.steps, threshold.steps, "below-resolution"),
    boundedPath: buildCellMarkerPath(cells, phase.steps, threshold.steps, "bounded"),
  };
}

function differenceCellColor(cell: ComparisonPlotCell): string {
  const { comparison } = cell;
  if (comparison.kind === "below-resolution") {
    return BELOW_RESOLUTION_COLOR;
  }
  if (comparison.kind === "bounded") {
    if (comparison.boundDirection === "improved") {
      return BOUNDED_IMPROVED_COLOR;
    }
    if (comparison.boundDirection === "worsened") {
      return BOUNDED_WORSENED_COLOR;
    }
    return BOUNDED_UNCERTAIN_COLOR;
  }

  return differenceColor(comparison.logBerDelta ?? 0);
}

function drawCanvas(
  canvas: HTMLCanvasElement,
  cells: ComparisonPlotCell[],
  phaseSteps: number,
  thresholdSteps: number,
  mode: ComparisonPlotMode,
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = VIEWBOX_WIDTH * devicePixelRatio;
  canvas.height = VIEWBOX_HEIGHT * devicePixelRatio;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT);
  context.fillStyle = "#f7f9f8";
  context.fillRect(PLOT.left, PLOT.top, PLOT.width, PLOT.height);

  const cellWidth = PLOT.width / phaseSteps;
  const cellHeight = PLOT.height / thresholdSteps;
  for (const cell of cells) {
    const bounds = cellBounds(cell.phaseIndex, cell.thresholdIndex, phaseSteps, thresholdSteps);
    if (mode === "contours") {
      context.fillStyle = cell.comparison.baseline.isCensored
        ? ZERO_ERROR_COLOR
        : berColor(cell.comparison.baseline.upperConfidenceBer);
    } else {
      context.fillStyle = differenceCellColor(cell);
    }
    context.fillRect(bounds.x, bounds.y, cellWidth + 0.35, cellHeight + 0.35);
  }
}

function PlotAxes({
  baseline,
  mode,
  plotData,
  selectedCell,
  selectedIndex,
  onSelect,
}: {
  baseline: ScanRun;
  mode: ComparisonPlotMode;
  plotData: ComparisonPlotData;
  selectedCell: ComparisonPlotCell;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const phaseTicks = tickValues(baseline.sweep.phase);
  const thresholdTicks = tickValues(baseline.sweep.threshold);
  const selectedPoint = samplePoint(
    selectedCell.phaseIndex,
    selectedCell.thresholdIndex,
    baseline.sweep.phase.steps,
    baseline.sweep.threshold.steps,
  );
  const selectedBounds = cellBounds(
    selectedCell.phaseIndex,
    selectedCell.thresholdIndex,
    baseline.sweep.phase.steps,
    baseline.sweep.threshold.steps,
  );

  const handlePointerMove = (event: PointerEvent<SVGRectElement>) => {
    const nextIndex = cellIndexFromPointer(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      baseline.sweep.phase.steps,
      baseline.sweep.threshold.steps,
    );
    if (nextIndex !== null) {
      onSelect(nextIndex);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    const nextIndex = moveSelection(
      selectedIndex,
      event.key,
      baseline.sweep.phase.steps,
      baseline.sweep.threshold.steps,
    );
    if (nextIndex !== null) {
      event.preventDefault();
      onSelect(nextIndex);
    }
  };

  return (
    <svg
      className="plot-overlay"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <rect
        className="plot-hit-area"
        x={PLOT.left}
        y={PLOT.top}
        width={PLOT.width}
        height={PLOT.height}
        tabIndex={0}
        role="application"
        aria-label={`${mode === "contours" ? "Contour overlay" : "BER difference map"}. Use arrow keys to move between cells.`}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
      />
      {phaseTicks.map((tick) => {
        const x = PLOT.left + axisSamplePosition(tick.position, baseline.sweep.phase.steps) * PLOT.width;
        return (
          <g key={`phase-${tick.position}`}>
            <line className="plot-gridline" x1={x} y1={PLOT.top} x2={x} y2={PLOT.top + PLOT.height} />
            <line className="plot-tick" x1={x} y1={PLOT.top + PLOT.height} x2={x} y2={PLOT.top + PLOT.height + 5} />
            <text className="plot-tick-label" x={x} y={PLOT.top + PLOT.height + 21} textAnchor="middle">
              {formatSigned(tick.value)}
            </text>
          </g>
        );
      })}
      {thresholdTicks.map((tick) => {
        const y = PLOT.top + (1 - axisSamplePosition(tick.position, baseline.sweep.threshold.steps)) * PLOT.height;
        return (
          <g key={`threshold-${tick.position}`}>
            <line className="plot-gridline" x1={PLOT.left} y1={y} x2={PLOT.left + PLOT.width} y2={y} />
            <line className="plot-tick" x1={PLOT.left - 5} y1={y} x2={PLOT.left} y2={y} />
            <text className="plot-tick-label" x={PLOT.left - 10} y={y + 4} textAnchor="end">
              {formatSigned(tick.value)}
            </text>
          </g>
        );
      })}
      <rect className="plot-border" x={PLOT.left} y={PLOT.top} width={PLOT.width} height={PLOT.height} />
      {mode === "contours" ? (
        <>
          {plotData.baselineContourPath && <path className="comparison-contour-baseline-halo" d={plotData.baselineContourPath} />}
          {plotData.baselineContourPath && <path className="comparison-contour-baseline" d={plotData.baselineContourPath} />}
          {plotData.laterContourPath && <path className="comparison-contour-later-halo" d={plotData.laterContourPath} />}
          {plotData.laterContourPath && <path className="comparison-contour-later" d={plotData.laterContourPath} />}
          <g className="contour-label comparison-contour-label" transform={`translate(${PLOT.left + PLOT.width - 188} ${PLOT.top + 12})`}>
            <rect width="178" height="43" rx="3" />
            <line x1="10" y1="13" x2="24" y2="13" className="comparison-label-line baseline-line" />
            <text x="31" y="16">Baseline lane 3</text>
            <line x1="10" y1="30" x2="24" y2="30" className="comparison-label-line later-line" />
            <text x="31" y="33">Later unit lane 3</text>
          </g>
        </>
      ) : (
        <>
          {plotData.belowResolutionPath && <path className="comparison-below-resolution-marking" d={plotData.belowResolutionPath} />}
          {plotData.boundedPath && <path className="comparison-bounded-marking" d={plotData.boundedPath} />}
          <g className="contour-label comparison-difference-label" transform={`translate(${PLOT.left + PLOT.width - 190} ${PLOT.top + 12})`}>
            <rect width="180" height="27" rx="3" />
            <text x="10" y="12">log10(later / baseline)</text>
            <text x="10" y="22">point estimates when measured</text>
          </g>
        </>
      )}
      <line
        className="plot-crosshair-shadow"
        x1={PLOT.left}
        y1={selectedPoint.y}
        x2={PLOT.left + PLOT.width}
        y2={selectedPoint.y}
      />
      <line
        className="plot-crosshair-shadow"
        x1={selectedPoint.x}
        y1={PLOT.top}
        x2={selectedPoint.x}
        y2={PLOT.top + PLOT.height}
      />
      <line
        className="plot-crosshair"
        x1={PLOT.left}
        y1={selectedPoint.y}
        x2={PLOT.left + PLOT.width}
        y2={selectedPoint.y}
      />
      <line
        className="plot-crosshair"
        x1={selectedPoint.x}
        y1={PLOT.top}
        x2={selectedPoint.x}
        y2={PLOT.top + PLOT.height}
      />
      <rect
        className="plot-selected-cell"
        x={selectedBounds.x}
        y={selectedBounds.y}
        width={selectedBounds.width}
        height={selectedBounds.height}
      />
      <circle className="plot-crosshair-point" cx={selectedPoint.x} cy={selectedPoint.y} r="4" />
      <text className="plot-axis-title" x={PLOT.left + PLOT.width / 2} y={VIEWBOX_HEIGHT - 14} textAnchor="middle">
        Phase (ps)
      </text>
      <text
        className="plot-axis-title"
        transform={`translate(17 ${PLOT.top + PLOT.height / 2}) rotate(-90)`}
        textAnchor="middle"
      >
        Threshold voltage (mV)
      </text>
    </svg>
  );
}

function ComparisonPlotPanel({
  baseline,
  mode,
  plotData,
  selectedCell,
  selectedIndex,
  onSelect,
}: {
  baseline: ScanRun;
  mode: ComparisonPlotMode;
  plotData: ComparisonPlotData;
  selectedCell: ComparisonPlotCell;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawCanvas(
        canvasRef.current,
        plotData.cells,
        baseline.sweep.phase.steps,
        baseline.sweep.threshold.steps,
        mode,
      );
    }
  }, [baseline.sweep.phase.steps, baseline.sweep.threshold.steps, mode, plotData]);

  return (
    <article className="comparison-plot-panel">
      <div className="comparison-plot-panel-heading">
        <div>
          <p className="eyebrow">{mode === "contours" ? "SHARED AXES" : "DIFFERENCE MAP"}</p>
          <h3>{mode === "contours" ? "Target contours" : "Log-BER change"}</h3>
        </div>
        <span>{mode === "contours" ? "BER 1e-6 · 95%" : "decades"}</span>
      </div>
      <div
        className="comparison-plot-stage"
        aria-label={mode === "contours"
          ? "Baseline and later lane 3 BER 1e-6 contours on shared phase and threshold-voltage axes"
          : "Log-BER difference map for baseline and later lane 3 scans"}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <PlotAxes
          baseline={baseline}
          mode={mode}
          plotData={plotData}
          selectedCell={selectedCell}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
        />
      </div>
    </article>
  );
}

function ReadoutValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="comparison-readout-value">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function changeSummary(cell: ComparisonPlotCell): ReactNode {
  const { comparison } = cell;
  if (comparison.kind === "below-resolution") {
    return <strong>Below resolution in both runs</strong>;
  }
  if (comparison.kind === "exact") {
    return (
      <>
        <strong>{formatSigned(comparison.logBerDelta ?? 0, 2)} decades</strong>
        <small>Exact point-estimate change</small>
      </>
    );
  }
  if (comparison.boundDirection === "worsened") {
    return (
      <>
        <strong>Worsened by at least {formatNumber(comparison.boundMagnitude ?? 0, 2)} decades</strong>
        <small>One-sided 95% bound on the censored run</small>
      </>
    );
  }
  if (comparison.boundDirection === "improved") {
    return (
      <>
        <strong>Improved by at least {formatNumber(comparison.boundMagnitude ?? 0, 2)} decades</strong>
        <small>One-sided 95% bound on the censored run</small>
      </>
    );
  }

  const boundLabel = comparison.baseline.isCensored ? "at least" : "at most";

  return (
    <>
      <strong>
        Change is {boundLabel} {formatSigned(comparison.logBerDelta ?? 0, 2)} decades
      </strong>
      <small>Direction not established; one-sided 95% bound on the censored run</small>
    </>
  );
}

function ComparisonReadout({
  baseline,
  later,
  cell,
}: {
  baseline: ScanRun;
  later: ScanRun;
  cell: ComparisonPlotCell;
}) {
  const baselineObserved = cell.comparison.baseline.observedBer;
  const laterObserved = cell.comparison.later.observedBer;

  return (
    <section className="comparison-readout" aria-labelledby="comparison-readout-title">
      <div className="comparison-readout-heading">
        <div>
          <p className="eyebrow">CROSSHAIR READOUT</p>
          <h3 id="comparison-readout-title">Selected comparison cell</h3>
        </div>
        <span className="plot-cell-index">
          {cell.phaseIndex + 1} / {cell.thresholdIndex + 1}
        </span>
      </div>
      <div className="comparison-coordinate-grid">
        <div className="plot-coordinate">
          <span>Phase</span>
          <strong>{formatSigned(cell.phasePs)} <small>ps</small></strong>
          <em>{formatSigned(cell.phaseUi, 3)} UI</em>
        </div>
        <div className="plot-coordinate">
          <span>Threshold</span>
          <strong>{formatSigned(cell.thresholdMv)} <small>mV</small></strong>
          <em>sample voltage</em>
        </div>
      </div>
      <div className={`comparison-change-summary comparison-change-${cell.comparison.kind}`}>
        {changeSummary(cell)}
      </div>
      <div className="comparison-readout-columns">
        <div>
          <p className="comparison-run-label">Baseline lane 3 <span>{baseline.startedAt.slice(0, 10)}</span></p>
          <ReadoutValue label="Errors">{formatNumber(cell.baselineErrors, 0)}</ReadoutValue>
          <ReadoutValue label="Tested bits">{formatNumber(baseline.sweep.bitsTested, 0)}</ReadoutValue>
          <ReadoutValue label="Observed BER">{baselineObserved === null ? "No errors observed" : formatBer(baselineObserved)}</ReadoutValue>
          <ReadoutValue label="95% upper bound">{formatBer(cell.comparison.baseline.upperConfidenceBer)}</ReadoutValue>
        </div>
        <div>
          <p className="comparison-run-label">Later unit lane 3 <span>{later.startedAt.slice(0, 10)}</span></p>
          <ReadoutValue label="Errors">{formatNumber(cell.laterErrors, 0)}</ReadoutValue>
          <ReadoutValue label="Tested bits">{formatNumber(later.sweep.bitsTested, 0)}</ReadoutValue>
          <ReadoutValue label="Observed BER">{laterObserved === null ? "No errors observed" : formatBer(laterObserved)}</ReadoutValue>
          <ReadoutValue label="95% upper bound">{formatBer(cell.comparison.later.upperConfidenceBer)}</ReadoutValue>
        </div>
      </div>
      <p className="comparison-readout-note">
        {cell.comparison.kind === "below-resolution"
          ? "Both runs observed zero errors. The map keeps this cell neutral instead of inventing a zero-to-zero BER change."
          : cell.comparison.kind === "bounded"
            ? "A zero-error cell is censored. The at-least comparison uses its one-sided 95% upper confidence bound, not 1/N."
            : "Exact differences compare the two observed point estimates in log10(BER) decades."}
      </p>
    </section>
  );
}

function ComparisonLegend() {
  return (
    <section className="comparison-legend" aria-labelledby="comparison-legend-title">
      <div className="plot-sidebar-heading">
        <p className="eyebrow">READING THE COMPARISON</p>
        <h3 id="comparison-legend-title">Difference map key</h3>
      </div>
      <div className="comparison-legend-grid">
        <div className="legend-key-row"><span className="legend-swatch comparison-improved-swatch" aria-hidden="true" /><span><strong>Improved</strong><small>negative log-BER change</small></span></div>
        <div className="legend-key-row"><span className="legend-swatch comparison-worsened-swatch" aria-hidden="true" /><span><strong>Worsened</strong><small>positive log-BER change</small></span></div>
        <div className="legend-key-row"><span className="legend-swatch comparison-bounded-swatch" aria-hidden="true" /><span><strong>Bounded</strong><small>one run has zero errors</small></span></div>
        <div className="legend-key-row"><span className="legend-swatch comparison-below-swatch" aria-hidden="true" /><span><strong>Below resolution in both</strong><small>separate neutral treatment</small></span></div>
      </div>
      <p className="legend-note">
        Exact map values are later minus baseline in log10(BER). Bounded cells use the censored run's confidence-qualified upper bound.
      </p>
    </section>
  );
}

export function ComparisonPlot({ baseline, later }: { baseline: ScanRun; later: ScanRun }) {
  const plotData = useMemo(() => buildComparisonPlotData(baseline, later), [baseline, later]);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const phaseIndex = Math.floor(baseline.sweep.phase.steps / 2);
    const thresholdIndex = Math.floor(baseline.sweep.threshold.steps / 2);
    return thresholdIndex * baseline.sweep.phase.steps + phaseIndex;
  });
  const selectedCell = plotData.cells[selectedIndex] ?? plotData.cells[0];

  return (
    <div className="comparison-content">
      <div className="comparison-plot-grid">
        <ComparisonPlotPanel
          baseline={baseline}
          mode="contours"
          plotData={plotData}
          selectedCell={selectedCell}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
        <ComparisonPlotPanel
          baseline={baseline}
          mode="difference"
          plotData={plotData}
          selectedCell={selectedCell}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      </div>
      <div className="comparison-detail-grid">
        <ComparisonReadout baseline={baseline} later={later} cell={selectedCell} />
        <ComparisonLegend />
      </div>
    </div>
  );
}
