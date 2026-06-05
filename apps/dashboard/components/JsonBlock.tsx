import { cn } from "@/lib/utils";

interface Props {
  value: unknown;
  className?: string;
  maxHeight?: string;
}

export function JsonBlock({ value, className, maxHeight = "20rem" }: Props) {
  const formatted =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed",
        className,
      )}
      style={{ maxHeight }}
    >
      {formatted}
    </pre>
  );
}
