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
      <div className="rounded-sm border border-dashed border-border p-10 text-center font-mono text-sm text-muted-foreground">
        // no runs match the current filters
      </div>
    );
  }

  return (
    <div className="phosphor-border rounded-sm bg-card/40">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/70 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-widest text-primary">
              run
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-widest text-primary">
              suite
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-widest text-primary">
              prompt
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-widest text-primary">
              started
            </TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-widest text-primary">
              pass
            </TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-widest text-primary">
              cases
            </TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-widest text-primary">
              cost
            </TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-widest text-primary">
              p95
            </TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-widest text-primary">
              cache
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => {
            const passed = r.passRate >= 1;
            return (
              <TableRow
                key={r.runId}
                className="border-b border-border/40 font-mono"
              >
                <TableCell>
                  <Link
                    href={`/runs/${r.runId}`}
                    className="text-primary underline-offset-4 hover:underline"
                    style={{
                      textShadow: "0 0 6px hsl(var(--primary) / 0.5)",
                    }}
                  >
                    {formatRunId(r.runId)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/suites/${encodeURIComponent(r.suite)}`}
                    className="text-sm text-foreground/80 hover:text-primary hover:underline"
                  >
                    {r.suite}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.promptVersion}
                </TableCell>
                <TableCell className="text-sm">
                  {formatTimestamp(r.startedAt)}
                </TableCell>
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
    </div>
  );
}
