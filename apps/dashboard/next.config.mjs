/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle so the Dockerfile can ship just
  // .next/standalone + .next/static + public.
  output: "standalone",
  // `better-sqlite3` is a native module — keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // The dashboard is read-only and must never reference ANTHROPIC_API_KEY client-side
  // (ADR-0010). No NEXT_PUBLIC_* env vars belong here.
};

export default nextConfig;
