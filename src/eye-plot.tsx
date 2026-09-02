import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  deriveCell,
  type DerivedCell,
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
import { berColor, ZERO_ERROR_COLOR } from "./plot-colors";
import { formatBer, formatNumber, formatSigned } from "./formatters";

interface PlotCell {
  phaseIndex: number;
  thresholdIndex: number;
  phasePs: number;
  phaseUi: number;
  thresholdMv: number;
  errors: number;
  derived: DerivedCell;
}

interface PlotData {
  cells: PlotCell[];
  zeroErrorPath: string;
  contourPath: string;
}

function buildZeroErrorPath(cells: PlotCell[], phaseSteps: number, thresholdSteps: number): string {
  const pathParts: string[] = [];

  for (const cell of cells) {
    if (!cell.derived.isCensored) {
      continue;
    }

    const bounds = cellBounds(cell.phaseIndex, cell.thresholdIndex, phaseSteps, thresholdSteps);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const markSize = Math.min(2.5, bounds.width / 4, bounds.height / 4);
    pathParts.push(
      `M ${(centerX - markSize).toFixed(2)} ${centerY.toFixed(2)} L ${(centerX + markSize).toFixed(2)} ${centerY.toFixed(2)}`,
      `M ${centerX.toFixed(2)} ${(centerY - markSize).toFixed(2)} L ${centerX.toFixed(2)} ${(centerY + markSize).toFixed(2)}`,
    );
  }

  return pathParts.join(" ");
}

function buildPlotData(run: ScanRun): PlotData {
  const { phase, threshold } = run.sweep;
  const phaseUi = 1_000 / run.dataRateGbps;
  const cells: PlotCell[] = [];
  const upperBounds: number[] = [];

  for (let thresholdIndex = 0; thresholdIndex < threshold.steps; thresholdIndex += 1) {
    for (let phaseIndex = 0; phaseIndex < phase.steps; phaseIndex += 1) {
      const rawCell = run.cells[thresholdIndex * phase.steps + phaseIndex];
      const derived = deriveCell(rawCell, run.sweep.bitsTested);
      upperBounds.push(derived.upperConfidenceBer);
      cells.push({
        phaseIndex,
        thresholdIndex,
        phasePs: axisValue(phase, phaseIndex),
        phaseUi: axisValue(phase, phaseIndex) / phaseUi,
        thresholdMv: axisValue(threshold, thresholdIndex),
        errors: rawCell.errors,
        derived,
      });
    }
  }

  return {
    cells,
    zeroErrorPath: buildZeroErrorPath(cells, phase.steps, threshold.steps),
    contourPath: buildContourPath(upperBounds, phase.steps, threshold.steps),
  };
}

function ReadoutValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="plot-readout-value">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function PlotReadout({ cell, bitsTested }: { cell: PlotCell; bitsTested: number }) {
  return (
    <section className="plot-readout" aria-labelledby="plot-readout-title">
      <div className="plot-readout-heading">
        <div>
          <p className="eyebrow">CROSSHAIR READOUT</p>
          <h3 id="plot-readout-title">Selected cell</h3>
        </div>
        <span className="plot-cell-index">
          {cell.phaseIndex + 1} / {cell.thresholdIndex + 1}
        </span>
      </div>
      <div className="plot-coordinate-grid">
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
      <div className="plot-readout-list">
        <ReadoutValue label="Errors">{formatNumber(cell.errors, 0)}</ReadoutValue>
        <ReadoutValue label="Tested bits">{formatNumber(bitsTested, 0)}</ReadoutValue>
        <ReadoutValue label="Observed BER">
          {cell.derived.observedBer === null ? "No errors observed" : formatBer(cell.derived.observedBer)}
        </ReadoutValue>
        <ReadoutValue label="One-sided 95% upper bound">
          {formatBer(cell.derived.upperConfidenceBer)}
        </ReadoutValue>
      </div>
      <p className="plot-readout-note">
        {cell.derived.isCensored
          ? "Zero errors is a censored result; the bound is the statistical claim."
          : "Observed BER is the point estimate; the bound is used for the contour."}
      </p>
    </section>
  );
}

function PlotLegend({ bitsTested }: { bitsTested: number }) {
  return (
    <section className="plot-legend" aria-labelledby="plot-legend-title">
      <div className="plot-sidebar-heading">
        <p className="eyebrow">LEGEND</p>
        <h3 id="plot-legend-title">95% BER upper bound</h3>
      </div>
      <div className="legend-scale" aria-label="Sequential BER scale from 1e-9 to 1e-1">
        <div className="legend-gradient" />
        <div className="legend-ticks" aria-hidden="true">
          <span>1e-9</span>
          <span>1e-7</span>
          <span>1e-5</span>
          <span>1e-3</span>
          <span>1e-1</span>
        </div>
      </div>
      <p className="legend-tested-bits">N = {formatNumber(bitsTested, 0)} tested bits per point</p>
      <div className="legend-key">
        <div className="legend-key-row">
          <span className="legend-swatch zero-error-swatch" aria-hidden="true" />
          <span>
            <strong>Zero errors observed</strong>
            <small>flat color, not zero BER</small>
          </span>
        </div>
        <div className="legend-key-row">
          <span className="legend-swatch contour-swatch" aria-hidden="true" />
          <span>
            <strong>Target contour</strong>
            <small>BER 1e-6 at one-sided 95%</small>
          </span>
        </div>
      </div>
      <p className="legend-note">
        Heat colors show one-sided 95% upper bounds. For zero errors, the bound is 1 − 0.05^(1/N), about 3/N.
        1/N is only an internal positive color clamp, not a measurement limit.
      </p>
    </section>
  );
}

function EyeHeatmap({ run }: { run: ScanRun }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const phaseIndex = Math.floor(run.sweep.phase.steps / 2);
    const thresholdIndex = Math.floor(run.sweep.threshold.steps / 2);
    return thresholdIndex * run.sweep.phase.steps + phaseIndex;
  });
  const plotData = useMemo(() => buildPlotData(run), [run]);
  const selectedCell = plotData.cells[selectedIndex] ?? plotData.cells[0];
  const phaseTicks = tickValues(run.sweep.phase);
  const thresholdTicks = tickValues(run.sweep.threshold);
  const selectedPoint = samplePoint(
    selectedCell.phaseIndex,
    selectedCell.thresholdIndex,
    run.sweep.phase.steps,
    run.sweep.threshold.steps,
  );
  const selectedBounds = cellBounds(
    selectedCell.phaseIndex,
    selectedCell.thresholdIndex,
    run.sweep.phase.steps,
    run.sweep.threshold.steps,
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VIEWBOX_WIDTH * devicePixelRatio;
    canvas.height = VIEWBOX_HEIGHT * devicePixelRatio;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT);
    context.fillStyle = "#f7f9f8";
    context.fillRect(PLOT.left, PLOT.top, PLOT.width, PLOT.height);

    const cellWidth = PLOT.width / run.sweep.phase.steps;
    const cellHeight = PLOT.height / run.sweep.threshold.steps;
    for (const cell of plotData.cells) {
      const bounds = cellBounds(
        cell.phaseIndex,
        cell.thresholdIndex,
        run.sweep.phase.steps,
        run.sweep.threshold.steps,
      );
      context.fillStyle = cell.derived.isCensored ? ZERO_ERROR_COLOR : berColor(cell.derived.upperConfidenceBer);
      context.fillRect(bounds.x, bounds.y, cellWidth + 0.35, cellHeight + 0.35);
    }
  }, [plotData, run.sweep.phase.steps, run.sweep.threshold.steps]);

  const handlePointerMove = (event: PointerEvent<SVGRectElement>) => {
    const nextIndex = cellIndexFromPointer(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      run.sweep.phase.steps,
      run.sweep.threshold.steps,
    );
    if (nextIndex !== null) {
      setSelectedIndex(nextIndex);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    const nextIndex = moveSelection(
      selectedIndex,
      event.key,
      run.sweep.phase.steps,
      run.sweep.threshold.steps,
    );
    if (nextIndex !== null) {
      event.preventDefault();
      setSelectedIndex(nextIndex);
    }
  };

  return (
    <div className="plot-content">
      <div className="plot-stage" aria-label="Eye scan BER heat map with phase and threshold-voltage axes">
        <canvas ref={canvasRef} aria-hidden="true" />
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
            aria-label="Interactive eye scan crosshair. Use arrow keys to move between cells."
            onPointerMove={handlePointerMove}
            onKeyDown={handleKeyDown}
          />
          {phaseTicks.map((tick) => {
            const x = PLOT.left + axisSamplePosition(tick.position, run.sweep.phase.steps) * PLOT.width;
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
            const y = PLOT.top + (1 - axisSamplePosition(tick.position, run.sweep.threshold.steps)) * PLOT.height;
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
          {plotData.zeroErrorPath && <path className="plot-zero-marking" d={plotData.zeroErrorPath} />}
          {plotData.contourPath && <path className="plot-contour-halo" d={plotData.contourPath} />}
          {plotData.contourPath && <path className="plot-contour" d={plotData.contourPath} />}
          <g className="contour-label" transform={`translate(${PLOT.left + PLOT.width - 173} ${PLOT.top + 12})`}>
            <rect width="163" height="27" rx="3" />
            <text x="10" y="12">BER 1e-6</text>
            <text x="10" y="22">one-sided 95% upper bound</text>
          </g>
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
      </div>
      <aside className="plot-sidebar">
        <PlotReadout cell={selectedCell} bitsTested={run.sweep.bitsTested} />
        <PlotLegend bitsTested={run.sweep.bitsTested} />
      </aside>
    </div>
  );
}

export { EyeHeatmap };
