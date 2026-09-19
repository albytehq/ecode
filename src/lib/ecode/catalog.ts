// Ecode live model catalog — OpenRouter (450+ models incl. stealth previews).
// Sources (both fetched live, cached 1 hour, disk-snapshot fallback):
//   1. Public API  /api/v1/models          — every ACTIVE model, with live pricing
//   2. Frontend API /api/frontend/v1/models/find?fmt=cards — full 1000+ model list,
//      used to pick up stealth models (stealth/ox-alpha, stealth/union-alpha, …)
//      that the public API deliberately hides. Stealth models appear the moment
//      OpenRouter lists them — realtime, no hardcoding.
// Bring-your-own-key: every model here requires a provider key from Settings.

import * as fs from "fs";
import * as path from "path";

export interface CatalogModel {
  id: string; // e.g. "openai/gpt-5"
  label: string;
  provider: string; // catalog provider id ("openrouter")
  brand: string; // brand slug for icons: "openai" | "anthropic" | "google" | ...
  contextLimit: number;
  inputPrice: number; // USD per 1M prompt tokens
  outputPrice: number; // USD per 1M completion tokens
  free: boolean;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  stealth?: boolean; // OpenRouter stealth preview model (anonymous lab)
  knowledgeCutoff?: string | null; // ISO date when the provider publishes one
  description?: string;
}

export interface CatalogProvider {
  id: string;
  label: string;
  builtin: boolean;
  description: string;
  brand: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
// Frontend card API — lists stealth + upcoming models the public API hides.
const OPENROUTER_CARDS_URL = "https://openrouter.ai/api/frontend/v1/models/find?fmt=cards";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const SNAPSHOT_PATH = path.join(process.cwd(), ".ecode-catalog-snapshot.json");

let cache: { at: number; models: CatalogModel[] } | null = null;
let inflight: Promise<CatalogModel[]> | null = null;

/** Map an OpenRouter provider slug onto a @lobehub/icons brand name. */
function brandFor(slug: string): string {
  const normalized = slug.replace(/^~/, "");
  const map: Record<string, string> = {
    "openai": "openai",
    "anthropic": "anthropic",
    "anthracite-org": "anthropic",
    "google": "google",
    "gemini": "google",
    "meta": "meta",
    "meta-llama": "meta",
    "mistralai": "mistral",
    "deepseek": "deepseek",
    "qwen": "qwen",
    "x-ai": "xai",
    "amazon": "amazon",
    "microsoft": "microsoft",
    "nvidia": "nvidia",
    "cohere": "cohere",
    "perplexity": "perplexity",
    "moonshotai": "moonshot",
    "minimax": "minimax",
    "baidu": "baidu",
    "bytedance": "bytedance",
    "bytedance-seed": "bytedance",
    "tencent": "tencent",
    "xiaomi": "xiaomi",
    "stepfun": "stepfun",
    "z-ai": "zai",
    "thinkingmachines": "tinkerforge0",
    "inception": "inceptionlabs",
    "liquid": "liquid",
    "writer": "writer",
    "upstage": "upstage",
    "nousresearch": "nousresearch",
    "ibm-granite": "ibm",
    "aion-labs": "aion",
    "arcee-ai": "arceeai",
    "sao10k": "sao10k",
    "thedrummer": "thedrummer",
    "gryphe": "gryphe",
    "undecided": "undecided",
    "undi95": "undi95",
    "susan": "susan",
    "prism-ml": "prismml",
    "stealth": "stealth",
    "unbiased": "unbiased",
  };
  if (map[normalized]) return map[normalized];
  // Fallbacks by keyword inside the slug / model name
  if (normalized.includes("openai")) return "openai";
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "anthropic";
  if (normalized.includes("google") || normalized.includes("gemini")) return "google";
  if (normalized.includes("llama") || normalized.includes("meta")) return "meta";
  if (normalized.includes("mistral") || normalized.includes("codestral")) return "mistral";
  if (normalized.includes("deepseek")) return "deepseek";
  if (normalized.includes("qwen") || normalized.includes("qwq")) return "qwen";
  if (normalized.includes("kimi")) return "moonshot";
  if (normalized.includes("glm") || normalized.includes("zai")) return "zai";
  if (normalized.includes("grok")) return "xai";
  if (normalized.includes("nemotron")) return "nvidia";
  return "openrouter";
}

/** Provider display labels for grouping. */
const PROVIDER_LABELS: Record<string, string> = {
  "openai": "OpenAI",
  "anthropic": "Anthropic",
  "google": "Google",
  "meta": "Meta Llama",
  "mistralai": "Mistral AI",
  "deepseek": "DeepSeek",
  "qwen": "Qwen",
  "x-ai": "xAI",
  "amazon": "Amazon",
  "microsoft": "Microsoft",
  "nvidia": "NVIDIA",
  "cohere": "Cohere",
  "perplexity": "Perplexity",
  "moonshotai": "Moonshot AI",
  "minimax": "MiniMax",
  "baidu": "Baidu",
  "bytedance": "ByteDance",
  "bytedance-seed": "ByteDance Seed",
  "tencent": "Tencent",
  "xiaomi": "Xiaomi",
  "stepfun": "StepFun",
  "z-ai": "Z.ai",
  "thinkingmachines": "Thinking Machines",
  "inception": "Inception Labs",
  "liquid": "Liquid AI",
  "writer": "Writer",
  "upstage": "Upstage",
  "nousresearch": "Nous Research",
  "ibm-granite": "IBM",
  "aion-labs": "AionLabs",
  "arcee-ai": "Arcee AI",
  "sao10k": "Sao10K",
  "thedrummer": "TheDrummer",
  "gryphe": "Gryphe",
  "undi95": "Undi95",
  "mancer": "Mancer",
  "morph": "Morph",
  "sakana": "Sakana AI",
  "rekaai": "Reka AI",
  "meituan": "Meituan",
  "kwaipilot": "KwaiPilot",
  "inclusionai": "InclusionAI",
  "nex-agi": "Nex AGI",
  "dots-studio": "Dots Studio",
  "poolside": "Poolside",
  "relace": "Relace",
  "cognitivecomputations": "Cognitive Computations",
  "prism-ml": "PrismML",
  "inference-net": "Inference.net",
  "unbiased": "Unbiased AI",
  "stealth": "Stealth",
};

function labelForProvider(slug: string): string {
  return PROVIDER_LABELS[slug.replace(/^~/, "")] ?? slug.replace(/^~/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toCatalogModel(m: Record<string, unknown>): CatalogModel | null {
  const id = typeof m.id === "string" ? m.id : null;
  const name = typeof m.name === "string" ? m.name : id;
  if (!id || !name) return null;
  const slug = id.includes("/") ? id.split("/")[0] : "openrouter";
  const pricing = (m.pricing ?? {}) as Record<string, string>;
  const promptPrice = Number.parseFloat(pricing.prompt ?? "0") || 0;
  const completionPrice = Number.parseFloat(pricing.completion ?? "0") || 0;
  const supported = Array.isArray(m.supported_parameters) ? (m.supported_parameters as string[]) : [];
  const arch = (m.architecture ?? {}) as { input_modalities?: string[] };
  const free = promptPrice === 0 && completionPrice === 0;
  const desc = typeof m.description === "string" ? m.description : "";
  const cutoff = typeof m.knowledge_cutoff === "string" && m.knowledge_cutoff ? m.knowledge_cutoff : null;
  return {
    id,
    label: name.length > 60 ? name.slice(0, 57) + "…" : name,
    provider: "openrouter",
    brand: brandFor(slug),
    contextLimit: typeof m.context_length === "number" ? m.context_length : 32768,
    inputPrice: promptPrice * 1_000_000,
    outputPrice: completionPrice * 1_000_000,
    free,
    reasoning: supported.includes("reasoning") || supported.includes("include_reasoning") || /reasoning|thinking|r1|qwq|think/i.test(id + " " + name),
    vision: (arch.input_modalities ?? []).includes("image"),
    tools: supported.includes("tools"),
    knowledgeCutoff: cutoff,
    description: desc ? desc.slice(0, 220) : undefined,
  };
}

export const CATALOG_PROVIDERS: CatalogProvider[] = [
  { id: "openrouter", label: "OpenRouter", builtin: false, brand: "openrouter", description: "450+ models from every major lab, including live stealth previews. Requires an OpenRouter API key." },
];

async function fetchOpenRouterModels(): Promise<CatalogModel[]> {
  const res = await fetch(OPENROUTER_MODELS_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": BROWSER_UA, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`openrouter catalog ${res.status}`);
  const json = (await res.json()) as { data?: unknown[] };
  const models = (json.data ?? [])
    .map((m) => toCatalogModel(m as Record<string, unknown>))
    .filter((m): m is CatalogModel => m !== null);
  // Enrich with stealth models the public API hides (best effort — never fatal).
  const stealth = await fetchStealthModels().catch(() => [] as CatalogModel[]);
  const seen = new Set(models.map((m) => m.id));
  for (const s of stealth) if (!seen.has(s.id)) models.push(s);
  // Sort: tools-capable & popular first within each provider, providers alphabetically
  models.sort((a, b) => {
    if (a.stealth !== b.stealth) return a.stealth ? -1 : 1; // stealth pinned on top
    const sa = a.id.split("/")[0];
    const sb = b.id.split("/")[0];
    if (sa !== sb) return sa.localeCompare(sb);
    if (a.tools !== b.tools) return a.tools ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return models;
}

/**
 * Fetch the OpenRouter frontend "cards" API and return every stealth/* model.
 * This is what powers openrouter.ai's own stealth category — it includes models
 * the public /api/v1/models endpoint refuses to list (ox-alpha, union-alpha, …).
 * Stealth preview models are free ($0) while the preview lasts.
 */
async function fetchStealthModels(): Promise<CatalogModel[]> {
  const res = await fetch(OPENROUTER_CARDS_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": BROWSER_UA, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`openrouter cards ${res.status}`);
  const json = (await res.json()) as { data?: { models?: unknown[] } };
  const cards = json.data?.models ?? [];
  const out: CatalogModel[] = [];
  for (const raw of cards) {
    const m = raw as Record<string, unknown>;
    const slug = typeof m.slug === "string" ? m.slug : "";
    if (!slug.startsWith("stealth/")) continue;
    const name = typeof m.name === "string" ? m.name : slug;
    const modalities = Array.isArray(m.input_modalities) ? (m.input_modalities as string[]) : ["text"];
    const desc = typeof m.description === "string" ? m.description : "";
    const reasoningCfg = (m.reasoning_config ?? {}) as { is_mandatory_reasoning?: boolean };
    out.push({
      id: slug,
      label: name.length > 60 ? name.slice(0, 57) + "…" : name,
      provider: "openrouter",
      brand: "stealth",
      contextLimit: typeof m.context_length === "number" ? m.context_length : 32768,
      inputPrice: 0,
      outputPrice: 0,
      free: true,
      reasoning: m.supports_reasoning === true || reasoningCfg.is_mandatory_reasoning === true,
      vision: modalities.includes("image"),
      tools: true,
      stealth: true,
      description: desc ? desc.slice(0, 220) : undefined,
    });
  }
  return out;
}

function readSnapshot(): CatalogModel[] | null {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
    const json = JSON.parse(raw) as CatalogModel[];
    return Array.isArray(json) && json.length > 50 ? json : null;
  } catch {
    return null;
  }
}

function writeSnapshot(models: CatalogModel[]) {
  try {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(models), "utf-8");
  } catch {
    /* best effort */
  }
}

/** Get the full catalog (live OpenRouter incl. stealth). Cached for 1 hour. */
export async function getCatalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.models;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const models = await fetchOpenRouterModels();
      cache = { at: Date.now(), models };
      writeSnapshot(models);
      return models;
    } catch {
      const snapshot = readSnapshot();
      if (snapshot) {
        cache = { at: Date.now() - CACHE_TTL_MS + 5 * 60 * 1000, models: snapshot }; // retry in 5 min
        return snapshot;
      }
      return []; // degraded mode: empty — the user adds keys and models in Settings
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Look up one model across the catalog + static provider lists. */
export async function findCatalogModel(provider: string, modelId: string): Promise<CatalogModel | null> {
  const catalog = await getCatalog();
  return catalog.find((m) => m.id === modelId && (provider === "openrouter" ? m.provider === "openrouter" : true)) ?? null;
}
