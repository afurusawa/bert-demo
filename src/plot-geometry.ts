import { EYE_TARGET_BER, type AxisSpec } from "./scan-model";

export const VIEWBOX_WIDTH = 1_000;
export const VIEWBOX_HEIGHT = 520;
export const PLOT = {
  left: 72,
  top: 20,
  width: 884,
  height: 424,
} as const;

export interface Point {
  x: number;
  y: number;
}

export function axisValue(axis: AxisSpec, index: number): number {
  if (axis.steps <= 1) {
    return axis.min;
  }

  return axis.min + ((axis.max - axis.min) * index) / (axis.steps - 1);
}

export function samplePoint(
  phaseIndex: number,
  thresholdIndex: number,
  phaseSteps: number,
  thresholdSteps: number,
): Point {
  const phasePosition = (phaseIndex + 0.5) / Math.max(phaseSteps, 1);
  const thresholdPosition = (thresholdIndex + 0.5) / Math.max(thresholdSteps, 1);

  return {
    x: PLOT.left + phasePosition * PLOT.width,
    y: PLOT.top + (1 - thresholdPosition) * PLOT.height,
  };
}

export function cellBounds(
  phaseIndex: number,
  thresholdIndex: number,
  phaseSteps: number,
  thresholdSteps: number,
) {
  const cellWidth = PLOT.width / Math.max(phaseSteps, 1);
  const cellHeight = PLOT.height / Math.max(thresholdSteps, 1);

  return {
    x: PLOT.left + phaseIndex * cellWidth,
    y: PLOT.top + (thresholdSteps - thresholdIndex - 1) * cellHeight,
    width: cellWidth,
    height: cellHeight,
  };
}

function interpolateLogCrossing(
  firstValue: number,
  secondValue: number,
  targetBer: number,
): number {
  const firstLog = Math.log10(Math.max(firstValue, Number.MIN_VALUE));
  const secondLog = Math.log10(Math.max(secondValue, Number.MIN_VALUE));
  const targetLog = Math.log10(targetBer);
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
  targetBer: number,
): Point | null {
  const firstPassing = firstValue <= targetBer;
  const secondPassing = secondValue <= targetBer;

  if (firstPassing === secondPassing) {
    return null;
  }

  const fraction = interpolateLogCrossing(firstValue, secondValue, targetBer);
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
  targetBer: number,
) {
  const [bottomLeft, bottomRight, topRight, topLeft] = points;
  const [bottomLeftValue, bottomRightValue, topRightValue, topLeftValue] = values;
  const edges: [Point | null, Point | null, Point | null, Point | null] = [
    contourEdge(bottomLeft, bottomLeftValue, bottomRight, bottomRightValue, targetBer),
    contourEdge(bottomRight, bottomRightValue, topRight, topRightValue, targetBer),
    contourEdge(topRight, topRightValue, topLeft, topLeftValue, targetBer),
    contourEdge(topLeft, topLeftValue, bottomLeft, bottomLeftValue, targetBer),
  ];
  const passingMask =
    (bottomLeftValue <= targetBer ? 1 : 0) |
    (bottomRightValue <= targetBer ? 2 : 0) |
    (topRightValue <= targetBer ? 4 : 0) |
    (topLeftValue <= targetBer ? 8 : 0);
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
  const centerPassing = centerLogBer <= Math.log10(targetBer);
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

export function buildContourPath(
  confidenceValues: number[],
  phaseSteps: number,
  thresholdSteps: number,
): string {
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
        confidenceValues[index],
        confidenceValues[index + 1],
        confidenceValues[index + phaseSteps + 1],
        confidenceValues[index + phaseSteps],
      ];

      appendMarchingSquare(segments, points, values, EYE_TARGET_BER);
    }
  }

  return segments.join(" ");
}

export function axisSamplePosition(fraction: number, steps: number): number {
  return (fraction * Math.max(steps - 1, 0) + 0.5) / Math.max(steps, 1);
}

export function tickValues(axis: AxisSpec): Array<{ value: number; position: number }> {
  return Array.from({ length: 5 }, (_, index) => {
    const fraction = index / 4;
    return {
      value: axis.min + (axis.max - axis.min) * fraction,
      position: fraction,
    };
  });
}

export function cellIndexFromPointer(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  phaseSteps: number,
  thresholdSteps: number,
): number | null {
  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;

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

export function moveSelection(
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
