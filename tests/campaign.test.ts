import { describe, expect, it } from "vitest";
import { canTransition, CAMPAIGN_TRANSITIONS } from "@/server/services/campaign.service";

describe("campaign state machine", () => {
  it("allows valid transitions", () => { expect(canTransition("DRAFT", "QUEUED")).toBe(true); expect(canTransition("RUNNING", "PAUSED")).toBe(true); expect(canTransition("PAUSED", "QUEUED")).toBe(true); expect(canTransition("FAILED", "QUEUED")).toBe(true); });
  it("rejects invalid transitions", () => { expect(canTransition("COMPLETED", "RUNNING")).toBe(false); expect(canTransition("CANCELLED", "QUEUED")).toBe(false); expect(canTransition("DRAFT", "COMPLETED")).toBe(false); });
  it("terminal states have no exits except retry", () => { expect(CAMPAIGN_TRANSITIONS.COMPLETED).toEqual([]); expect(CAMPAIGN_TRANSITIONS.CANCELLED).toEqual([]); });
});
