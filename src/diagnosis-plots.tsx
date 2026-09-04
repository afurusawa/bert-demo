import {
  DIAGNOSIS_CAUSES,
  causeSpec,
  type CauseCount,
  type CauseId,
  type Evaluation,
  type LearningPoint,
} from "./diagnosis-model";
import { SURFACES, TEXT_INKS } from "./design-tokens";
import { interpolateColor } from "./plot-colors";
import { formatNumber, formatPercent } from "./formatters";

/**
 * One sequential hue, light to dark, for every magnitude encoding on these
 * surfaces: the confusion matrix, the corpus bars and the confidence bars all
 * read off the same ramp, so a darker mark always means more.
 */
export function sequentialColor(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return interpolateColor(SURFACES.soft, SURFACES.accent, clamped);
}

/** The ink that stays legible on a given step of that ramp. */
function inkOn(fraction: number): string {
  return fraction > 0.55 ? TEXT_INKS.onAccent : TEXT_INKS.primary;
}

const CURVE_VIEWBOX = { width: 1_000, height: 430 } as const;
const CURVE_PLOT = { left: 78, top: 24, width: 848, height: 320 } as const;

/**
 * Holdout accuracy against the number of labelled examples the model was
 * fitted on. One series, so the title names it and no legend box is drawn.
 */
export function LearningCurvePlot({ curve }: { curve: LearningPoint[] }) {
  const maximumExamples = curve.length === 0 ? 1 : curve[curve.length - 1].labelledExamples;
  const x = (examples: number) => CURVE_PLOT.left + (examples / maximumExamples) * CURVE_PLOT.width;
  const y = (accuracy: number) => CURVE_PLOT.top + (1 - accuracy) * CURVE_PLOT.height;
  const linePath = curve
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.labelledExamples).toFixed(2)} ${y(point.accuracy).toFixed(2)}`)
    .join(" ");
  const last = curve[curve.length - 1];
  const gridValues = [0, 0.25, 0.5, 0.75, 1];
  const exampleTicks = curve.map((point) => point.labelledExamples);

  return (
    <figure className="diagnosis-figure">
      <svg
        className="diagnosis-plot"
        viewBox={`0 0 ${CURVE_VIEWBOX.width} ${CURVE_VIEWBOX.height}`}
        role="img"
        aria-label={`Holdout accuracy rises from ${formatPercent(curve[0]?.accuracy ?? 0)} at ${curve[0]?.labelledExamples ?? 0} labelled examples to ${formatPercent(last?.accuracy ?? 0)} at ${last?.labelledExamples ?? 0}`}
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              className="diagnosis-gridline"
              x1={CURVE_PLOT.left}
              x2={CURVE_PLOT.left + CURVE_PLOT.width}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="diagnosis-tick-label" x={CURVE_PLOT.left - 12} y={y(value) + 5} textAnchor="end">
              {formatPercent(value)}
            </text>
          </g>
        ))}
        {exampleTicks.map((examples) => (
          <text
            key={examples}
            className="diagnosis-tick-label"
            x={x(examples)}
            y={CURVE_PLOT.top + CURVE_PLOT.height + 26}
            textAnchor="middle"
          >
            {examples}
          </text>
        ))}
        <path className="diagnosis-curve" d={linePath} />
        {curve.map((point) => (
          <circle
            key={point.labelledExamples}
            className="diagnosis-curve-marker"
            cx={x(point.labelledExamples)}
            cy={y(point.accuracy)}
            r={5}
          >
            <title>
              {`${point.labelledExamples} labelled examples: ${formatPercent(point.accuracy, 1)} holdout accuracy`}
            </title>
          </circle>
        ))}
        {last ? (
          <text
            className="diagnosis-annotation"
            x={x(last.labelledExamples)}
            y={y(last.accuracy) - 18}
            textAnchor="end"
          >
            {formatPercent(last.accuracy, 1)} at {last.labelledExamples} examples
          </text>
        ) : null}
        <text
          className="diagnosis-axis-title"
          x={CURVE_PLOT.left + CURVE_PLOT.width / 2}
          y={CURVE_VIEWBOX.height - 16}
          textAnchor="middle"
        >
          Labelled examples fitted on
        </text>
      </svg>
    </figure>
  );
}

const MATRIX_CELL = 72;
const MATRIX_LEFT = 208;
const MATRIX_TOP = 132;
const MATRIX_SIZE = MATRIX_CELL * DIAGNOSIS_CAUSES.length;

/**
 * Rows are the cause an engineer confirmed; columns are the cause the model
 * called. Shading is the row share, so a row reads as "of the crimps we know
 * about, where did they land" regardless of how common the cause is.
 */
export function ConfusionMatrixPlot({ evaluation }: { evaluation: Evaluation }) {
  const supportOf = (cause: CauseId) =>
    DIAGNOSIS_CAUSES.reduce((sum, predicted) => sum + evaluation.confusion[cause][predicted.id], 0);

  return (
    <figure className="diagnosis-figure">
      <svg
        className="diagnosis-plot"
        viewBox={`0 0 ${MATRIX_LEFT + MATRIX_SIZE + 24} ${MATRIX_TOP + MATRIX_SIZE + 56}`}
        role="img"
        aria-label="Confusion matrix of confirmed cause against predicted cause on the holdout split"
      >
        {DIAGNOSIS_CAUSES.map((cause, columnIndex) => {
          const centerX = MATRIX_LEFT + columnIndex * MATRIX_CELL + MATRIX_CELL / 2;
          return (
            <text
              key={cause.id}
              className="diagnosis-tick-label"
              x={centerX}
              y={MATRIX_TOP - 14}
              textAnchor="start"
              transform={`rotate(-45 ${centerX} ${MATRIX_TOP - 14})`}
            >
              {cause.short}
            </text>
          );
        })}
        {DIAGNOSIS_CAUSES.map((actual, rowIndex) => {
          const support = supportOf(actual.id);
          const rowY = MATRIX_TOP + rowIndex * MATRIX_CELL;

          return (
            <g key={actual.id}>
              <text
                className="diagnosis-tick-label"
                x={MATRIX_LEFT - 14}
                y={rowY + MATRIX_CELL / 2 + 5}
                textAnchor="end"
              >
                {actual.short}
              </text>
              {DIAGNOSIS_CAUSES.map((predicted, columnIndex) => {
                const count = evaluation.confusion[actual.id][predicted.id];
                const share = support === 0 ? 0 : count / support;
                const cellX = MATRIX_LEFT + columnIndex * MATRIX_CELL;

                return (
                  <g key={predicted.id}>
                    <rect
                      x={cellX + 1}
                      y={rowY + 1}
                      width={MATRIX_CELL - 2}
                      height={MATRIX_CELL - 2}
                      fill={sequentialColor(share)}
                    >
                      <title>
                        {`${count} of ${support} confirmed ${actual.short} cases were called ${predicted.short}`}
                      </title>
                    </rect>
                    {count > 0 ? (
                      <text
                        className="diagnosis-cell-label"
                        x={cellX + MATRIX_CELL / 2}
                        y={rowY + MATRIX_CELL / 2 + 5}
                        textAnchor="middle"
                        fill={inkOn(share)}
                      >
                        {count}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
        <rect
          className="diagnosis-matrix-border"
          x={MATRIX_LEFT}
          y={MATRIX_TOP}
          width={MATRIX_SIZE}
          height={MATRIX_SIZE}
        />
        <text
          className="diagnosis-axis-title"
          x={MATRIX_LEFT + MATRIX_SIZE / 2}
          y={MATRIX_TOP + MATRIX_SIZE + 40}
          textAnchor="middle"
        >
          Cause the model called
        </text>
      </svg>
    </figure>
  );
}

const BAR_ROW_HEIGHT = 46;
const BAR_LEFT = 268;
const BAR_WIDTH = 620;

interface MagnitudeRow {
  key: string;
  label: string;
  value: number;
  display: string;
  note?: string;
}

/** Horizontal bars on one shared 0-to-max axis, each labelled at its end. */
function MagnitudeBars({
  rows,
  maximum,
  description,
}: {
  rows: MagnitudeRow[];
  maximum: number;
  description: string;
}) {
  const height = rows.length * BAR_ROW_HEIGHT + 16;

  return (
    <figure className="diagnosis-figure">
      <svg
        className="diagnosis-plot"
        viewBox={`0 0 1000 ${height}`}
        role="img"
        aria-label={description}
      >
        {rows.map((row, index) => {
          const share = maximum === 0 ? 0 : row.value / maximum;
          const y = index * BAR_ROW_HEIGHT + 8;
          const barHeight = BAR_ROW_HEIGHT - 20;

          return (
            <g key={row.key}>
              <text className="diagnosis-tick-label" x={BAR_LEFT - 16} y={y + barHeight - 3} textAnchor="end">
                {row.label}
              </text>
              <rect
                x={BAR_LEFT}
                y={y}
                width={Math.max(2, share * BAR_WIDTH)}
                height={barHeight}
                rx={4}
                fill={sequentialColor(0.25 + 0.6 * share)}
              >
                <title>{`${row.label}: ${row.display}`}</title>
              </rect>
              <text
                className="diagnosis-annotation"
                x={BAR_LEFT + Math.max(2, share * BAR_WIDTH) + 12}
                y={y + barHeight - 3}
              >
                {row.display}
                {row.note ? <tspan className="diagnosis-annotation-note"> {row.note}</tspan> : null}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** How many confirmed examples each cause has. The long tail is the point. */
export function CorpusCompositionPlot({ counts }: { counts: CauseCount[] }) {
  const ordered = [...counts].sort((first, second) => second.count - first.count);
  const maximum = Math.max(...ordered.map((entry) => entry.count), 1);

  return (
    <MagnitudeBars
      maximum={maximum}
      description="Confirmed examples held per cause, from the most common to the rarest"
      rows={ordered.map((entry) => ({
        key: entry.cause,
        label: causeSpec(entry.cause).short,
        value: entry.count,
        display: formatNumber(entry.count, 0),
        note: "examples",
      }))}
    />
  );
}

/**
 * Confidence against the accuracy it is claiming. Before the temperature is
 * fitted the model is sure of itself well past what it earns; after, the two
 * bars are close, which is the only thing calibration buys.
 */
export function CalibrationPlot({
  accuracy,
  calibratedConfidence,
  uncalibratedConfidence,
}: {
  accuracy: number;
  calibratedConfidence: number;
  uncalibratedConfidence: number;
}) {
  return (
    <MagnitudeBars
      maximum={1}
      description="Mean stated confidence before and after temperature scaling, against the accuracy actually achieved"
      rows={[
        {
          key: "accuracy",
          label: "Holdout accuracy",
          value: accuracy,
          display: formatPercent(accuracy, 1),
          note: "what it earns",
        },
        {
          key: "calibrated",
          label: "Mean confidence, calibrated",
          value: calibratedConfidence,
          display: formatPercent(calibratedConfidence, 1),
          note: "what it claims",
        },
        {
          key: "uncalibrated",
          label: "Mean confidence, raw",
          value: uncalibratedConfidence,
          display: formatPercent(uncalibratedConfidence, 1),
          note: "before scaling",
        },
      ]}
    />
  );
}
