import { Suspense } from "react";
import Link from "next/link";

import { Filters } from "@/components/Filters";
import { listSuites } from "@/lib/data";

export function TopNav() {
  const suites = listSuites();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <Link href="/runs" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Yardstick
          </span>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            eval
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm font-medium">
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
