import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteWorkspace } from "@/lib/ecode/workspace";
import { audit } from "@/lib/ecode/audit";
import { getModel, getProvider } from "@/lib/ecode/constants";
import { findCatalogModel } from "@/lib/ecode/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await db.session.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      changesets: { orderBy: { createdAt: "desc" } },
      approvals: { orderBy: { createdAt: "desc" }, take: 10 },
      questions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const pendingApproval = session.approvals.find((a) => a.status === "pending");
  const pendingQuestionRow = session.questions.find((q) => q.status === "pending");
  let pendingQuestion: { id: string; payload: Record<string, unknown> } | null = null;
  if (pendingQuestionRow) {
    try {
      pendingQuestion = { id: pendingQuestionRow.id, payload: JSON.parse(pendingQuestionRow.question) };
    } catch {
      pendingQuestion = null;
    }
  }

  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      provider: session.provider,
      model: session.model,
      mode: session.mode,
      agentMode: session.agentMode,
      thinking: session.thinking,
      status: session.status,
      contextLimit: session.contextLimit,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
      totalTokens: session.totalTokens,
      estCost: session.estCost,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      reasoning: m.reasoning,
      toolName: m.toolName,
      toolStatus: m.toolStatus,
      toolArgs: m.toolArgs,
      toolResult: m.toolResult,
      latencyMs: m.latencyMs,
      tokens: m.tokens,
      createdAt: m.createdAt,
    })),
    changesets: session.changesets.map((c) => ({
      id: c.id,
      filePath: c.filePath,
      action: c.action,
      diff: c.diff,
      status: c.status,
      createdAt: c.createdAt,
    })),
    pendingApproval: pendingApproval
      ? {
          id: pendingApproval.id,
          tool: pendingApproval.toolName,
          args: JSON.parse(pendingApproval.args),
          createdAt: pendingApproval.createdAt,
        }
      : null,
    pendingQuestion,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Record<string, string | number> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 80);
  if (typeof body.provider === "string" && getProvider(body.provider)) data.provider = body.provider;
  if (typeof body.model === "string") {
    const targetProvider = String(data.provider ?? session.provider);
    const known = getModel(targetProvider, body.model)
      ?? (await findCatalogModel(targetProvider, body.model).catch(() => null));
    if (known) {
      data.model = body.model;
      data.contextLimit = known.contextLimit;
    }
  }
  if (body.mode === "manual" || body.mode === "auto" || body.mode === "yolo") {
    data.mode = body.mode;
    if (body.mode !== session.mode) {
      await audit({
        sessionId: id,
        event: "yolo_toggle",
        userAction: `mode:${body.mode}`,
        status: "success",
        detail: { from: session.mode, to: body.mode },
      });
    }
  }
  if (body.agentMode === "build" || body.agentMode === "plan") {
    data.agentMode = body.agentMode;
  }
  if (body.thinking === "off" || body.thinking === "think" || body.thinking === "ultrathink") {
    data.thinking = body.thinking;
  }

  const updated = await db.session.update({ where: { id }, data });
  return NextResponse.json({ session: { ...updated, workspace: undefined } });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  deleteWorkspace(session.workspace);
  await db.session.delete({ where: { id } });
  await audit({ sessionId: null, event: "session_end", userAction: "delete", status: "success", detail: { deletedSessionId: id } });
  return NextResponse.json({ ok: true });
}
