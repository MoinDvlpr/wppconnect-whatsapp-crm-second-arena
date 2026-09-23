import { describe, expect, it } from "vitest";
import { ackToStatus, normalizeMessage, normalizeChat, messagePreview } from "@/server/wpp/normalize";

describe("message normalization", () => {
  const raw = { id: { _serialized: "true_5511999999999@c.us_ABC", fromMe: true, remote: "5511999999999@c.us" }, body: "hi", type: "chat", t: 1700000000, from: "me@c.us", to: "5511999999999@c.us", ack: 2, fromMe: true, mentionedJidList: [], isForwarded: false, star: false } as never;
  it("normalizes a text message", () => {
    const n = normalizeMessage(raw, "s1")!;
    expect(n.id).toBe("true_5511999999999@c.us_ABC"); expect(n.chatId).toBe("5511999999999@c.us"); expect(n.status).toBe("DELIVERED"); expect(n.fromMe).toBe(true); expect(n.body).toBe("hi"); expect(n.rawPayload).toBeUndefined();
  });
  it("maps ack codes", () => { expect(ackToStatus(-1, true)).toBe("FAILED"); expect(ackToStatus(1, true)).toBe("SENT"); expect(ackToStatus(3, true)).toBe("READ"); expect(ackToStatus(0, false)).toBe("READ"); });
  it("detects media and revoked", () => {
    const m = normalizeMessage({ ...(raw as object), type: "image", mimetype: "image/jpeg", caption: "c", body: "" } as never, "s1")!;
    expect(m.hasMedia).toBe(true); expect(m.caption).toBe("c"); expect(messagePreview(m)).toContain("📷");
    expect(normalizeMessage({ ...(raw as object), type: "revoked" } as never, "s1")!.revoked).toBe(true);
  });
  it("normalizes chats", () => { const c = normalizeChat({ id: { _serialized: "1@g.us" }, isGroup: true, name: "Team", unreadCount: 2, t: 1700000000, archive: false, pin: 0, muteExpiration: 0 } as never, "s1")!; expect(c.kind).toBe("group"); expect(c.unreadCount).toBe(2); });
});
