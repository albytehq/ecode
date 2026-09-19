"use client";

// Ecode provider/model brand icons — powered by @lobehub/icons (225+ AI brand
// logos) with lucide-react fallbacks for unknown brands.
//
// Two levels:
//   ProviderIcon — the *brand* logo (OpenAI, Anthropic, Z.ai, …)
//   ModelIcon    — the *AI's own* icon for a specific model (Claude for
//                  claude-*, ChatGPT's OpenAI blossom for gpt-*, Gemini,
//                  Grok, Kimi, DeepSeek, Qwen, …). Used in the chat view so
//                  every assistant message shows the actual model's face.

import type { ComponentType, SVGProps } from "react";
import {
  Anthropic,
  Claude,
  Google,
  Meta,
  Mistral,
  DeepSeek,
  Qwen,
  XAI,
  OpenRouter,
  ZAI,
  OpenAI,
  Moonshot,
  Aws,
  Microsoft,
  Nvidia,
  Cohere,
  Perplexity,
  Minimax,
  Baidu,
  ByteDance,
  Tencent,
  XiaomiMiMo,
  Stepfun,
  Kimi,
  Grok,
  Gemini,
  IBM,
  HuggingFace,
  Codex,
  Copilot,
  Doubao,
  Hunyuan,
  ChatGLM,
  Ai21,
  Ai2,
  Cerebras,
  Alibaba,
} from "@lobehub/icons";
import { Sparkles, VenetianMask } from "lucide-react";

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

/** brand slug (from catalog) → lobehub icon component */
const BRAND_MAP: Record<string, IconComp> = {
  openai: OpenAI,
  anthropic: Anthropic,
  claude: Claude,
  google: Google,
  meta: Meta,
  mistral: Mistral,
  mistralai: Mistral,
  deepseek: DeepSeek,
  qwen: Qwen,
  xai: XAI,
  grok: Grok,
  openrouter: OpenRouter,
  zai: ZAI,
  chatglm: ChatGLM,
  moonshot: Moonshot,
  kimi: Kimi,
  gemini: Gemini,
  amazon: Aws,
  microsoft: Microsoft,
  nvidia: Nvidia,
  cohere: Cohere,
  perplexity: Perplexity,
  minimax: Minimax,
  baidu: Baidu,
  bytedance: ByteDance,
  doubao: Doubao,
  hunyuan: Hunyuan,
  tencent: Tencent,
  xiaomi: XiaomiMiMo,
  stepfun: Stepfun,
  ibm: IBM,
  huggingface: HuggingFace,
  codex: Codex,
  copilot: Copilot,
  ai21: Ai21,
  ai2: Ai2,
  cerebras: Cerebras,
  alibaba: Alibaba,
  stealth: VenetianMask, // anonymous stealth models get a mask
};

/** Model id/name patterns → the model's OWN icon (not just the lab's). */
const MODEL_ICON_RULES: [RegExp, string][] = [
  [/claude/i, "claude"],
  [/\bgpt|o[134](-|$)|openai\/codex|codex-/i, "openai"],
  [/gemini|bishop/i, "gemini"],
  [/grok/i, "grok"],
  [/kimi|moonshot/i, "kimi"],
  [/deepseek/i, "deepseek"],
  [/qwq|qwen/i, "qwen"],
  [/llama/i, "meta"],
  [/\bglm|z-ai\/glm|chatglm/i, "zai"],
  [/doubao/i, "doubao"],
  [/hunyuan/i, "hunyuan"],
  [/codestral|mistral|magistral|devstral/i, "mistral"],
  [/command-(r|a)/i, "cohere"],
  [/sonar/i, "perplexity"],
  [/copilot/i, "copilot"],
  [/nemotron/i, "nvidia"],
  [/granite/i, "ibm"],
  [/glm/i, "zai"],
];

/** Resolve the icon for a specific model — model-face first, brand second. */
export function modelIconBrand(provider: string, modelId: string): string {
  const hay = `${modelId}`;
  if (provider === "zai" || /glm/i.test(hay)) return /chatglm/i.test(hay) ? "chatglm" : "zai";
  if (provider === "gemini" || /gemini/i.test(hay)) return "gemini";
  if (provider === "openai" || /gpt|codex/i.test(hay)) return /codex/i.test(hay) ? "codex" : "openai";
  for (const [re, brand] of MODEL_ICON_RULES) {
    if (re.test(hay)) return brand;
  }
  return providerBrandFor(provider, modelId);
}

export function providerBrandFor(provider: string, modelId: string): string {
  if (provider === "zai") return "zai";
  if (provider === "gemini") return "google";
  if (provider === "openrouter") {
    const slug = modelId.includes("/") ? modelId.split("/")[0].replace(/^~/, "") : "";
    if (slug === "stealth") return "stealth";
    const direct: Record<string, string> = {
      openai: "openai",
      anthropic: "anthropic",
      "~anthropic": "anthropic",
      google: "google",
      "~google": "google",
      "meta-llama": "meta",
      meta: "meta",
      mistralai: "mistral",
      deepseek: "deepseek",
      "~deepseek": "deepseek",
      qwen: "qwen",
      "x-ai": "xai",
      "~x-ai": "xai",
      moonshotai: "moonshot",
      "~moonshotai": "moonshot",
      "z-ai": "zai",
      "~z-ai": "zai",
      perplexity: "perplexity",
      microsoft: "microsoft",
      nvidia: "nvidia",
      cohere: "cohere",
      minimax: "minimax",
      "thinkingmachines": "openai",
      "bytedance": "bytedance",
      "bytedance-seed": "bytedance",
      tencent: "tencent",
      xiaomi: "xiaomi",
      stepfun: "stepfun",
      amazon: "amazon",
      baidu: "baidu",
      "ibm-granite": "ibm",
      "nousresearch": "huggingface",
      "unbiased": "openrouter",
      "ai21": "ai21",
      "ai2": "ai2",
      "alibaba": "alibaba",
    };
    if (direct[slug]) return direct[slug];
    if (slug.includes("claude")) return "anthropic";
    if (slug.includes("gpt") || slug.includes("openai")) return "openai";
    if (slug.includes("gemini")) return "google";
    if (slug.includes("llama")) return "meta";
    if (slug.includes("mistral")) return "mistral";
    if (slug.includes("deepseek")) return "deepseek";
    if (slug.includes("qwen") || slug.includes("qwq")) return "qwen";
    if (slug.includes("glm")) return "zai";
    if (slug.includes("kimi")) return "moonshot";
    if (slug.includes("grok")) return "xai";
    if (slug.includes("nemotron")) return "nvidia";
    return "openrouter";
  }
  if (provider === "openai") return "openai";
  return "openai";
}

export function ProviderIcon({
  provider,
  model,
  size = 16,
  className,
}: {
  provider: string;
  model: string;
  size?: number;
  className?: string;
}) {
  const brand = providerBrandFor(provider, model);
  const Comp = BRAND_MAP[brand] ?? Sparkles;
  return <Comp size={size} className={className} aria-hidden />;
}

/**
 * The AI's own face for a given model — used as the assistant avatar in chat.
 * Model-specific first (Claude, Kimi, Grok, …), lab brand as fallback.
 */
export function ModelIcon({
  provider,
  model,
  size = 16,
  className,
}: {
  provider: string;
  model: string;
  size?: number;
  className?: string;
}) {
  const brand = modelIconBrand(provider, model);
  const Comp = BRAND_MAP[brand] ?? Sparkles;
  return <Comp size={size} className={className} aria-hidden />;
}

/** Pretty display label for a model id, e.g. "anthropic/claude-4.5-sonnet" → "Claude 4.5 Sonnet". */
export function modelLabelFor(modelId: string): string {
  const bare = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;
  const pretty = bare
    .replace(/[-_]/g, " ")
    .replace(/\b(gpt)\b/gi, "GPT")
    .replace(/\bglm\b/gi, "GLM")
    .replace(/\bqwq\b/gi, "QwQ")
    .replace(/\bttt\b/gi, "TTT")
    .replace(/\bAi\b/g, "AI")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());
  return pretty || modelId;
}
