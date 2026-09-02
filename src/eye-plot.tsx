import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  deriveCell,
  EYE_TARGET_BER,
  type AxisSpec,
  type DerivedCell,
  type ScanRun,
} from "./scan-model";

const VIEWBOX_WIDTH = 1_000;
const VIEWBOX_HEIGHT = 520;
const PLOT = {
  left: 72,
  top: 20,
  width: 884,
  height: 424,
} as const;
const COLOR_MIN_BER = 1e-9;
const COLOR_MAX_BER = 1e-1;
const ZERO_ERROR_COLOR = "#edf2ef";
const VIRIDIS_STOPS = [
  "#440154",
  "#482878",
  "#3e4989",
  "#31688e",
  "#26828e",
  "#35b779",
  "#6ece58",
  "#fde725",
] as const;

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

interface Point {
  x: number;
  y: number;
}

function axisValue(axis: AxisSpec, index: number): number {
  if (axis.steps <= 1) {
    return axis.min;
  }

  return axis.min + ((axis.max - axis.min) * index) / (axis.steps - 1);
}

function samplePoint(phaseIndex: number, thresholdIndex: number, phaseSteps: number, thresholdSteps: number): Point {
  const phasePosition = (phaseIndex + 0.5) / Math.max(phaseSteps, 1);
  const thresholdPosition = (thresholdIndex + 0.5) / Math.max(thresholdSteps, 1);

  return {
    x: PLOT.left + phasePosition * PLOT.width,
    y: PLOT.top + (1 - thresholdPosition) * PLOT.height,
  };
}

function cellBounds(phaseIndex: number, thresholdIndex: number, phaseSteps: number, thresholdSteps: number) {
  const cellWidth = PLOT.width / Math.max(phaseSteps, 1);
  const cellHeight = PLOT.height / Math.max(thresholdSteps, 1);

  return {
    x: PLOT.left + phaseIndex * cellWidth,
    y: PLOT.top + (thresholdSteps - thresholdIndex - 1) * cellHeight,
    width: cellWidth,
    height: cellHeight,
  };
}

function interpolateLogCrossing(firstValue: number, secondValue: number): number {
  const firstLog = Math.log10(Math.max(firstValue, Number.MIN_VALUE));
  const secondLog = Math.log10(Math.max(secondValue, Number.MIN_VALUE));
  const targetLog = Math.log10(EYE_TARGET_BER);
  const denominator = secondLog - firstLog;

  if (Math.abs(denominator) < Number.EPSILON) {
    return 0.5;
  }

  return Math.min(1, Math.max(0, (targetLog - firstLog) / denominator));
}

function contourEdge(
  firstPoint: Point,
  firstValue: number,
  secondPoint: Point,
  secondValue: number,
): Point | null {
  const firstPassing = firstValue <= EYE_TARGET_BER;
  const secondPassing = secondValue <= EYE_TARGET_BER;

  if (firstPassing === secondPassing) {
    return null;
  }

  const fraction = interpolateLogCrossing(firstValue, secondValue);
  return {
    x: firstPoint.x + (secondPoint.x - firstPoint.x) * fraction,
    y: firstPoint.y + (secondPoint.y - firstPoint.y) * fraction,
  };
}

function appendContourSegment(segments: string[], first: Point, second: Point) {
  segments.push(`M ${first.x.toFixed(2)} ${first.y.toFixed(2)} L ${second.x.toFixed(2)} ${second.y.toFixed(2)}`);
}

function appendMarchingSquare(
  segments: string[],
  points: [Point, Point, Point, Point],
  values: [number, number, number, number],
) {
  const [bottomLeft, bottomRight, topRight, topLeft] = points;
  const [bottomLeftValue, bottomRightValue, topRightValue, topLeftValue] = values;
  const edges: [Point | null, Point | null, Point | null, Point | null] = [
    contourEdge(bottomLeft, bottomLeftValue, bottomRight, bottomRightValue),
    contourEdge(bottomRight, bottomRightValue, topRight, topRightValue),
    contourEdge(topRight, topRightValue, topLeft, topLeftValue),
    contourEdge(topLeft, topLeftValue, bottomLeft, bottomLeftValue),
  ];
  const passingMask =
    (bottomLeftValue <= EYE_TARGET_BER ? 1 : 0) |
    (bottomRightValue <= EYE_TARGET_BER ? 2 : 0) |
    (topRightValue <= EYE_TARGET_BER ? 4 : 0) |
    (topLeftValue <= EYE_TARGET_BER ? 8 : 0);
  const crossingEdges = edges.flatMap((point, index) => (point ? [index] : []));

  if (crossingEdges.length === 2) {
    const [firstEdge, secondEdge] = crossingEdges;
    appendContourSegment(segments, edges[firstEdge]!, edges[secondEdge]!);
    return;
  }

  if (crossingEdges.length !== 4) {
    return;
  }

  const centerLogBer =
    (Math.log10(Math.max(bottomLeftValue, Number.MIN_VALUE)) +
      Math.log10(Math.max(bottomRightValue, Number.MIN_VALUE)) +
      Math.log10(Math.max(topRightValue, Number.MIN_VALUE)) +
      Math.log10(Math.max(topLeftValue, Number.MIN_VALUE))) /
    4;
  const centerPassing = centerLogBer <= Math.log10(EYE_TARGET_BER);
  const pairs =
    passingMask === 5
      ? centerPassing
        ? [[0, 1], [2, 3]]
        : [[0, 3], [1, 2]]
      : [[0, 1], [2, 3]];

  for (const [firstEdge, secondEdge] of pairs) {
    appendContourSegment(segments, edges[firstEdge]!, edges[secondEdge]!);
  }
}

function buildContourPath(upperBounds: number[], phaseSteps: number, thresholdSteps: number): string {
  const segments: string[] = [];

  for (let thresholdIndex = 0; thresholdIndex < thresholdSteps - 1; thresholdIndex += 1) {
    for (let phaseIndex = 0; phaseIndex < phaseSteps - 1; phaseIndex += 1) {
      const index = thresholdIndex * phaseSteps + phaseIndex;
      const points: [Point, Point, Point, Point] = [
        samplePoint(phaseIndex, thresholdIndex, phaseSteps, thresholdSteps),
        samplePoint(phaseIndex + 1, thresholdIndex, phaseSteps, thresholdSteps),
        samplePoint(phaseIndex + 1, thresholdIndex + 1, phaseSteps, thresholdSteps),
        samplePoint(phaseIndex, thresholdIndex + 1, phaseSteps, thresholdSteps),
      ];
      const values: [number, number, number, number] = [
        upperBounds[index],
        upperBounds[index + 1],
        upperBounds[index + phaseSteps + 1],
        upperBounds[index + phaseSteps],
      ];

      appendMarchingSquare(segments, points, values);
    }
  }

  return segments.join(" ");
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

function parseHexColor(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function interpolateColor(first: string, second: string, fraction: number): string {
  const [firstRed, firstGreen, firstBlue] = parseHexColor(first);
  const [secondRed, secondGreen, secondBlue] = parseHexColor(second);
  const red = Math.round(firstRed + (secondRed - firstRed) * fraction);
  const green = Math.round(firstGreen + (secondGreen - firstGreen) * fraction);
  const blue = Math.round(firstBlue + (secondBlue - firstBlue) * fraction);

  return `rgb(${red}, ${green}, ${blue})`;
}

function berColor(value: number): string {
  const logPosition =
    (Math.log10(Math.max(value, COLOR_MIN_BER)) - Math.log10(COLOR_MIN_BER)) /
    (Math.log10(COLOR_MAX_BER) - Math.log10(COLOR_MIN_BER));
  const normalized = Math.min(1, Math.max(0, logPosition));
  const scaledPosition = normalized * (VIRIDIS_STOPS.length - 1);
  const firstStop = Math.floor(scaledPosition);
  const secondStop = Math.min(VIRIDIS_STOPS.length - 1, firstStop + 1);

  return interpolateColor(VIRIDIS_STOPS[firstStop], VIRIDIS_STOPS[secondStop], scaledPosition - firstStop);
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatSigned(value: number, maximumFractionDigits = 1): string {
  if (value === 0) {
    return "0";
  }

  const formatted = formatNumber(Math.abs(value), maximumFractionDigits);
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function formatBer(value: number): string {
  return value.toExponential(2).replace("e+", "e");
}

function axisSamplePosition(fraction: number, steps: number): number {
  return (fraction * Math.max(steps - 1, 0) + 0.5) / Math.max(steps, 1);
}

function tickValues(axis: AxisSpec): Array<{ value: number; position: number }> {
  return Array.from({ length: 5 }, (_, index) => {
    const fraction = index / 4;
    return {
      value: axis.min + (axis.max - axis.min) * fraction,
      position: fraction,
    };
  });
}

function pointerCellIndex(
  event: PointerEvent<SVGRectElement>,
  phaseSteps: number,
  thresholdSteps: number,
): number | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return null;
  }

  const phaseIndex = Math.min(phaseSteps - 1, Math.max(0, Math.floor(x * phaseSteps)));
  const thresholdIndex = Math.min(
    thresholdSteps - 1,
    Math.max(0, Math.floor((1 - y) * thresholdSteps)),
  );

  return thresholdIndex * phaseSteps + phaseIndex;
}

function moveSelection(
  currentIndex: number,
  key: string,
  phaseSteps: number,
  thresholdSteps: number,
): number | null {
  const currentPhase = currentIndex % phaseSteps;
  const currentThreshold = Math.floor(currentIndex / phaseSteps);
  let phaseIndex = currentPhase;
  let thresholdIndex = currentThreshold;

  if (key === "ArrowLeft") phaseIndex -= 1;
  if (key === "ArrowRight") phaseIndex += 1;
  if (key === "ArrowDown") thresholdIndex -= 1;
  if (key === "ArrowUp") thresholdIndex += 1;

  if (
    phaseIndex < 0 ||
    phaseIndex >= phaseSteps ||
    thresholdIndex < 0 ||
    thresholdIndex >= thresholdSteps
  ) {
    return null;
  }

  return thresholdIndex * phaseSteps + phaseIndex;
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
    const nextIndex = pointerCellIndex(event, run.sweep.phase.steps, run.sweep.threshold.steps);
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
