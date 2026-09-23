import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, fileParallelism: false, environment: "node" }, resolve: { alias: { "@": path.resolve(__dirname, "src") } } });
