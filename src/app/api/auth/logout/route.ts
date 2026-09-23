import { ok } from "@/lib/api";
import { audit, destroyUserSession, getUserFromCookie } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function POST() { const p = await getUserFromCookie(); await destroyUserSession(); await audit(p, "logout"); return ok({ loggedOut: true }); }
