import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureWorkspaceRoot, createWorkspace, resolveExternalWorkspace } from "@/lib/ecode/workspace";
import { audit } from "@/lib/ecode/audit";
import { getModel } from "@/lib/ecode/constants";
import { findCatalogModel } from "@/lib/ecode/catalog";
import { resolveDefaultModel } from "@/lib/ecode/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await db.session.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      provider: s.provider,
      model: s.model,
      mode: s.mode,
      agentMode: s.agentMode,
      thinking: s.thinking,
      status: s.status,
      totalTokens: s.totalTokens,
      estCost: s.estCost,
      messageCount: s._count.messages,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Defaults come from Settings → General (server-side AppSetting rows).
  const fallback = await resolveDefaultModel();
  let provider = typeof body.provider === "string" ? body.provider : fallback.provider;
  let model = typeof body.model === "string" ? body.model : fallback.model;
  if (!getModel(provider, model)) {
    // allow any model present in the live catalog (e.g. OpenRouter models)
    const cat = await findCatalogModel(provider, model).catch(() => null);
    if (!cat) {
      provider = fallback.provider;
      model = fallback.model;
    }
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "New session";
  const agentMode = body.agentMode === "plan" ? "plan" : "build";
  const thinking = ["off", "think", "ultrathink"].includes(body.thinking) ? body.thinking : "off";

  // Optional external workspace directory (Ecode CLI: `ecode ~/myproject`)
  let workspace = "__pending__";
  if (typeof body.dir === "string" && body.dir.trim()) {
    const guard = resolveExternalWorkspace(body.dir.trim());
    if (!guard.ok) {
      return NextResponse.json({ error: guard.reason }, { status: 400 });
    }
    workspace = guard.abs;
  } else {
    ensureWorkspaceRoot();
  }

  const session = await db.session.create({
    data: {
      title,
      provider,
      model,
      mode: "manual",
      agentMode,
      thinking,
      workspace,
    },
  });
  if (workspace === "__pending__") {
    workspace = createWorkspace(session.id);
    await db.session.update({ where: { id: session.id }, data: { workspace } });
  }
  await audit({
    sessionId: session.id,
    event: "session_start",
    userAction: "create",
    status: "success",
    provider,
    model,
    detail: { workspace },
  });
  return NextResponse.json({ session: { ...session, workspace: undefined } });
}
