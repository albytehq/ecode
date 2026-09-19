import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100);
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // aggregate stats
  const modelReqs = await db.auditLog.findMany({
    where: { event: "model_request" },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const totalTokens = modelReqs.reduce((s, l) => s + (l.totalTokens ?? 0), 0);
  const errors = modelReqs.filter((l) => l.status === "error").length;
  const latencies = modelReqs.filter((l) => l.latencyMs != null).map((l) => l.latencyMs!);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const toolCalls = await db.auditLog.count({ where: { event: "tool_call" } });
  const approvals = await db.auditLog.count({ where: { event: "approval" } });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      sessionId: l.sessionId,
      event: l.event,
      provider: l.provider,
      model: l.model,
      promptTokens: l.promptTokens,
      completionTokens: l.completionTokens,
      totalTokens: l.totalTokens,
      latencyMs: l.latencyMs,
      status: l.status,
      errorCode: l.errorCode,
      userAction: l.userAction,
      detail: l.detail,
      createdAt: l.createdAt,
    })),
    stats: {
      modelRequests: modelReqs.length,
      totalTokens,
      errors,
      errorRate: modelReqs.length ? Math.round((errors / modelReqs.length) * 100) : 0,
      avgLatencyMs: avgLatency,
      toolCalls,
      approvals,
    },
  });
}
