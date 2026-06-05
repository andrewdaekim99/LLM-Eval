"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatRunId, formatTimestamp } from "@/lib/format";
import type { RunListEntry } from "@/lib/data";

interface Props {
  runs: RunListEntry[];
}

export function DiffPicker({ runs }: Props) {
  const router = useRouter();
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick two runs to compare. The diff highlights regressed and fixed cases,
        plus pass-rate / cost / latency deltas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <RunCombo label="Run A (baseline)" value={a} onChange={setA} runs={runs} />
        <RunCombo label="Run B (compare)" value={b} onChange={setB} runs={runs} />
      </div>
      <Button
        disabled={!a || !b || a === b}
        onClick={() => router.push(`/diff?a=${a}&b=${b}`)}
      >
        Compare
      </Button>
    </div>
  );
}

function RunCombo({
  label,
  value,
  onChange,
  runs,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  runs: RunListEntry[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
      >
        <option value="">— select a run —</option>
        {runs.map((r) => (
          <option key={r.runId} value={r.runId}>
            {formatRunId(r.runId)} · {r.suite}/{r.promptVersion} ·{" "}
            {formatTimestamp(r.startedAt)}
          </option>
        ))}
      </select>
    </label>
  );
}
