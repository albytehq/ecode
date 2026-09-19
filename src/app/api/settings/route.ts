import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, saveAppSettings, type AppSettings } from "@/lib/ecode/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAppSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<AppSettings>;
  const patch: Partial<AppSettings> = {};
  if (typeof body.defaultProvider === "string") patch.defaultProvider = body.defaultProvider;
  if (typeof body.defaultModel === "string") patch.defaultModel = body.defaultModel;
  if (body.defaultMode === "manual" || body.defaultMode === "auto" || body.defaultMode === "yolo") {
    patch.defaultMode = body.defaultMode;
  }
  if (body.defaultThinking === "off" || body.defaultThinking === "think" || body.defaultThinking === "ultrathink") {
    patch.defaultThinking = body.defaultThinking;
  }
  const settings = await saveAppSettings(patch);
  return NextResponse.json({ settings });
}
