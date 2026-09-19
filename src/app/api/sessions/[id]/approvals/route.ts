import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAgentLoop } from "@/lib/ecode/agent";
import type { AgentEvent } from "@/lib/ecode/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List pending approvals for a session (also returned by session GET). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const approvals = await db.approval.findMany({
    where: { sessionId: id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    approvals: approvals.map((a) => ({
      id: a.id,
      tool: a.toolName,
      args: JSON.parse(a.args),
      createdAt: a.createdAt,
    })),
  });
}

/**
 * Submit an approval decision. If approved, the tool executes and the agent
 * loop continues — the response is an SSE stream (same protocol as /chat).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
  const decision = body.decision === "approve" ? "approve" : body.decision === "deny" ? "deny" : null;
  if (!approvalId || !decision) {
    return new Response(JSON.stringify({ error: "approvalId and decision are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await runAgentLoop(id, emit, { resumeApprovalId: approvalId, decision, signal: req.signal });
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
        closed = true;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
