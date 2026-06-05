import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRunId, formatTimestamp } from "@/lib/format";
import type { PriorPassingRun } from "@/lib/data";

interface Props {
  prior: PriorPassingRun;
  currentOutput: string | null;
  currentPromptVersion: string;
  currentModel: string;
}

export function PriorPassingDiff({
  prior,
  currentOutput,
  currentPromptVersion,
  currentModel,
}: Props) {
  const priorOutput = prior.samples[0]?.output ?? "(no sample)";
  const promptChanged = prior.promptVersion !== currentPromptVersion;
  const modelChanged = prior.model !== currentModel;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last time this case passed</CardTitle>
        <p className="text-sm text-muted-foreground">
          Run{" "}
          <Link
            href={`/runs/${prior.runId}`}
            className="font-mono text-primary underline-offset-4 hover:underline"
          >
            {formatRunId(prior.runId)}
          </Link>{" "}
          on {formatTimestamp(prior.startedAt)}
          {(promptChanged || modelChanged) && (
            <span className="ml-2">
              {promptChanged && (
                <span className="font-mono">
                  prompt {prior.promptVersion} → {currentPromptVersion}
                </span>
              )}
              {promptChanged && modelChanged && <span> · </span>}
              {modelChanged && (
                <span className="font-mono">
                  model {prior.model} → {currentModel}
                </span>
              )}
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <OutputColumn label="Prior output" value={priorOutput} />
        <OutputColumn label="Current output" value={currentOutput ?? "(no sample)"} />
      </CardContent>
    </Card>
  );
}

function OutputColumn({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
        {value}
      </pre>
    </div>
  );
}
