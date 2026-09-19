// Ecode LLM layer — bring-your-own-key providers only.
// OpenRouter / OpenAI / Anthropic / Gemini / any OpenAI-compatible custom endpoint.

import { db } from "@/lib/db";
import { getProvider } from "./constants";
import type { LlmTurnResult, LlmUsage, ThinkingLevel } from "./types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export class LlmError extends Error {
  constructor(message: string, public code = "llm_error") {
    super(message);
  }
}

const MAX_RETRIES = 3;

/**
 * Streaming reasoning extractor: routes `delta.reasoning_content` /
 * `delta.reasoning` / `<think>...</think>` content to a separate
 * thinking channel while normal answer tokens go to the content channel.
 */
class ThinkingSplitter {
  private raw = "";
  private thinkMode: boolean | null = null; // null = not yet determined
  private thinkStart = -1;
  private thinkEnd = -1;
  private emittedThink = 0;
  private emittedText = 0;

  push(
    delta: string,
    onToken: (t: string) => void,
    onThinking: (t: string) => void,
    onThinkStart: () => void
  ): void {
    this.raw += delta;
    const startsWithThink = this.raw.trimStart().startsWith("<think");
    if (this.thinkMode === null) this.thinkMode = startsWithThink;
    if (this.thinkMode) {
      if (this.thinkStart === -1) {
        const gt = this.raw.indexOf(">");
        if (gt !== -1) this.thinkStart = gt + 1;
      }
      if (this.thinkEnd === -1) {
        const close = this.raw.indexOf("</think>");
        if (close !== -1) this.thinkEnd = close;
      }
      if (this.thinkStart !== -1) {
        const thinkBody = this.thinkEnd !== -1 ? this.raw.slice(this.thinkStart, this.thinkEnd) : this.raw.slice(this.thinkStart);
        if (thinkBody.length > this.emittedThink) {
          if (this.emittedThink === 0) onThinkStart();
          onThinking(thinkBody.slice(this.emittedThink));
          this.emittedThink = thinkBody.length;
        }
        if (this.thinkEnd !== -1) {
          const text = this.raw.slice(this.thinkEnd + "</think>".length).replace(/^\s+/, "");
          if (text.length > this.emittedText) {
            onToken(text.slice(this.emittedText));
            this.emittedText = text.length;
          }
        }
      }
    } else {
      onToken(delta);
    }
  }

  get content(): string {
    if (this.thinkMode && this.thinkStart !== -1) {
      if (this.thinkEnd !== -1) return this.raw.slice(this.thinkEnd + "</think>".length).trimStart();
      return ""; // still thinking — no final answer yet
    }
    return this.raw;
  }

  get reasoning(): string {
    if (this.thinkMode && this.thinkStart !== -1) {
      return this.thinkEnd !== -1 ? this.raw.slice(this.thinkStart, this.thinkEnd) : this.raw.slice(this.thinkStart);
    }
    return "";
  }
}

interface StreamCallbacks {
  onToken?: (t: string) => void;
  onThinking?: (t: string) => void;
  onThinkingStart?: () => void;
  onThinkingEnd?: () => void;
}

/** Provider registry resolved at call time (API keys may be configured at runtime). */
async function getProviderConfig(providerId: string): Promise<{ apiKey: string; baseUrl: string | null } | null> {
  try {
    const cfg = await db.providerConfig.findUnique({ where: { provider: providerId } });
    return cfg ? { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl } : null;
  } catch {
    return null;
  }
}

/** Call any OpenAI-compatible streaming chat endpoint (openai / openrouter / gemini / custom). */
async function callOpenAICompatible(opts: {
  url: string;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  thinking?: ThinkingLevel;
  signal?: AbortSignal;
  isOpenRouter?: boolean;
} & StreamCallbacks): Promise<{ content: string; reasoning: string; usage: LlmUsage | null }> {
  const thinking = opts.thinking && opts.thinking !== "off";
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (opts.isOpenRouter && thinking) {
    body.include_reasoning = true;
    body.reasoning = { effort: opts.thinking === "ultrathink" ? "high" : "medium" };
  }
  const res = await fetch(opts.url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new LlmError(`provider responded ${res.status}: ${text.slice(0, 200)}`, `http_${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let splitter = new ThinkingSplitter();
  let reasoning = "";
  let usage: LlmUsage | null = null;
  let thinkingLive = false;
  const stopThinking = () => {
    if (thinkingLive) {
      thinkingLive = false;
      opts.onThinkingEnd?.();
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta;
        const thinkDelta: string = delta?.reasoning_content ?? delta?.reasoning ?? "";
        if (typeof thinkDelta === "string" && thinkDelta) {
          if (!thinkingLive) {
            thinkingLive = true;
            opts.onThinkingStart?.();
          }
          reasoning += thinkDelta;
          opts.onThinking?.(thinkDelta);
        }
        const textDelta = delta?.content;
        if (typeof textDelta === "string" && textDelta) {
          if (thinkingLive) stopThinking();
          splitter.push(textDelta, opts.onToken ?? (() => {}), opts.onThinking ?? (() => {}), () => {
            if (!thinkingLive) {
              thinkingLive = true;
              opts.onThinkingStart?.();
            }
          });
        }
        if (json?.usage) usage = json.usage;
      } catch {
        /* partial JSON — ignore */
      }
    }
  }
  stopThinking();
  return { content: splitter.content, reasoning: reasoning || splitter.reasoning, usage };
}

/** Call Anthropic messages API with streaming. */
async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  thinking?: ThinkingLevel;
  signal?: AbortSignal;
} & StreamCallbacks): Promise<{ content: string; reasoning: string; usage: LlmUsage | null }> {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 16384,
    stream: true,
    messages: opts.messages,
  };
  if (opts.thinking === "ultrathink") {
    body.thinking = { type: "enabled", budget_tokens: 10000 };
  } else if (opts.thinking === "think") {
    body.thinking = { type: "enabled", budget_tokens: 4000 };
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new LlmError(`anthropic responded ${res.status}: ${text.slice(0, 200)}`, `http_${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let usage: LlmUsage | null = null;
  let thinkingLive = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        if (json?.type === "content_block_start" && json?.content_block?.type === "thinking") {
          thinkingLive = true;
          opts.onThinkingStart?.();
        }
        if (json?.type === "content_block_delta" && json?.delta?.thinking) {
          reasoning += json.delta.thinking;
          opts.onThinking?.(json.delta.thinking);
        }
        if (json?.type === "content_block_delta" && json?.delta?.text) {
          if (thinkingLive) {
            thinkingLive = false;
            opts.onThinkingEnd?.();
          }
          content += json.delta.text;
          opts.onToken?.(json.delta.text);
        }
        if (json?.type === "message_start" && json?.message?.usage) {
          usage = { prompt_tokens: json.message.usage.input_tokens };
        }
        if (json?.type === "message_delta" && json?.usage?.output_tokens && usage) {
          usage.completion_tokens = json.usage.output_tokens;
          usage.total_tokens = (usage.prompt_tokens ?? 0) + json.usage.output_tokens;
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (thinkingLive) opts.onThinkingEnd?.();
  return { content, reasoning, usage };
}

/**
 * Call the configured provider with retries (exponential backoff).
 * No silent fallback: a failed provider surfaces a clear error — the user
 * manages keys in Settings → Providers.
 */
export async function callLlm(opts: {
  provider: string;
  model: string;
  messages: LlmMessage[];
  thinking?: ThinkingLevel;
  signal?: AbortSignal;
  onToken?: (t: string) => void;
  onThinking?: (t: string) => void;
  onThinkingStart?: () => void;
  onThinkingEnd?: () => void;
  sessionId?: string;
  onAudit?: (e: {
    event: string;
    status: string;
    errorCode?: string;
    latencyMs: number;
    provider: string;
    model: string;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
  }) => void;
}): Promise<LlmTurnResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const started = Date.now();
    try {
      let result: { content: string; reasoning: string; usage: LlmUsage | null };
      const cb = {
        onToken: opts.onToken,
        onThinking: opts.onThinking,
        onThinkingStart: opts.onThinkingStart,
        onThinkingEnd: opts.onThinkingEnd,
      };

      const info = getProvider(opts.provider);
      const cfg = await getProviderConfig(opts.provider);

      if (opts.provider === "anthropic") {
        if (!cfg?.apiKey) throw noKeyError("anthropic");
        result = await callAnthropic({ apiKey: cfg.apiKey, model: opts.model, messages: opts.messages, thinking: opts.thinking, signal: opts.signal, ...cb });
      } else if (info || (cfg && cfg.baseUrl)) {
        // openrouter / openai / gemini / custom OpenAI-compatible endpoint
        const url = cfg?.baseUrl || info?.defaultBaseUrl;
        if (!url) {
          throw new LlmError(
            `no endpoint configured for provider "${opts.provider}" — set a base URL in Settings → Providers`,
            "no_base_url"
          );
        }
        if (!cfg?.apiKey && opts.provider !== "custom") throw noKeyError(opts.provider);
        result = await callOpenAICompatible({
          url,
          apiKey: cfg?.apiKey || "no-key",
          model: opts.model,
          messages: opts.messages,
          thinking: opts.thinking,
          signal: opts.signal,
          isOpenRouter: opts.provider === "openrouter",
          ...cb,
        });
      } else {
        throw new LlmError(
          `provider "${opts.provider}" is not available — pick a model from the model picker and add its key in Settings → Providers`,
          "provider_unavailable"
        );
      }

      if (!result.content.trim() && !result.reasoning.trim()) throw new LlmError("empty response from model", "empty_response");
      opts.onAudit?.({
        event: "model_request",
        status: "success",
        latencyMs: Date.now() - started,
        provider: opts.provider,
        model: opts.model,
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
        totalTokens: result.usage?.total_tokens ?? null,
      });
      return { content: result.content, reasoning: result.reasoning, usage: result.usage, provider: opts.provider, model: opts.model };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e; // client disconnect — don't retry
      lastError = e instanceof Error ? e : new Error(String(e));
      const code = lastError instanceof LlmError ? lastError.code : "llm_error";
      opts.onAudit?.({
        event: "model_request",
        status: "error",
        errorCode: lastError.message.slice(0, 120),
        latencyMs: Date.now() - started,
        provider: opts.provider,
        model: opts.model,
      });
      // Configuration errors must not burn retries with backoff delays
      if (code === "no_api_key" || code === "no_base_url" || code === "provider_unavailable") throw lastError;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError ?? new LlmError("LLM call failed");
}

function noKeyError(provider: string): LlmError {
  return new LlmError(
    `no API key configured for "${provider}" — add one in Settings → Providers`,
    "no_api_key"
  );
}
