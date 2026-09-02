export const ZERO_ERROR_COLOR = "#edf2ef";
export const BELOW_RESOLUTION_COLOR = "#eef1ef";
export const BOUNDED_IMPROVED_COLOR = "#deeee9";
export const BOUNDED_WORSENED_COLOR = "#f4e3dc";
export const BOUNDED_UNCERTAIN_COLOR = "#eeeae2";

const COLOR_MIN_BER = 1e-9;
const COLOR_MAX_BER = 1e-1;
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

function parseHexColor(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export function interpolateColor(first: string, second: string, fraction: number): string {
  const [firstRed, firstGreen, firstBlue] = parseHexColor(first);
  const [secondRed, secondGreen, secondBlue] = parseHexColor(second);
  const red = Math.round(firstRed + (secondRed - firstRed) * fraction);
  const green = Math.round(firstGreen + (secondGreen - firstGreen) * fraction);
  const blue = Math.round(firstBlue + (secondBlue - firstBlue) * fraction);

  return `rgb(${red}, ${green}, ${blue})`;
}

export function berColor(value: number): string {
  const logPosition =
    (Math.log10(Math.max(value, COLOR_MIN_BER)) - Math.log10(COLOR_MIN_BER)) /
    (Math.log10(COLOR_MAX_BER) - Math.log10(COLOR_MIN_BER));
  const normalized = Math.min(1, Math.max(0, logPosition));
  const scaledPosition = normalized * (VIRIDIS_STOPS.length - 1);
  const firstStop = Math.floor(scaledPosition);
  const secondStop = Math.min(VIRIDIS_STOPS.length - 1, firstStop + 1);

  return interpolateColor(VIRIDIS_STOPS[firstStop], VIRIDIS_STOPS[secondStop], scaledPosition - firstStop);
}

const DIFFERENCE_IMPROVED = "#216b78";
const DIFFERENCE_NEUTRAL = "#f4f6f5";
const DIFFERENCE_WORSENED = "#b54e32";

export function differenceColor(logBerDelta: number): string {
  const normalized = Math.min(1, Math.max(-1, logBerDelta / 4));
  if (normalized < 0) {
    return interpolateColor(DIFFERENCE_NEUTRAL, DIFFERENCE_IMPROVED, -normalized);
  }

  return interpolateColor(DIFFERENCE_NEUTRAL, DIFFERENCE_WORSENED, normalized);
}
