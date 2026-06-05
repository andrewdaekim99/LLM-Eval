"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_SUITES = "__all__";

interface Props {
  suites: string[];
}

export function Filters({ suites }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const current = params.get("suite") ?? ALL_SUITES;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      mutate(next);
      const query = next.toString();
      router.push(query ? `/runs?${query}` : "/runs");
    },
    [params, router],
  );

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex items-center gap-2">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="suite-filter"
        >
          Suite
        </label>
        <Select
          value={current}
          onValueChange={(value) =>
            update((p) => {
              if (value === ALL_SUITES) p.delete("suite");
              else p.set("suite", value);
            })
          }
        >
          <SelectTrigger id="suite-filter" className="h-8 w-[160px]">
            <SelectValue placeholder="All suites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SUITES}>All suites</SelectItem>
            {suites.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="from-filter"
        >
          From
        </label>
        <input
          id="from-filter"
          type="date"
          defaultValue={from.slice(0, 10)}
          onBlur={(e) =>
            update((p) => {
              const v = e.target.value;
              if (v) p.set("from", `${v}T00:00:00.000Z`);
              else p.delete("from");
            })
          }
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="to-filter"
        >
          To
        </label>
        <input
          id="to-filter"
          type="date"
          defaultValue={to.slice(0, 10)}
          onBlur={(e) =>
            update((p) => {
              const v = e.target.value;
              if (v) p.set("to", `${v}T23:59:59.999Z`);
              else p.delete("to");
            })
          }
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
        />
      </div>

      {(current !== ALL_SUITES || from || to) && (
        <button
          type="button"
          onClick={() => router.push("/runs")}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
