import Link from "next/link";
import { notFound } from "next/navigation";

import { RunsTable } from "@/components/RunsTable";
import { SuiteTrendChart } from "@/components/SuiteTrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSuiteTrend, listRuns, listSuites } from "@/lib/data";

interface PageProps {
  params: Promise<{ suite: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function SuitePage({ params, searchParams }: PageProps) {
  const { suite } = await params;
  const decodedSuite = decodeURIComponent(suite);
  if (!listSuites().includes(decodedSuite)) notFound();

  const { from, to } = await searchParams;
  const points = getSuiteTrend(decodedSuite, { from, to });
  const runs = listRuns({ suite: decodedSuite, from, to, limit: 50 });

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link href="/runs" className="underline-offset-4 hover:underline">
          ← All runs
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Suite: <span className="font-mono">{decodedSuite}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {points.length === 0
            ? "No runs yet for this suite."
            : `${points.length} run${points.length === 1 ? "" : "s"} over time.`}
        </p>
      </div>

      <SuiteTrendChart points={points} />

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <RunsTable runs={runs} />
        </CardContent>
      </Card>
    </div>
  );
}
