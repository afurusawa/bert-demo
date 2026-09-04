import {
  causeSpec,
  featureSpec,
  type CauseId,
  type Classifier,
  type FeatureKey,
} from "./diagnosis-model";
import { PLOT_TEXT_UNITS } from "./design-tokens";
import { formatNumber } from "./formatters";

const PIPELINE_STEPS = [
  { title: "Failing link", detail: "A lane misses the 1e-6 target on the test station." },
  { title: "Ten features", detail: "Eye opening, jitter split, noise, loss, aggressor correlation." },
  { title: "Fitted model", detail: "Per-cause statistics and one calibration temperature." },
  { title: "Ranked causes", detail: "A shortlist, a stated confidence, and the evidence behind it." },
] as const;

const STEP_WIDTH = 226;
const STEP_GAP = 12;
const STEP_LEFT = 0;
const STEP_TOP = 34;
const STEP_HEIGHT = 128;

/**
 * The loop the page is about. The four steps across the top are the part a
 * competitor can rebuild in an afternoon; the block underneath is the part they
 * would have to spend years collecting.
 */
export function PipelineDiagram({
  labelledCount,
  causeCount,
}: {
  labelledCount: number;
  causeCount: number;
}) {
  const stepX = (index: number) => STEP_LEFT + index * (STEP_WIDTH + STEP_GAP);
  const corpusBox = { x: 180, y: 300, width: 640, height: 124 };
  const modelBox = { x: stepX(2), width: STEP_WIDTH };
  const lastStepRight = stepX(3) + STEP_WIDTH;

  return (
    <figure className="diagnosis-figure">
      <svg
        className="diagnosis-plot"
        viewBox="0 0 1000 470"
        role="img"
        aria-label="A failing link produces ten features. The model, fitted from the labelled cases, ranks the causes. The engineer who resolves the case adds it back to the labelled cases."
      >
        {PIPELINE_STEPS.map((step, index) => (
          <g key={step.title}>
            <rect
              className="diagram-box"
              x={stepX(index)}
              y={STEP_TOP}
              width={STEP_WIDTH}
              height={STEP_HEIGHT}
              rx={4}
            />
            <text className="diagram-step-title" x={stepX(index) + 18} y={STEP_TOP + 36}>
              {step.title}
            </text>
            <foreignObject
              x={stepX(index) + 18}
              y={STEP_TOP + 48}
              width={STEP_WIDTH - 36}
              height={STEP_HEIGHT - 56}
            >
              <p className="diagram-step-detail">{step.detail}</p>
            </foreignObject>
            {index < PIPELINE_STEPS.length - 1 ? (
              <path
                className="diagram-arrow"
                d={`M ${stepX(index) + STEP_WIDTH + 4} ${STEP_TOP + STEP_HEIGHT / 2} L ${stepX(index + 1) - 6} ${STEP_TOP + STEP_HEIGHT / 2}`}
                markerEnd="url(#diagram-arrowhead)"
              />
            ) : null}
          </g>
        ))}

        <rect
          className="diagram-box diagram-box-accent"
          x={corpusBox.x}
          y={corpusBox.y}
          width={corpusBox.width}
          height={corpusBox.height}
          rx={4}
        />
        <text className="diagram-step-title diagram-title-on-accent" x={corpusBox.x + 24} y={corpusBox.y + 40}>
          Labelled cases
        </text>
        <text className="diagram-detail-on-accent" x={corpusBox.x + 24} y={corpusBox.y + 72}>
          {formatNumber(labelledCount, 0)} resolved failures across {causeCount} causes, each with the
        </text>
        <text className="diagram-detail-on-accent" x={corpusBox.x + 24} y={corpusBox.y + 96}>
          sentence an engineer wrote when they found the fault.
        </text>

        <path
          className="diagram-arrow"
          d={`M ${modelBox.x + modelBox.width / 2} ${corpusBox.y - 6} L ${modelBox.x + modelBox.width / 2} ${STEP_TOP + STEP_HEIGHT + 8}`}
          markerEnd="url(#diagram-arrowhead)"
        />
        <text className="diagram-arrow-label" x={modelBox.x + modelBox.width / 2 - 12} y={240} textAnchor="end">
          fits
        </text>

        <path
          className="diagram-arrow"
          d={`M ${lastStepRight - 60} ${STEP_TOP + STEP_HEIGHT + 4} L ${lastStepRight - 60} ${corpusBox.y + corpusBox.height / 2} L ${corpusBox.x + corpusBox.width + 8} ${corpusBox.y + corpusBox.height / 2}`}
          markerEnd="url(#diagram-arrowhead)"
        />
        <text className="diagram-arrow-label" x={lastStepRight - 75} y={222} textAnchor="end">
          an engineer confirms it,
        </text>
        <text className="diagram-arrow-label" x={lastStepRight - 75} y={246} textAnchor="end">
          and it becomes example n+1
        </text>

        <defs>
          <marker
            id="diagram-arrowhead"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="diagram-arrowhead" d="M 0 1 L 9 5 L 0 9 z" />
          </marker>
        </defs>
      </svg>
    </figure>
  );
}

const DENSITY_SAMPLES = 160;
const DENSITY_VIEWBOX = { width: 1_000, height: 340 } as const;
const DENSITY_PLOT = { left: 64, top: 28, width: 872, height: 216 } as const;

/**
 * Peak labels are placed by hand, so their width has to be estimated rather than
 * measured. IBM Plex Sans at the annotation size averages a little over half the
 * font size per character; PLOT_TEXT_UNITS.annotation is in the same drawing
 * units as the viewBox.
 */
const LABEL_CHARACTER_UNITS = PLOT_TEXT_UNITS.annotation * 0.55;
const LABEL_PEAK_GAP = 8;

function density(value: number, mean: number, variance: number): number {
  return Math.exp(-((value - mean) ** 2) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
}

/**
 * What the classifier does with one feature, drawn as the two bell curves it is
 * comparing. Ten of these get multiplied together; the shaded overlap is the
 * part no amount of arithmetic can resolve, only more examples.
 */
export function FeatureLikelihoodDiagram({
  classifier,
  feature,
  first,
  second,
}: {
  classifier: Classifier;
  feature: FeatureKey;
  first: CauseId;
  second: CauseId;
}) {
  const spec = featureSpec(feature);
  const firstClass = classifier.classes.find((entry) => entry.cause === first);
  const secondClass = classifier.classes.find((entry) => entry.cause === second);

  if (!firstClass || !secondClass) {
    return null;
  }

  const pairs = [
    { statistics: firstClass, className: "diagram-density-first", label: causeSpec(first).short },
    { statistics: secondClass, className: "diagram-density-second", label: causeSpec(second).short },
  ];
  const minimum = Math.min(
    ...pairs.map((pair) => pair.statistics.means[feature] - 3.2 * Math.sqrt(pair.statistics.variances[feature])),
  );
  const maximum = Math.max(
    ...pairs.map((pair) => pair.statistics.means[feature] + 3.2 * Math.sqrt(pair.statistics.variances[feature])),
  );
  const peak = Math.max(
    ...pairs.map((pair) => density(pair.statistics.means[feature], pair.statistics.means[feature], pair.statistics.variances[feature])),
  );
  const x = (value: number) => DENSITY_PLOT.left + ((value - minimum) / (maximum - minimum)) * DENSITY_PLOT.width;
  const y = (value: number) => DENSITY_PLOT.top + (1 - value / peak) * DENSITY_PLOT.height;
  const curvePath = (mean: number, variance: number) =>
    Array.from({ length: DENSITY_SAMPLES + 1 }, (_, index) => {
      const value = minimum + ((maximum - minimum) * index) / DENSITY_SAMPLES;
      return `${index === 0 ? "M" : "L"} ${x(value).toFixed(2)} ${y(density(value, mean, variance)).toFixed(2)}`;
    }).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + ((maximum - minimum) * index) / 4);

  // When the two means sit close together the labels overlap at the peaks. Anchor
  // each one on the far side of its own curve so they open away from each other.
  const [leftPair, rightPair] = [...pairs].sort(
    (first, second) => first.statistics.means[feature] - second.statistics.means[feature],
  );
  const labelWidth = (label: string) => label.length * LABEL_CHARACTER_UNITS;
  const separation = x(rightPair.statistics.means[feature]) - x(leftPair.statistics.means[feature]);
  const crowded =
    separation < (labelWidth(leftPair.label) + labelWidth(rightPair.label)) / 2 + LABEL_PEAK_GAP;
  const labelPlacement = (pair: (typeof pairs)[number]) => {
    const centre = x(pair.statistics.means[feature]);

    if (!crowded) {
      return { x: centre, anchor: "middle" as const };
    }

    return pair === leftPair
      ? { x: Math.max(centre - LABEL_PEAK_GAP, labelWidth(leftPair.label) + 4), anchor: "end" as const }
      : {
          x: Math.min(
            centre + LABEL_PEAK_GAP,
            DENSITY_VIEWBOX.width - labelWidth(rightPair.label) - 4,
          ),
          anchor: "start" as const,
        };
  };

  return (
    <figure className="diagnosis-figure">
      <svg
        className="diagnosis-plot"
        viewBox={`0 0 ${DENSITY_VIEWBOX.width} ${DENSITY_VIEWBOX.height}`}
        role="img"
        aria-label={`${spec.label} distributions fitted for ${causeSpec(first).short} and ${causeSpec(second).short}, overlapping across much of the range`}
      >
        <line
          className="diagnosis-gridline"
          x1={DENSITY_PLOT.left}
          x2={DENSITY_PLOT.left + DENSITY_PLOT.width}
          y1={DENSITY_PLOT.top + DENSITY_PLOT.height}
          y2={DENSITY_PLOT.top + DENSITY_PLOT.height}
        />
        {ticks.map((value) => (
          <text
            key={value}
            className="diagnosis-tick-label"
            x={x(value)}
            y={DENSITY_PLOT.top + DENSITY_PLOT.height + 28}
            textAnchor="middle"
          >
            {formatNumber(value, spec.digits)}
          </text>
        ))}
        {pairs.map((pair) => {
          const placement = labelPlacement(pair);

          return (
            <g key={pair.label}>
              <path
                className={`diagram-density ${pair.className}`}
                d={curvePath(pair.statistics.means[feature], pair.statistics.variances[feature])}
              />
              <text
                className="diagnosis-annotation"
                x={placement.x}
                y={y(density(pair.statistics.means[feature], pair.statistics.means[feature], pair.statistics.variances[feature])) - 14}
                textAnchor={placement.anchor}
              >
                {pair.label}
              </text>
            </g>
          );
        })}
        <text
          className="diagnosis-axis-title"
          x={DENSITY_PLOT.left + DENSITY_PLOT.width / 2}
          y={DENSITY_VIEWBOX.height - 42}
          textAnchor="middle"
        >
          {spec.label}
          {spec.unit ? ` (${spec.unit})` : ""}
        </text>
      </svg>
      <figcaption className="diagnosis-legend">
        <span className="diagnosis-legend-item">
          <span className="diagnosis-legend-mark legend-mark-first" aria-hidden="true" />
          {causeSpec(first).label}
        </span>
        <span className="diagnosis-legend-item">
          <span className="diagnosis-legend-mark legend-mark-second" aria-hidden="true" />
          {causeSpec(second).label}
        </span>
      </figcaption>
    </figure>
  );
}
