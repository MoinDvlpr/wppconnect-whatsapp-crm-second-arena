import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, fail, ok, parseBody } from "@/lib/api";
import { audit, clientIp, createUserSession, rateLimit, verifyPassword } from "@/lib/auth";
import { bootstrap } from "@/server/bootstrap";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    await bootstrap();
    rateLimit(`login:${clientIp(req) ?? "local"}`, 10, 60_000);
    const { email, password } = await parseBody(req, z.object({ email: z.string().email(), password: z.string().min(1) }));
    const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!u || !(await verifyPassword(password, u.passwordHash))) throw new ApiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    await createUserSession(u.id);
    await audit({ kind: "user", id: u.id, name: u.name, role: u.role as "ADMIN", allowedSessions: [] }, "login", { ip: clientIp(req) });
    return ok({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (e) { return fail(e); }
}
