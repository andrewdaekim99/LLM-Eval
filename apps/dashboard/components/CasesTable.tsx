import Link from "next/link";

import { PassFailBadge } from "@/components/PassFailBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { meanScoreValue, type StoredCase } from "@/lib/data";

interface Props {
  runId: string;
  cases: StoredCase[];
}

export function CasesTable({ runId, cases }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Case</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Scorers</TableHead>
          <TableHead className="text-right">Mean score</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => {
          const scorers = c.aggregateScores.map((s) => s.scorer).join(", ");
          const mean = meanScoreValue(c.aggregateScores);
          return (
            <TableRow key={c.caseId} className="font-mono">
              <TableCell>
                <Link
                  href={`/runs/${runId}/cases/${encodeURIComponent(c.caseId)}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {c.caseId}
                </Link>
              </TableCell>
              <TableCell>
                <PassFailBadge passed={c.passed} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {scorers || "—"}
              </TableCell>
              <TableCell className="text-right text-sm">
                {mean === null ? "—" : mean.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {c.passed ? "" : "regressed"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
