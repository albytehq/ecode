import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runAgentLoop } from "@/lib/ecode/agent";
import type { AgentEvent } from "@/lib/ecode/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return new Response(JSON.stringify({ error: "session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Save the user message before starting the loop
  const userMsg = await db.message.create({
    data: { sessionId: id, role: "user", content: message.slice(0, 100_000) },
  });

  // Auto-title from the first message
  if (session.title === "New session") {
    const title = message.split("\n")[0].slice(0, 60);
    await db.session.update({ where: { id }, data: { title } });
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
      emit({ type: "message_saved", id: userMsg.id, role: "user", content: userMsg.content });
      try {
        // req.signal fires when the client disconnects (reload, tab close, session
        // switch) — it aborts in-flight LLM fetches so no orphan keeps burning tokens.
        await runAgentLoop(id, emit, { signal: req.signal });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          // client went away mid-stream — nothing to emit to
        } else {
          emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
        }
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
    cancel() {
      // called when the client aborts the fetch — the req.signal path above
      // handles aborting the agent loop; nothing else to release here.
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
