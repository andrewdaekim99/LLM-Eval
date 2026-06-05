export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCostUSD(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatLatencyMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatRunId(runId: string): string {
  return runId.slice(0, 8);
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDelta(value: number, unit: "pct" | "usd" | "ms"): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "±";
  if (unit === "pct") return `${sign}${(value * 100).toFixed(1)}%`;
  if (unit === "usd") return `${sign}${formatCostUSD(Math.abs(value)).replace("$", value < 0 ? "−$" : "$")}`;
  return `${sign}${formatLatencyMs(Math.abs(value))}`;
}
