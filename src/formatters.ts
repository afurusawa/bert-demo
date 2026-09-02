export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

export function formatSigned(value: number, maximumFractionDigits = 1): string {
  if (value === 0) {
    return "0";
  }

  const formatted = formatNumber(Math.abs(value), maximumFractionDigits);
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

export function formatBer(value: number, fractionDigits = 2): string {
  return value.toExponential(fractionDigits).replace("e+", "e");
}
