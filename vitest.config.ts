import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

function loadEnvFile(filename: string): void {
  const envPath = path.resolve(__dirname, filename);
  try {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  } catch {
    // optional; CI injects DATABASE_URL
  }
}

loadEnvFile(".env.test");
if (!process.env.DATABASE_URL) {
  loadEnvFile(".env");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    env: process.env.DATABASE_URL
      ? { DATABASE_URL: process.env.DATABASE_URL }
      : undefined,
    setupFiles: ["./apps/web/src/app/api/__tests__/setup.ts"],
  },
});
