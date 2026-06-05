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
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No runs match the current filters.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Run</TableHead>
          <TableHead>Suite</TableHead>
          <TableHead>Prompt</TableHead>
          <TableHead>Started</TableHead>
          <TableHead className="text-right">Pass rate</TableHead>
          <TableHead className="text-right">Cases</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">p95 latency</TableHead>
          <TableHead className="text-right">Cache</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => {
          const passed = r.passRate >= 1;
          return (
            <TableRow key={r.runId} className="font-mono">
              <TableCell>
                <Link
                  href={`/runs/${r.runId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {formatRunId(r.runId)}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  href={`/suites/${encodeURIComponent(r.suite)}`}
                  className="text-sm hover:underline"
                >
                  {r.suite}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.promptVersion}
              </TableCell>
              <TableCell className="text-sm">{formatTimestamp(r.startedAt)}</TableCell>
              <TableCell className="text-right">
                <Badge variant={passed ? "success" : "destructive"}>
                  {formatPercent(r.passRate)}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-sm">
                {r.passedCases}/{r.totalCases}
              </TableCell>
              <TableCell className="text-right text-sm">
                {formatCostUSD(r.totalCostUSD)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {formatLatencyMs(r.latencyMsP95)}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatPercent(r.cacheHitRate, 0)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
