import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCostUSD,
  formatLatencyMs,
  formatPercent,
  formatRunId,
  formatTimestamp,
} from "@/lib/format";
import type { RunListEntry } from "@/lib/data";

interface Props {
  run: RunListEntry;
}

export function RunSummaryCard({ run }: Props) {
  const passed = run.passRate >= 1;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="font-mono text-lg">{formatRunId(run.runId)}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.suite}
            <span className="mx-2 text-border">·</span>
            prompt {run.promptVersion}
            <span className="mx-2 text-border">·</span>
            model {run.model}
            <span className="mx-2 text-border">·</span>
            {formatTimestamp(run.startedAt)}
          </p>
        </div>
        <Badge variant={passed ? "success" : "destructive"} className="shrink-0">
          {formatPercent(run.passRate)} pass
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="Cases" value={`${run.passedCases}/${run.totalCases}`} />
          <Stat label="Total cost" value={formatCostUSD(run.totalCostUSD)} />
          <Stat label="p95 latency" value={formatLatencyMs(run.latencyMsP95)} />
          <Stat
            label="Cache hits"
            value={formatPercent(run.cacheHitRate, 0)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-base">{value}</dd>
    </div>
  );
}
