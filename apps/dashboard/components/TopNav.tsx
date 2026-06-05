import { Suspense } from "react";
import Link from "next/link";

import { Filters } from "@/components/Filters";
import { listSuites } from "@/lib/data";

export function TopNav() {
  const suites = listSuites();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <Link href="/runs" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Yardstick</span>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            dashboard
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/runs"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Runs
          </Link>
          <Link
            href="/diff"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Diff
          </Link>
        </nav>
        <Suspense fallback={<div className="h-8" />}>
          <Filters suites={suites} />
        </Suspense>
      </div>
    </header>
  );
}
