"use client";

import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/lib/data";

interface Props {
  points: TrendPoint[];
}

interface ChartConfig {
  title: string;
  dataKey: "passRatePct" | "costUSD" | "latencyP95";
  format: (value: number) => string;
  stroke: string;
  domain?: [number, number];
}

interface TooltipDatum {
  payload?: TrendPoint & { passRatePct: number };
}

const CHART_HEIGHT = 220;

export function SuiteTrendChart({ points }: Props) {
  const router = useRouter();

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No runs to chart.
      </div>
    );
  }

  // Recharts wants flat number fields; pre-shape pass rate as a percent so the
  // axis labels read naturally.
  const data = points.map((p) => ({
    ...p,
    label: formatLabel(p.startedAt),
    passRatePct: p.passRate * 100,
  }));

  const charts: ChartConfig[] = [
    {
      title: "pass rate",
      dataKey: "passRatePct",
      format: (v) => `${v.toFixed(0)}%`,
      stroke: "hsl(130 100% 60%)", // phosphor green
      domain: [0, 100],
    },
    {
      title: "total cost (usd)",
      dataKey: "costUSD",
      format: (v) => (v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`),
      stroke: "hsl(38 100% 60%)", // amber
    },
    {
      title: "p95 latency (ms)",
      dataKey: "latencyP95",
      format: (v) => `${Math.round(v)} ms`,
      stroke: "hsl(180 90% 60%)", // cyan accent
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {charts.map((c) => (
        <div
          key={c.dataKey}
          className="phosphor-border rounded-sm bg-card/40 p-4"
        >
          <div
            className="mb-2 font-mono text-[11px] uppercase tracking-widest text-primary"
            style={{ textShadow: "0 0 6px hsl(var(--primary) / 0.4)" }}
          >
            // {c.title}
          </div>
          <div style={{ width: "100%", height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const active = (
                    state as { activePayload?: TooltipDatum[] } | undefined
                  )?.activePayload;
                  const point = active?.[0]?.payload;
                  if (point) router.push(`/runs/${point.runId}`);
                }}
              >
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="hsl(140 30% 18%)"
                />
                <XAxis
                  dataKey="label"
                  stroke="hsl(130 35% 55%)"
                  fontSize={10}
                  tickMargin={6}
                />
                <YAxis
                  stroke="hsl(130 35% 55%)"
                  fontSize={10}
                  tickFormatter={c.format}
                  domain={c.domain ?? ["auto", "auto"]}
                  width={56}
                />
                <Tooltip
                  content={({ active, payload }) => (
                    <TrendTooltip
                      active={active}
                      payload={payload}
                      format={c.format}
                      dataKey={c.dataKey}
                    />
                  )}
                />
                <Line
                  type="monotone"
                  dataKey={c.dataKey}
                  stroke={c.stroke}
                  strokeWidth={2}
                  dot={{ r: 3, fill: c.stroke, stroke: c.stroke }}
                  activeDot={{ r: 5, fill: c.stroke, stroke: c.stroke }}
                  filter={`drop-shadow(0 0 4px ${c.stroke})`}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  format,
  dataKey,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  format: (value: number) => string;
  dataKey: ChartConfig["dataKey"];
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload;
  if (!raw) return null;
  const point = raw as TrendPoint & { passRatePct: number };
  const value = point[dataKey];
  return (
    <div className="phosphor-border rounded-sm bg-popover px-3 py-2 font-mono text-xs">
      <div className="text-primary">{point.runId.slice(0, 8)}</div>
      <div className="text-muted-foreground">{formatLabel(point.startedAt)}</div>
      <div
        className="mt-1 text-foreground"
        style={{ textShadow: "0 0 6px hsl(var(--primary) / 0.4)" }}
      >
        {format(value)}
      </div>
    </div>
  );
}

function formatLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
