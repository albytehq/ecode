import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PROVIDERS } from "@/lib/ecode/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(Math.min(12, key.length - 8)) + key.slice(-4);
}

export async function GET() {
  const configs = await db.providerConfig.findMany();
  return NextResponse.json({
    providers: PROVIDERS.map((p) => {
      const cfg = configs.find((c) => c.provider === p.id);
      return {
        provider: p.id,
        label: p.label,
        description: p.description,
        needsBaseUrl: Boolean(p.needsBaseUrl),
        defaultBaseUrl: p.defaultBaseUrl ?? null,
        baseUrl: cfg?.baseUrl ?? null,
        maskedKey: cfg?.apiKey ? maskKey(cfg.apiKey) : null,
        configuredAt: cfg?.updatedAt ?? null,
      };
    }),
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const provider = typeof body.provider === "string" ? body.provider : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const info = PROVIDERS.find((p) => p.id === provider);
  if (!info) {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }
  if (!apiKey && !baseUrl) {
    await db.providerConfig.deleteMany({ where: { provider } });
    return NextResponse.json({ ok: true, removed: true });
  }
  const data: { apiKey: string; baseUrl?: string | null } = { apiKey };
  if (info.needsBaseUrl) {
    if (!baseUrl && !info.defaultBaseUrl) {
      return NextResponse.json({ error: "this provider needs a base URL (e.g. http://localhost:11434/v1/chat/completions)" }, { status: 400 });
    }
    data.baseUrl = baseUrl || info.defaultBaseUrl;
  } else if (baseUrl) {
    data.baseUrl = baseUrl;
  }
  await db.providerConfig.upsert({
    where: { provider },
    create: { provider, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
