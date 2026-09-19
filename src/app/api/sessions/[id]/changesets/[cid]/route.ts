import { NextRequest, NextResponse } from "next/server";
import { undoLastChangeset, redoLastChangeset } from "@/lib/ecode/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  void cid;
  if (body.action === "undo") {
    const result = await undoLastChangeset(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === "redo") {
    const result = await redoLastChangeset(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ ok: false, message: "action must be 'undo' or 'redo'" }, { status: 400 });
}
