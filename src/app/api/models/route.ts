import { NextRequest, NextResponse } from "next/server";
import { getCatalog, CATALOG_PROVIDERS } from "@/lib/ecode/catalog";
import { db } from "@/lib/db";
import { PROVIDERS } from "@/lib/ecode/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const configs = await db.providerConfig.findMany();
  const keyed = new Set(configs.filter((c) => c.apiKey).map((c) => c.provider));

  const catalog = await getCatalog();

  return NextResponse.json({
    version: "0.1.13",
    total: catalog.length,
    providers: [
      ...CATALOG_PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        builtin: p.builtin,
        brand: p.brand,
        configured: keyed.has(p.id),
      })),
      // legacy direct providers kept for existing sessions
      ...PROVIDERS.filter((p) => p.id !== "openrouter").map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        builtin: false,
        brand: p.id === "openai" ? "openai" : p.id === "anthropic" ? "anthropic" : p.id === "gemini" ? "google" : "openai",
        configured: keyed.has(p.id),
      })),
    ],
    models: catalog,
  });
}
