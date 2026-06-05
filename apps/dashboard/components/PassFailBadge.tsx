import { Badge } from "@/components/ui/badge";

interface Props {
  passed: boolean;
  passLabel?: string;
  failLabel?: string;
}

export function PassFailBadge({ passed, passLabel = "pass", failLabel = "fail" }: Props) {
  return (
    <Badge variant={passed ? "success" : "destructive"}>
      {passed ? passLabel : failLabel}
    </Badge>
  );
}
