export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { bootstrap } = await import("./server/bootstrap");
    bootstrap().catch((e) => console.error("[bootstrap] failed", e));
  }
}
