import { describe, expect, it } from "vitest";
import { CAPABILITIES, discoverRuntimeMethods, runCapabilityAudit } from "@/server/wpp/capability-registry";

describe("WPPConnect capability registry (against installed package)", () => {
  it("has no duplicate methods", () => { const names = CAPABILITIES.map((c) => c.method); expect(new Set(names).size).toBe(names.length); });
  it("every SUPPORTED capability exists on the installed Whatsapp client", () => {
    const runtime = new Set(discoverRuntimeMethods());
    const missing = CAPABILITIES.filter((c) => c.status !== "UNSUPPORTED" && !runtime.has(c.method)).map((c) => c.method);
    expect(missing).toEqual([]);
  });
  it("audit reports counts", () => { const a = runCapabilityAudit(); expect(a.mapped).toBeGreaterThan(100); expect(a.version).toMatch(/^\d+\.\d+\.\d+/); });
});
