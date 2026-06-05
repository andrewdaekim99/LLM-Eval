import { Suspense } from "react";
import Link from "next/link";

import { Filters } from "@/components/Filters";
import { listSuites } from "@/lib/data";

export function TopNav() {
  const suites = listSuites();
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <Link href="/runs" className="flex items-baseline gap-2">
          <span className="font-display text-2xl leading-none text-primary">
            ▰ YARDSTICK
          </span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            v0.1 // eval harness
          </span>
        </Link>
        <nav className="flex items-center gap-5 font-mono text-sm uppercase tracking-wider">
          <Link
            href="/runs"
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            runs
          </Link>
          <Link
            href="/diff"
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            diff
          </Link>
        </nav>
        <Suspense fallback={<div className="h-8" />}>
          <Filters suites={suites} />
        </Suspense>
      </div>
    </header>
  );
}
