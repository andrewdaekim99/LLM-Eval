/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard is read-only and must never reference ANTHROPIC_API_KEY client-side
  // (ADR-0010). No NEXT_PUBLIC_* env vars belong here.
};

export default nextConfig;
