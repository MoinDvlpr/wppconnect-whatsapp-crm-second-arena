import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
  { rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/exhaustive-deps": "warn", "@next/next/no-img-element": "off", "@next/next/no-html-link-for-pages": "off" } },
]);
