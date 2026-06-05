import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCostUSD,
  formatLatencyMs,
  formatPercent,
  formatRunId,
  formatTimestamp,
} from "@/lib/format";
import type { RunListEntry } from "@/lib/data";

interface Props {
  runs: RunListEntry[];
}

export function RunsTable({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
            <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Run
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Suite
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Prompt
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Started
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pass
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cases
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cost
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              p95
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Cache
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => {
            const passed = r.passRate >= 1;
            return (
              <TableRow
                key={r.runId}
                className="border-b border-border/60 last:border-b-0"
              >
                <TableCell>
                  <Link
                    href={`/runs/${r.runId}`}
                    className="font-mono text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {formatRunId(r.runId)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/suites/${encodeURIComponent(r.suite)}`}
                    className="text-sm text-foreground hover:text-primary hover:underline"
                  >
                    {r.suite}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.promptVersion}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatTimestamp(r.startedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={passed ? "success" : "destructive"}>
                    {formatPercent(r.passRate)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {r.passedCases}/{r.totalCases}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCostUSD(r.totalCostUSD)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatLatencyMs(r.latencyMsP95)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatPercent(r.cacheHitRate, 0)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
