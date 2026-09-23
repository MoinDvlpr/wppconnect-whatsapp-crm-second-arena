import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { automationRules, chats, contactLabels, contacts, templates } from "@/db/schema";
import { eventBus, type AppEvent } from "@/lib/events";
import { logger } from "@/lib/logger";
import { newId } from "@/lib/api";
import { contactToVariables, renderTemplate } from "@/lib/template";
import { getSetting } from "./settings.service";
import { MessageService } from "./whatsapp.service";
import type { MessageRow } from "./message.repo";

/** Rule engine foundation: IF (conditions) THEN (actions). Designed so a visual workflow builder can target the same model. */
class AutomationService {
  private started = false;
  private cooldown = new Map<string, number>();
  ensureStarted() {
    if (this.started) return; this.started = true;
    eventBus.on("message.received", (e: AppEvent<MessageRow>) => this.onMessage(e).catch((err) => logger.error("Automation", "rule failed", err)));
    logger.info("Automation", "engine started");
  }
  private async onMessage(e: AppEvent<MessageRow>) {
    const m = e.data; if (!m || m.fromMe || !e.sessionId) return;
    if (m.chatId.endsWith("@g.us") || m.chatId === "status@broadcast") return;
    const text = (m.body ?? m.caption ?? "").trim();
    await this.handleOptKeywords(e.sessionId, m.chatId, text);
    const rules = await db.select().from(automationRules).where(and(eq(automationRules.enabled, true), eq(automationRules.trigger, "message.received"), or(isNull(automationRules.sessionId), eq(automationRules.sessionId, e.sessionId))));
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.sessionId, e.sessionId), eq(contacts.waId, m.chatId)));
    for (const rule of rules) {
      const key = `${rule.id}:${m.chatId}`; const last = this.cooldown.get(key) ?? 0;
      if (Date.now() - last < rule.cooldownSeconds * 1000) continue;
      if (!(await this.matches(rule.conditions, { text, contactId: contact?.id }))) continue;
      this.cooldown.set(key, Date.now());
      for (const a of rule.actions) await this.execute(a, { sessionId: e.sessionId, chatId: m.chatId, contact }).catch((err) => logger.error("Automation", `action ${a.type} failed`, err, { ruleId: rule.id }, e.sessionId));
      await db.update(automationRules).set({ timesTriggered: sql`${automationRules.timesTriggered} + 1`, lastTriggeredAt: new Date() }).where(eq(automationRules.id, rule.id));
      logger.info("Automation", `rule "${rule.name}" triggered`, { chatId: m.chatId }, e.sessionId);
    }
  }
  async matches(conds: { type: string; value?: string; labelId?: string; start?: string; end?: string; days?: number[] }[], ctx: { text: string; contactId?: string }) {
    for (const c of conds) {
      const t = ctx.text.toLowerCase();
      if (c.type === "contains" && !t.includes((c.value ?? "").toLowerCase())) return false;
      if (c.type === "equals" && t !== (c.value ?? "").toLowerCase()) return false;
      if (c.type === "starts_with" && !t.startsWith((c.value ?? "").toLowerCase())) return false;
      if (c.type === "regex") { try { if (!new RegExp(c.value ?? "", "i").test(ctx.text)) return false; } catch { return false; } }
      if (c.type === "has_label") { if (!ctx.contactId || !c.labelId) return false; const r = await db.select().from(contactLabels).where(and(eq(contactLabels.contactId, ctx.contactId), eq(contactLabels.labelId, c.labelId))); if (!r.length) return false; }
      if (c.type === "not_has_label") { if (ctx.contactId && c.labelId) { const r = await db.select().from(contactLabels).where(and(eq(contactLabels.contactId, ctx.contactId), eq(contactLabels.labelId, c.labelId))); if (r.length) return false; } }
      if (c.type === "outside_business_hours" || c.type === "inside_business_hours") {
        const tz = await getSetting<string>("general.timezone", "UTC");
        const now = new Date(); const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
        const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
        const hm = `${parts.hour}:${parts.minute}`; const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
        const days = c.days?.length ? c.days : [1, 2, 3, 4, 5];
        const inside = days.includes(dayIdx) && hm >= (c.start ?? "09:00") && hm <= (c.end ?? "18:00");
        if (c.type === "outside_business_hours" && inside) return false;
        if (c.type === "inside_business_hours" && !inside) return false;
      }
    }
    return true;
  }
  async execute(a: { type: string; text?: string; templateId?: string; labelId?: string; userId?: string }, ctx: { sessionId: string; chatId: string; contact?: typeof contacts.$inferSelect }) {
    const vars = ctx.contact ? contactToVariables(ctx.contact) : {};
    if (a.type === "send_text" && a.text) { await MessageService.sendText(ctx.sessionId, { chatId: ctx.chatId, text: renderTemplate(a.text, { contact: vars }, { fallback: "" }).text }); }
    if (a.type === "send_template" && a.templateId) {
      const [t] = await db.select().from(templates).where(eq(templates.id, a.templateId)); if (!t) return;
      const body = [t.header, t.body, t.footer].filter(Boolean).join("\n\n");
      await MessageService.sendText(ctx.sessionId, { chatId: ctx.chatId, text: renderTemplate(body, { contact: vars }, { fallback: "" }).text });
      await db.update(templates).set({ timesUsed: sql`${templates.timesUsed} + 1`, lastUsedAt: new Date() }).where(eq(templates.id, t.id));
    }
    if (a.type === "add_label" && a.labelId && ctx.contact) await db.insert(contactLabels).values({ id: newId(), contactId: ctx.contact.id, labelId: a.labelId }).onConflictDoNothing();
    if (a.type === "remove_label" && a.labelId && ctx.contact) await db.delete(contactLabels).where(and(eq(contactLabels.contactId, ctx.contact.id), eq(contactLabels.labelId, a.labelId)));
    if (a.type === "assign_user" && a.userId) { await db.update(chats).set({ assignedUserId: a.userId }).where(and(eq(chats.sessionId, ctx.sessionId), eq(chats.waId, ctx.chatId))); if (ctx.contact) await db.update(contacts).set({ ownerUserId: a.userId }).where(eq(contacts.id, ctx.contact.id)); }
    if (a.type === "opt_out" && ctx.contact) await db.update(contacts).set({ optedOut: true, optOutAt: new Date() }).where(eq(contacts.id, ctx.contact.id));
  }
  /** STOP / START keyword handling (opt-out architecture). */
  private async handleOptKeywords(sessionId: string, chatId: string, text: string) {
    const up = text.toUpperCase();
    const outKw = String(await getSetting("automation.optOutKeywords", "STOP,UNSUBSCRIBE")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const inKw = String(await getSetting("automation.optInKeywords", "START,SUBSCRIBE")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (outKw.includes(up)) { await db.update(contacts).set({ optedOut: true, optedIn: false, optOutAt: new Date() }).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, chatId))); eventBus.publish("contact.updated", { chatId, optedOut: true }, { sessionId, chatId }); }
    else if (inKw.includes(up)) { await db.update(contacts).set({ optedOut: false, optedIn: true, optOutAt: null }).where(and(eq(contacts.sessionId, sessionId), eq(contacts.waId, chatId))); eventBus.publish("contact.updated", { chatId, optedOut: false }, { sessionId, chatId }); }
  }
}
const g = globalThis as typeof globalThis & { __automationService?: AutomationService };
export const automationService = g.__automationService ?? (g.__automationService = new AutomationService());
