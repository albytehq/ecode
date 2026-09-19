// Server-side app settings (General tab) — stored as JSON rows in AppSetting.
// Keys are per-user local preferences the server needs at session-create time.

import { db } from "@/lib/db";
import { findCatalogModel } from "./catalog";
import { getProvider } from "./constants";

export interface AppSettings {
  defaultProvider: string;
  defaultModel: string;
  defaultMode: "manual" | "auto" | "yolo";
  defaultThinking: "off" | "think" | "ultrathink";
}

export const FALLBACK_SETTINGS: AppSettings = {
  defaultProvider: "openrouter",
  defaultModel: "openrouter/auto",
  defaultMode: "manual",
  defaultThinking: "off",
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const rows = await db.appSetting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out: AppSettings = { ...FALLBACK_SETTINGS };
    const p = parseJson(map.get("defaultProvider"));
    const m = parseJson(map.get("defaultModel"));
    if (typeof p === "string" && p) out.defaultProvider = p;
    if (typeof m === "string" && m) out.defaultModel = m;
    const mode = parseJson(map.get("defaultMode"));
    if (mode === "manual" || mode === "auto" || mode === "yolo") out.defaultMode = mode;
    const th = parseJson(map.get("defaultThinking"));
    if (th === "off" || th === "think" || th === "ultrathink") out.defaultThinking = th;
    return out;
  } catch {
    return { ...FALLBACK_SETTINGS };
  }
}

export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = {
    defaultProvider: typeof patch.defaultProvider === "string" ? patch.defaultProvider : current.defaultProvider,
    defaultModel: typeof patch.defaultModel === "string" ? patch.defaultModel : current.defaultModel,
    defaultMode:
      patch.defaultMode === "manual" || patch.defaultMode === "auto" || patch.defaultMode === "yolo"
        ? patch.defaultMode
        : current.defaultMode,
    defaultThinking:
      patch.defaultThinking === "off" || patch.defaultThinking === "think" || patch.defaultThinking === "ultrathink"
        ? patch.defaultThinking
        : current.defaultThinking,
  };
  for (const [key, value] of Object.entries(next)) {
    await db.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
  return next;
}

/**
 * Resolve the default model at session-create time: settings value if it still
 * exists (provider known + model in the live catalog), otherwise the safe fallback.
 */
export async function resolveDefaultModel(): Promise<{ provider: string; model: string }> {
  const s = await getAppSettings();
  if (getProvider(s.defaultProvider)) {
    const cat = await findCatalogModel(s.defaultProvider, s.defaultModel).catch(() => null);
    if (cat) return { provider: s.defaultProvider, model: s.defaultModel };
  }
  return { provider: FALLBACK_SETTINGS.defaultProvider, model: FALLBACK_SETTINGS.defaultModel };
}

function parseJson(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
