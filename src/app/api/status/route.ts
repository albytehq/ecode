import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { WORKSPACES_ROOT, ECODE_VERSION } from "@/lib/ecode/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Global "ecode status" overview — mirrors the research's `ecode status` command. */
export async function GET() {
  const [sessions, modelReqs, toolEvents, approvals] = await Promise.all([
    db.session.findMany({ orderBy: { updatedAt: "desc" }, take: 1000 }),
    db.auditLog.findMany({ where: { event: "model_request" }, take: 2000 }),
    db.auditLog.count({ where: { event: "tool_call" } }),
    db.auditLog.count({ where: { event: "approval" } }),
  ]);

  const tokens = modelReqs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);
  const cost = sessions.reduce((s, x) => s + x.estCost, 0);
  const latencies = modelReqs.filter((l) => l.latencyMs != null).map((l) => l.latencyMs!);

  return NextResponse.json({
    ok: true,
    version: ECODE_VERSION,
    name: "Ecode",
    status: {
      sessions: sessions.length,
      activeSessions: sessions.filter((s) => s.status === "active").length,
      yoloSessions: sessions.filter((s) => s.mode === "yolo").length,
      totalTokens: tokens,
      estCost: Number(cost.toFixed(4)),
      toolCalls: toolEvents,
      approvals,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      errors: modelReqs.filter((l) => l.status === "error").length,
      workspacesRoot: WORKSPACES_ROOT,
      uptime: process.uptime(),
      node: process.version,
    },
  });
}
