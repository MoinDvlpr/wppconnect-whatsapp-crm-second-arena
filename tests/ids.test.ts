import { describe, expect, it } from "vitest";
import { normalizeWhatsAppId, normalizePhoneNumber, toChatId } from "@/lib/ids";

describe("WhatsApp ID normalization", () => {
  it("normalizes plain phone numbers to @c.us", () => { expect(normalizeWhatsAppId("+55 (11) 99999-9999")?.id).toBe("5511999999999@c.us"); });
  it("distinguishes id kinds", () => {
    expect(normalizeWhatsAppId("123@g.us")?.kind).toBe("group"); expect(normalizeWhatsAppId("123@lid")?.kind).toBe("lid"); expect(normalizeWhatsAppId("123@newsletter")?.kind).toBe("newsletter");
    expect(normalizeWhatsAppId("status@broadcast")?.kind).toBe("status"); expect(normalizeWhatsAppId("5511999999999@c.us")?.phone).toBe("5511999999999");
  });
  it("does not treat @lid or groups as phone numbers", () => { expect(normalizeWhatsAppId("999@lid")?.phone).toBeNull(); expect(normalizeWhatsAppId("123-456@g.us")?.phone).toBeNull(); });
  it("accepts serialized Wid objects and s.whatsapp.net", () => { expect(normalizeWhatsAppId({ _serialized: "1@c.us" })?.id).toBe("1@c.us".replace("1@", "1@")); expect(normalizeWhatsAppId("5511999999999@s.whatsapp.net")?.id).toBe("5511999999999@c.us"); });
  it("rejects invalid input", () => { expect(normalizePhoneNumber("12")).toBeNull(); expect(normalizeWhatsAppId("abc")).toBeNull(); expect(() => toChatId("abc")).toThrow(); });
});
