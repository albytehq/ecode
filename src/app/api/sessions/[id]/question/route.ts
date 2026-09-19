import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runAgentLoop } from "@/lib/ecode/agent";
import type { AgentEvent } from "@/lib/ecode/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Answer a pending ask_user question and resume the agent loop over SSE. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const questionId = typeof body.questionId === "string" ? body.questionId : "";
  const answer: { selected?: string; text?: string } = {};
  if (typeof body.selected === "string" && body.selected.trim()) answer.selected = body.selected.trim().slice(0, 2000);
  if (typeof body.text === "string" && body.text.trim()) answer.text = body.text.trim().slice(0, 4000);
  if (!questionId || (!answer.selected && !answer.text)) {
    return new Response(JSON.stringify({ error: "questionId and an answer (selected or text) are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const question = await db.userQuestion.findUnique({ where: { id: questionId } });
  if (!question || question.sessionId !== id || question.status !== "pending") {
    return new Response(JSON.stringify({ error: "question not found or already answered" }), {
      status: 404,
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
        await runAgentLoop(id, emit, { resumeQuestionId: questionId, answer, signal: req.signal });
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
