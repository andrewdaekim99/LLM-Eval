import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoredJudgeVerdict } from "@/lib/data";

interface Props {
  verdicts: StoredJudgeVerdict[];
}

export function JudgePanel({ verdicts }: Props) {
  if (verdicts.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>llmJudge verdicts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {verdicts.map((v) => (
          <div key={`${v.sampleIndex}-${v.scorer}`} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={badgeVariant(v.verdict)}>{v.verdict}</Badge>
              <span className="font-mono text-muted-foreground">
                score {v.score.toFixed(2)}
              </span>
              <span className="text-muted-foreground">sample {v.sampleIndex}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">judge {v.judgeModel}</span>
            </div>
            <p className="text-sm leading-relaxed">{v.reason}</p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">rubric</summary>
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 leading-relaxed">
                {v.rubric}
              </p>
            </details>
            {v.samples.length > 1 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  {v.samples.length} judge samples
                </summary>
                <ul className="mt-2 space-y-1">
                  {v.samples.map((s, i) => (
                    <li key={i} className="font-mono">
                      {i}: {s.verdict} ({s.score.toFixed(2)}) — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function badgeVariant(
  verdict: string,
): "success" | "destructive" | "secondary" | "default" {
  if (verdict === "pass") return "success";
  if (verdict === "fail") return "destructive";
  return "secondary";
}
