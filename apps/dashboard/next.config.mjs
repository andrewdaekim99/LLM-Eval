/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle so the Dockerfile can ship just
  // .next/standalone + .next/static + public.
  output: "standalone",
  // `better-sqlite3` is a native module — keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // @yardstick/core's package.json declares a `development` exports condition
  // that points at TS source (consumed by the CLI + vitest). Next's webpack
  // would otherwise pick it up automatically in dev and choke on `.js`
  // specifiers that map to `.ts` files — pin webpack to import/require/default
  // so it resolves the built dist/ instead. The `predev` script ensures dist
  // is built before `next dev` starts.
  //
  // better-sqlite3 + its `bindings` helper resolve a native `.node` file at
  // runtime via dynamic require — webpack can't statically bundle that, so
  // mark them external for the server build.
  webpack: (config, { isServer }) => {
    config.resolve.conditionNames = ["node", "import", "require", "default"];
    if (isServer) {
      const externals = config.externals;
      const native = ["better-sqlite3", "bindings"];
      config.externals = Array.isArray(externals)
        ? [
            ...externals,
            ({ request }, callback) => {
              if (request && native.includes(request)) {
                return callback(null, `commonjs ${request}`);
              }
              return callback();
            },
          ]
        : externals;
    }
    return config;
  },
  // The dashboard is read-only and must never reference ANTHROPIC_API_KEY client-side
  // (ADR-0010). No NEXT_PUBLIC_* env vars belong here.
};

export default nextConfig;
