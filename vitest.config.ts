import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const dashboardRoot = new URL("./apps/dashboard/", import.meta.url).pathname;
const dashboardModules = `${dashboardRoot}node_modules`;

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  plugins: [react()],
  resolve: {
    alias: {
      "@": dashboardRoot,
      // React + jsx-runtime live under apps/dashboard/node_modules (not hoisted
      // to root). Point vite at them so the React plugin's auto-inject works.
      react: `${dashboardModules}/react`,
      "react-dom": `${dashboardModules}/react-dom`,
      "react-dom/client": `${dashboardModules}/react-dom/client.js`,
      "react/jsx-runtime": `${dashboardModules}/react/jsx-runtime.js`,
      "react/jsx-dev-runtime": `${dashboardModules}/react/jsx-dev-runtime.js`,
      // `server-only` throws at import outside an RSC context — neutralize it
      // for component tests so we can render server-component-shaped code.
      "server-only": `${dashboardRoot}test/server-only.ts`,
    },
  },
  test: {
    globals: false,
    include: [
      "packages/*/test/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "apps/dashboard/**/*.test.{ts,tsx}",
    ],
    // Dashboard tests need jsdom for React Testing Library; core stays on
    // node where SQLite + the cached transport actually run.
    environmentMatchGlobs: [
      ["apps/dashboard/**", "jsdom"],
      ["**/*", "node"],
    ],
    setupFiles: ["apps/dashboard/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/types.ts", "**/index.ts"],
    },
  },
});
