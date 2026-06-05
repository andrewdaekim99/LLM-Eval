import Link from "next/link";

import { DeltaCards } from "@/components/DeltaCards";
import { DiffGroup } from "@/components/DiffGroup";
import { DiffPicker } from "@/components/DiffPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCostUSD,
  formatLatencyMs,
  formatPercent,
  formatRunId,
  formatTimestamp,
} from "@/lib/format";
import { getDiff, listRuns, type CaseDiff } from "@/lib/data";

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function DiffPage({ searchParams }: PageProps) {
  const { a, b } = await searchParams;

  if (!a || !b) {
    const runs = listRuns({ limit: 50 });
    return (
      <div className="space-y-6">
        <div>
          <h1 className="cli-prompt font-display text-3xl">diff</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            // compare two runs side-by-side
          </p>
        </div>
        <Card>
          <CardContent className="py-6">
            <DiffPicker runs={runs} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const report = getDiff(a, b);
  if (!report) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Diff</h1>
        <Card>
          <CardContent className="py-6 text-sm">
            Could not resolve both run IDs. They may not exist, or the prefix is too
            short / ambiguous.
            <div className="mt-3">
              <Link href="/diff" className="text-primary underline-offset-4 hover:underline">
                ← Start over
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const grouped = groupDiffs(report.diffs);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="cli-prompt font-display text-3xl">diff</h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          // {report.a.suite}/{report.a.promptVersion} → {report.b.suite}/
          {report.b.promptVersion}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <RunHeader label="A · baseline" run={report.a} />
        <RunHeader label="B · compare" run={report.b} />
      </div>

      <DeltaCards
        passRate={{
          label: "Pass rate Δ",
          value: report.passRateDelta,
          format: (v) => formatPercent(v, 1),
        }}
        cost={{
          label: "Total cost Δ",
          value: report.costDelta,
          format: formatCostUSD,
          inverse: true,
        }}
        latency={{
          label: "p95 latency Δ",
          value: report.latencyP95Delta,
          format: (v) => formatLatencyMs(v),
          inverse: true,
        }}
      />

      <DiffGroup
        title="Regressed"
        description="Passed in A, failing in B."
        runIdB={report.b.runId}
        diffs={grouped.regressed}
        emptyMessage="No regressions."
      />
      <DiffGroup
        title="Fixed"
        description="Failing in A, passing in B."
        runIdB={report.b.runId}
        diffs={grouped.fixed}
        emptyMessage="No newly fixed cases."
      />
      <DiffGroup
        title="Still failing"
        description="Failing in both runs."
        runIdB={report.b.runId}
        diffs={grouped.stillFailing}
      />
      <DiffGroup
        title="Added in B"
        runIdB={report.b.runId}
        diffs={grouped.new}
      />
      <DiffGroup
        title="Removed in B"
        runIdB={report.a.runId}
        diffs={grouped.removed}
      />
    </div>
  );
}

function RunHeader({
  label,
  run,
}: {
  label: string;
  run: { runId: string; suite: string; promptVersion: string; model: string; startedAt: string };
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <CardTitle className="font-mono text-base">
          <Link
            href={`/runs/${run.runId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {formatRunId(run.runId)}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {run.suite} · prompt {run.promptVersion} · model {run.model}
        <br />
        {formatTimestamp(run.startedAt)}
      </CardContent>
    </Card>
  );
}

function groupDiffs(diffs: readonly CaseDiff[]) {
  const regressed: CaseDiff[] = [];
  const fixed: CaseDiff[] = [];
  const stillFailing: CaseDiff[] = [];
  const newCases: CaseDiff[] = [];
  const removed: CaseDiff[] = [];
  for (const d of diffs) {
    if (d.kind === "regressed") regressed.push(d);
    else if (d.kind === "fixed") fixed.push(d);
    else if (d.kind === "still-failing") stillFailing.push(d);
    else if (d.kind === "new") newCases.push(d);
    else if (d.kind === "removed") removed.push(d);
  }
  return { regressed, fixed, stillFailing, new: newCases, removed };
}
