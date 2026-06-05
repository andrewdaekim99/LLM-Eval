import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { meanScoreValue, type CaseDiff } from "@/lib/data";

interface Props {
  title: string;
  description?: string;
  runIdB: string;
  diffs: readonly CaseDiff[];
  emptyMessage?: string;
}

export function DiffGroup({ title, description, runIdB, diffs, emptyMessage }: Props) {
  if (diffs.length === 0 && !emptyMessage) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title}{" "}
          <span className="ml-1 font-mono text-sm text-muted-foreground">
            ({diffs.length})
          </span>
        </CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {diffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y text-sm">
            {diffs.map((d) => {
              const ma = meanScoreValue(d.aScores);
              const mb = meanScoreValue(d.bScores);
              return (
                <li
                  key={d.caseId}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <Link
                    href={`/runs/${runIdB}/cases/${encodeURIComponent(d.caseId)}`}
                    className="font-mono text-primary underline-offset-4 hover:underline"
                  >
                    {d.caseId}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">
                    {fmt(ma)} → {fmt(mb)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}
