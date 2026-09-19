import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listTree, workspaceExists } from "@/lib/ecode/workspace";
import { resolveInWorkspace } from "@/lib/ecode/sandbox";
import * as fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!workspaceExists(session.workspace)) {
    return NextResponse.json({ tree: [], file: null });
  }

  const filePath = req.nextUrl.searchParams.get("path");
  if (filePath) {
    const guard = resolveInWorkspace(session.workspace, filePath);
    if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 403 });
    try {
      const content = fs.readFileSync(guard.abs!, "utf-8");
      return NextResponse.json({ file: { path: filePath, content } });
    } catch {
      return NextResponse.json({ error: "cannot read file" }, { status: 400 });
    }
  }

  return NextResponse.json({ tree: listTree(session.workspace, 4) });
}
