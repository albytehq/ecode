import { db } from "@/lib/db";

export interface AuditEntry {
  sessionId?: string | null;
  event: string;
  provider?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  status?: string;
  errorCode?: string | null;
  userAction?: string | null;
  detail?: Record<string, unknown> | null;
}

/** Append-only structured audit log — mirrors the Ecode telemetry spec. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        sessionId: entry.sessionId ?? null,
        event: entry.event,
        provider: entry.provider ?? null,
        model: entry.model ?? null,
        promptTokens: entry.promptTokens ?? null,
        completionTokens: entry.completionTokens ?? null,
        totalTokens: entry.totalTokens ?? null,
        latencyMs: entry.latencyMs ?? null,
        status: entry.status ?? "success",
        errorCode: entry.errorCode ?? null,
        userAction: entry.userAction ?? null,
        detail: entry.detail ? JSON.stringify(entry.detail) : null,
      },
    });
  } catch (e) {
    // audit must never break the agent loop
    console.error("[ecode:audit] failed:", e instanceof Error ? e.message : String(e));
  }
}
