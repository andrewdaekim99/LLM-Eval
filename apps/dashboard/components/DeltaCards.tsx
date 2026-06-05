import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Delta {
  label: string;
  value: number;
  format: (v: number) => string;
  /** When true, positive deltas are bad (e.g. cost, latency). */
  inverse?: boolean;
}

interface Props {
  passRate: Delta;
  cost: Delta;
  latency: Delta;
}

export function DeltaCards({ passRate, cost, latency }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <DeltaCard {...passRate} />
      <DeltaCard {...cost} />
      <DeltaCard {...latency} />
    </div>
  );
}

function DeltaCard({ label, value, format, inverse }: Delta) {
  const direction = directionOf(value, inverse);
  const glow =
    direction === "good"
      ? "hsl(var(--success) / 0.55)"
      : direction === "bad"
        ? "hsl(var(--destructive) / 0.55)"
        : "hsl(var(--muted-foreground) / 0.3)";
  return (
    <Card className="phosphor-border bg-card/40">
      <CardContent className="py-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-2 font-display text-3xl",
            direction === "good" && "text-success",
            direction === "bad" && "text-destructive",
            direction === "flat" && "text-foreground",
          )}
          style={{ textShadow: `0 0 8px ${glow}` }}
        >
          {value > 0 ? "+" : value < 0 ? "−" : "±"}
          {format(Math.abs(value))}
        </div>
      </CardContent>
    </Card>
  );
}

function directionOf(value: number, inverse?: boolean): "good" | "bad" | "flat" {
  if (value === 0) return "flat";
  const positive = value > 0;
  if (inverse) return positive ? "bad" : "good";
  return positive ? "good" : "bad";
}
