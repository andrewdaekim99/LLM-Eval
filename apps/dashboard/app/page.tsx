export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Yardstick</h1>
      <p className="mt-3 text-neutral-600">
        Claude-native LLM evaluation &amp; observability harness.
      </p>
      <p className="mt-8 text-sm text-neutral-500">
        Dashboard ships in Phase 4. For now: <code>pnpm yardstick --help</code>.
      </p>
    </main>
  );
}
