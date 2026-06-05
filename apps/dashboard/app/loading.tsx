export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
