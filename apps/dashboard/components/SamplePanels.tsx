import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCostUSD, formatLatencyMs } from "@/lib/format";
import type { StoredSample } from "@/lib/data";

interface Props {
  samples: StoredSample[];
}

export function SamplePanels({ samples }: Props) {
  if (samples.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No samples recorded for this case.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {samples.map((s) => (
        <Card key={s.sampleIndex}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Sample {s.sampleIndex}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {s.cacheHit ? (
                <Badge variant="secondary">cache hit</Badge>
              ) : (
                <Badge variant="outline">live call</Badge>
              )}
              <span>{formatLatencyMs(s.latencyMs)}</span>
              <span>{formatCostUSD(s.costUSD)}</span>
              <span>
                {s.inputTokens} → {s.outputTokens} tok
              </span>
              {s.stopReason && (
                <span className="font-mono">stop: {s.stopReason}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Output
              </div>
              <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                {s.output}
              </pre>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {s.scores.map((sc, i) => (
                <Badge
                  key={`${sc.scorer}-${i}`}
                  variant={sc.passed ? "success" : "destructive"}
                >
                  {sc.scorer}: {sc.value.toFixed(2)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
