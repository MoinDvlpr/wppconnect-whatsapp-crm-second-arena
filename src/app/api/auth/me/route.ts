import { ok } from "@/lib/api";
import { getUserFromCookie } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() { const p = await getUserFromCookie(); return ok(p ? { id: p.id, name: p.name, role: p.role } : null); }
