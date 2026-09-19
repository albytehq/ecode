"use client";

/**
 * Client-side SSE-over-POST helper for the Ecode agent loop.
 * - accepts an AbortSignal (session switch, unmount, delete)
 * - inactivity watchdog: fetch streams never auto-reconnect, so a silent hang
 *   is surfaced as an error instead of an infinite "generating" state
 */

const WATCHDOG_MS = 90_000; // no events for 90s → treat as dead stream

export async function streamSse(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(new Error("stream stalled — no events for 90s")), WATCHDOG_MS);
  };
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onOuterAbort);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let message = `request failed (${res.status})`;
      try {
        const json = JSON.parse(text);
        if (json?.error) message = json.error;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    kick();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      kick();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()));
        } catch {
          /* malformed event — skip */
        }
      }
    }
  } finally {
    if (watchdog) clearTimeout(watchdog);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
