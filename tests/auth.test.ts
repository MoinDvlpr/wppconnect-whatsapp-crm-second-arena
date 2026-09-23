import { describe, expect, it } from "vitest";
import { assertSessionAccess, canRole, generateApiKey, sha256 } from "@/lib/auth";

describe("permissions", () => {
  const p = (role: "ADMIN" | "OPERATOR" | "VIEWER", allowed: string[] = []) => ({ kind: "apiKey" as const, id: "k", name: "k", role, allowedSessions: allowed });
  it("ranks roles", () => { expect(canRole(p("ADMIN"), "OPERATOR")).toBe(true); expect(canRole(p("VIEWER"), "OPERATOR")).toBe(false); expect(canRole(p("OPERATOR"), "ADMIN")).toBe(false); });
  it("restricts API keys to sessions", () => { expect(() => assertSessionAccess(p("ADMIN", ["a"]), "b")).toThrow(); expect(() => assertSessionAccess(p("ADMIN", ["a"]), "a")).not.toThrow(); expect(() => assertSessionAccess(p("VIEWER"), "any")).not.toThrow(); });
  it("generates hashed keys with prefix", () => { const k = generateApiKey(); expect(k.raw.startsWith("wacrm_")).toBe(true); expect(k.hash).toBe(sha256(k.raw)); expect(k.prefix.length).toBe(12); });
});
