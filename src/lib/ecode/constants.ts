// Ecode constants: providers, models, pricing, security rules.
// Bring-your-own-keys: there is NO built-in provider — every provider needs a key
// configured in Settings → Providers (OpenRouter is the recommended one).

// Workspace root — overridable for the Ecode CLI distribution (defaults to this app instance)
export const WORKSPACES_ROOT = process.env.ECODE_WORKSPACES_ROOT ?? "/home/z/my-project/workspaces";

export const ECODE_VERSION = "0.1.12";

export interface ModelInfo {
  id: string;
  label: string;
  contextLimit: number;
  inputPrice: number; // USD per 1M prompt tokens
  outputPrice: number; // USD per 1M completion tokens
}

export interface ProviderInfo {
  id: string;
  label: string;
  description: string;
  /** Optional base URL override (OpenAI-compatible endpoints: Ollama, LM Studio, Groq…) */
  defaultBaseUrl?: string;
  /** Custom providers require an explicit base URL */
  needsBaseUrl?: boolean;
  models: ModelInfo[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "450+ models from every major lab, including live stealth previews. Recommended.",
    defaultBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
    models: [
      { id: "openrouter/auto", label: "Auto Router", contextLimit: 131072, inputPrice: 0, outputPrice: 0 },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct OpenAI API.",
    defaultBaseUrl: "https://api.openai.com/v1/chat/completions",
    models: [
      { id: "gpt-4o", label: "GPT-4o", contextLimit: 128000, inputPrice: 2.5, outputPrice: 10 },
      { id: "gpt-4o-mini", label: "GPT-4o mini", contextLimit: 128000, inputPrice: 0.15, outputPrice: 0.6 },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Direct Anthropic Messages API.",
    defaultBaseUrl: "https://api.anthropic.com/v1/messages",
    models: [
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", contextLimit: 200000, inputPrice: 3, outputPrice: 15 },
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", contextLimit: 200000, inputPrice: 0.8, outputPrice: 4 },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini via the OpenAI-compatible endpoint.",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", contextLimit: 1048576, inputPrice: 0.1, outputPrice: 0.4 },
    ],
  },
  {
    id: "custom",
    label: "Custom endpoint",
    description: "Any OpenAI-compatible /chat/completions endpoint — Ollama, LM Studio, vLLM, Groq, Together…",
    needsBaseUrl: true,
    models: [],
  },
];

export const DEFAULT_PROVIDER = "openrouter";
export const DEFAULT_MODEL = "openrouter/auto";

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getModel(providerId: string, modelId: string): ModelInfo | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

export function estimateCost(
  providerId: string,
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const m = getModel(providerId, modelId);
  if (!m) return 0;
  return (promptTokens / 1_000_000) * m.inputPrice + (completionTokens / 1_000_000) * m.outputPrice;
}

// --- Security rules ---------------------------------------------------------

// Tools that require explicit approval when session mode is "manual"
export const APPROVAL_REQUIRED_TOOLS = new Set(["file_write", "file_delete", "shell"]);

// Shell patterns that are ALWAYS denied, regardless of mode (deny rules override YOLO)
export const SHELL_DENY_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\s|;|&&|\|\|)\s*sudo\b/, reason: "sudo is not allowed" },
  { pattern: /(^|\s|;|&&|\|\|)\s*su\s/, reason: "switching user is not allowed" },
  { pattern: /rm\s+(-[a-zA-Z]*\s+)*\/(\s|$)/, reason: "refusing to delete root filesystem" },
  { pattern: /rm\s+-[a-zA-Z]*f[a-zA-Z]*\s+\/(etc|usr|var|bin|sbin|root|home)(\/|\s|$)/, reason: "refusing to delete system directories" },
  { pattern: /mkfs/, reason: "mkfs is not allowed" },
  { pattern: /dd\s+if=.*of=\/dev\//, reason: "raw device writes are not allowed" },
  { pattern: /:\(\)\s*\{.*\};\s*:/, reason: "fork bombs are not allowed" },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: "system power commands are not allowed" },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: "raw device writes are not allowed" },
  { pattern: /(curl|wget)[^|]*\|\s*(sudo\s+)?(ba)?sh/, reason: "piping downloads to a shell is not allowed" },
  { pattern: /chmod\s+(-R\s+)?777\s+\//, reason: "recursive 777 on system paths is not allowed" },
  { pattern: /(\/etc\/passwd|\/etc\/shadow)/, reason: "system credential files are off-limits" },
];

export const SHELL_TIMEOUT_MS = 20_000;
export const MAX_TOOL_OUTPUT = 8_000; // chars kept per tool result
export const MAX_AGENT_ITERATIONS = 12;

export const YOLO_WARNING =
  "YOLO mode auto-approves every file write, delete and shell command. Deny rules for system-destructive commands still apply. Only enable this in a disposable workspace.";
