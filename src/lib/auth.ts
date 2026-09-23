import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, auditLogs, userSessions, users } from "@/db/schema";
import { ApiError, forbidden, newId, unauthorized } from "./api";

export type Role = "ADMIN" | "OPERATOR" | "VIEWER";
export interface Principal {
  kind: "user" | "apiKey";
  id: string;
  name: string;
  role: Role;
  allowedSessions: string[]; // empty = all
}
export const COOKIE = "wacrm_session";
const ROLE_RANK: Record<Role, number> = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function createUserSession(userId: string) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await db.insert(userSessions).values({ id, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false", path: "/", expires: expiresAt });
  return id;
}
export async function destroyUserSession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.delete(userSessions).where(eq(userSessions.id, id));
  jar.delete(COOKIE);
}

export async function getUserFromCookie(): Promise<Principal | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const rows = await db.select({ u: users }).from(userSessions).innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.id, id), gt(userSessions.expiresAt, new Date()))).limit(1);
  const u = rows[0]?.u;
  if (!u) return null;
  return { kind: "user", id: u.id, name: u.name, role: u.role as Role, allowedSessions: [] };
}

export async function getPrincipalFromApiKey(raw: string): Promise<Principal | null> {
  const keyHash = sha256(raw);
  const [k] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  if (!k || k.revokedAt) return null;
  if (k.expiresAt && k.expiresAt < new Date()) return null;
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id)).catch(() => {});
  return { kind: "apiKey", id: k.id, name: k.name, role: k.role as Role, allowedSessions: k.allowedSessions ?? [] };
}

export async function getPrincipal(req?: Request): Promise<Principal | null> {
  const h = req ? req.headers : await headers();
  const apiKey = h.get("x-api-key") || (h.get("authorization")?.startsWith("Bearer ") ? h.get("authorization")!.slice(7) : null);
  if (apiKey) return getPrincipalFromApiKey(apiKey);
  return getUserFromCookie();
}

export async function requireAuth(req: Request, minRole: Role = "VIEWER"): Promise<Principal> {
  const p = await getPrincipal(req);
  if (!p) throw unauthorized();
  // CSRF: for cookie-authenticated mutating requests, require same-origin.
  if (p.kind === "user" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin"); const host = req.headers.get("host");
    if (origin && host && !origin.includes(host)) throw new ApiError("CSRF", "Cross-site request rejected", 403);
  }
  if (ROLE_RANK[p.role] < ROLE_RANK[minRole]) throw forbidden(`Requires ${minRole} role`);
  return p;
}
export function assertSessionAccess(p: Principal, sessionId: string) {
  if (p.allowedSessions.length && !p.allowedSessions.includes(sessionId)) throw forbidden("API key is not allowed to access this session");
}
export function canRole(p: Principal, minRole: Role) { return ROLE_RANK[p.role] >= ROLE_RANK[minRole]; }

export function generateApiKey() {
  const raw = `wacrm_${randomBytes(24).toString("base64url")}`;
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 12) };
}

export async function audit(p: Principal | null, action: string, opts: { resource?: string; resourceId?: string; sessionId?: string; ip?: string | null; metadata?: Record<string, unknown> } = {}) {
  try {
    await db.insert(auditLogs).values({ userId: p?.id ?? null, userName: p?.name ?? "system", action, resource: opts.resource, resourceId: opts.resourceId, sessionId: opts.sessionId, ip: opts.ip ?? null, metadata: opts.metadata ?? null });
  } catch (e) { console.error("audit failed", (e as Error).message); }
}
export function clientIp(req: Request) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null; }

/** Simple in-memory rate limiter (per key). */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit = 120, windowMs = 60_000) {
  const nowTs = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < nowTs) { buckets.set(key, { count: 1, reset: nowTs + windowMs }); return; }
  b.count++;
  if (b.count > limit) throw new ApiError("RATE_LIMITED", "Too many requests", 429);
}

export async function ensureAdminUser() {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) return;
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "admin12345";
  await db.insert(users).values({ id: newId(), email, passwordHash: await hashPassword(password), name: "Administrator", role: "ADMIN" });
  console.log(`[bootstrap] Created default admin user ${email} (change the password in Settings)`);
}
