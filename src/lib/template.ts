/** Application-level template renderer ({{variable}} syntax). Not Meta Cloud API templates. */
export const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export interface RenderContext {
  contact?: Record<string, string | null | undefined>;
  custom?: Record<string, string | null | undefined>;
  campaign?: Record<string, string | null | undefined>;
}
export interface RenderResult { text: string; missing: string[]; used: string[]; }

export function extractVariables(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(VARIABLE_REGEX)) set.add(m[1]);
  return [...set];
}

export function validateTemplateBody(body: string): string[] {
  const errors: string[] = [];
  if (!body || !body.trim()) errors.push("Body cannot be empty");
  const opens = (body.match(/\{\{/g) || []).length;
  const closes = (body.match(/\}\}/g) || []).length;
  if (opens !== closes) errors.push("Unbalanced {{ }} braces");
  const bad = (body.match(/\{\{[^}]*\}\}/g) || []).filter((m) => !/^\{\{\s*[a-zA-Z0-9_.]+\s*\}\}$/.test(m));
  if (bad.length) errors.push(`Invalid variable names: ${bad.join(", ")}`);
  return errors;
}

/** Explicit missing-variable behaviour: never sends "{{unknown}}" – returns missing list; caller decides (fail or fallback). */
export function renderTemplate(text: string, ctx: RenderContext, opts: { fallback?: string; strict?: boolean } = {}): RenderResult {
  const missing: string[] = []; const used: string[] = [];
  const lookup = (key: string): string | undefined => {
    const sources = [ctx.campaign, ctx.custom, ctx.contact];
    for (const s of sources) {
      if (!s) continue;
      const v = s[key];
      if (v !== undefined && v !== null && String(v).length > 0) return String(v);
    }
    return undefined;
  };
  const out = text.replace(VARIABLE_REGEX, (_m, key: string) => {
    const v = lookup(key);
    if (v === undefined) { missing.push(key); return opts.fallback ?? ""; }
    used.push(key); return v;
  });
  if (opts.strict && missing.length) throw new TemplateRenderError(missing);
  return { text: out, missing: [...new Set(missing)], used: [...new Set(used)] };
}

export class TemplateRenderError extends Error {
  constructor(public missing: string[]) { super(`Missing template variables: ${missing.join(", ")}`); }
}

export function contactToVariables(c: { name?: string | null; pushName?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; company?: string | null; waId?: string | null }): Record<string, string | null | undefined> {
  const display = c.name || c.pushName || "";
  const first = c.firstName || display.split(" ")[0] || "";
  return {
    name: display, first_name: first, last_name: c.lastName || display.split(" ").slice(1).join(" "),
    phone: c.phone, email: c.email, company: c.company, wa_id: c.waId,
  };
}
