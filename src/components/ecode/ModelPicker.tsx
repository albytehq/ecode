"use client";

// Ecode — the mega model picker: 450+ live models from OpenRouter,
// with fuzzy search, capability filters, provider brand icons (@lobehub/icons)
// and live pricing.

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ProviderIcon, providerBrandFor } from "./ProviderIcon";
import {
  Search, Zap, Eye, Brain, Wrench, Check, Globe, Star, Keyboard, X, VenetianMask,
} from "lucide-react";

export interface CatalogModelUi {
  id: string;
  label: string;
  provider: string;
  brand: string;
  contextLimit: number;
  inputPrice: number;
  outputPrice: number;
  free: boolean;
  reasoning: boolean;
  vision: boolean;
  tools: boolean;
  stealth?: boolean;
  description?: string;
}

type Filter = "all" | "free" | "reasoning" | "vision" | "tools" | "stealth";

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function fmtPrice(m: CatalogModelUi): string {
  if (m.free) return "FREE";
  const inP = m.inputPrice >= 1 ? m.inputPrice.toFixed(m.inputPrice >= 10 ? 0 : 1) : m.inputPrice.toFixed(2);
  const outP = m.outputPrice >= 1 ? m.outputPrice.toFixed(m.outputPrice >= 10 ? 0 : 1) : m.outputPrice.toFixed(2);
  return `$${inP}/$${outP}`;
}

export function ModelPicker({
  open,
  onOpenChange,
  models,
  currentProvider,
  currentModel,
  openrouterKeyed,
  onSelect,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  models: CatalogModelUi[];
  currentProvider: string;
  currentModel: string;
  openrouterKeyed: boolean;
  onSelect: (provider: string, model: string) => void;
  onOpenSettings: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(120);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // reset the picker each time it opens (event-scheduled: no setState
    // directly inside the effect body)
    const t = setTimeout(() => {
      setQuery("");
      setFilter("all");
      setLimit(120);
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    return models.filter((m) => {
      if (filter === "free" && !m.free) return false;
      if (filter === "reasoning" && !m.reasoning) return false;
      if (filter === "vision" && !m.vision) return false;
      if (filter === "tools" && !m.tools) return false;
      if (filter === "stealth" && !m.stealth) return false;
      if (!terms.length) return true;
      const hay = `${m.id} ${m.label} ${m.stealth ? "stealth" : ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [models, query, filter]);

  const shown = filtered.slice(0, limit);

  // group by provider keeping catalog order
  const groups = useMemo(() => {
    const map = new Map<string, CatalogModelUi[]>();
    for (const m of shown) {
      const key = m.provider === "openrouter" ? (m.id.includes("/") ? m.id.split("/")[0] : "other") : m.provider;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()];
  }, [shown]);

  const filters: { id: Filter; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
    { id: "all", label: "All", icon: Globe },
    { id: "free", label: "Free", icon: Zap },
    { id: "reasoning", label: "Reasoning", icon: Brain },
    { id: "vision", label: "Vision", icon: Eye },
    { id: "tools", label: "Tools", icon: Wrench },
    { id: "stealth", label: "Stealth", icon: VenetianMask },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border-border/60 bg-stone-950/95 backdrop-blur-xl [&>button]:top-3 [&>button]:right-3 [&>button]:z-20">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Search size={15} className="text-[var(--hi)]" />
            Select a model
            <span className="text-[10px] font-normal text-stone-500">
              {filtered.length} of {models.length} models · live catalog from OpenRouter
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2.5 space-y-2.5 border-b border-border/40">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(120);
                if (listRef.current) listRef.current.scrollTop = 0;
              }}
              placeholder="Search 450+ models… try “claude”, “free gemini”, “deepseek”"
              className="pl-9 pr-8 h-9 text-sm bg-stone-900/80 border-border/50 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/50"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFilter(f.id);
                  setLimit(120);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                  filter === f.id
                    ? "bg-[color-mix(in_oklab,var(--hi)_15%,transparent)] border-[color-mix(in_oklab,var(--hi)_40%,transparent)] text-[var(--hi)]"
                    : "bg-stone-900/60 border-border/40 text-stone-400 hover:text-stone-200 hover:border-border"
                }`}
              >
                <f.icon size={11} />
                {f.label}
              </button>
            ))}
            {!openrouterKeyed && (
              <button
                onClick={() => {
                  onOpenChange(false);
                  onOpenSettings();
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              >
                <Keyboard size={11} />
                Add OpenRouter API key to unlock all
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[52vh]" >
          <div ref={listRef} className="py-1">
            {groups.length === 0 && (
              <div className="py-12 text-center text-sm text-stone-500">
                No models match “{query}”
              </div>
            )}
            {groups.map(([provider, list]) => {
              const brand = providerBrandFor("openrouter", `${provider}/x`);
              return (
                <div key={provider}>
                  <div className="sticky top-0 z-10 px-4 py-1.5 bg-stone-950/95 backdrop-blur border-b border-border/30 text-[10px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                    <ProviderIcon provider="openrouter" model={`${provider}/x`} size={12} />
                    {provider === "stealth" ? "Stealth models — anonymous labs, live previews" : provider.replace(/^~/, "")}
                    <span className="text-stone-600 font-normal normal-case">{list.length}</span>
                  </div>
                  {list.map((m) => {
                    const active = m.provider === currentProvider && m.id === currentModel;
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          onSelect(m.provider, m.id);
                          onOpenChange(false);
                        }}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-stone-900/80 transition-colors group ${
                          active ? "bg-[color-mix(in_oklab,var(--hi)_10%,transparent)]" : ""
                        }`}
                      >
                        <ProviderIcon provider={m.provider} model={m.id} size={18} className="shrink-0 opacity-90" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-medium truncate ${active ? "text-[var(--hi)]" : "text-stone-200"}`}>
                              {m.label}
                            </span>
                            {m.stealth && (
                              <Badge className="h-4 px-1.5 text-[9px] font-bold bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30 hover:bg-fuchsia-500/15 gap-1">
                                <VenetianMask size={9} /> STEALTH
                              </Badge>
                            )}
                            {m.free && !m.stealth && (
                              <Badge className="h-4 px-1.5 text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15">
                                FREE
                              </Badge>
                            )}
                            {m.reasoning && (
                              <span title="Reasoning capable" className="text-violet-400/80">
                                <Brain size={11} />
                              </span>
                            )}
                            {m.vision && (
                              <span title="Vision capable" className="text-sky-400/80">
                                <Eye size={11} />
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-500 truncate font-mono">{m.id}</div>
                        </div>
                        <div className="text-right shrink-0 hidden sm:block">
                          <div className={`text-[11px] font-mono ${m.free ? "text-emerald-400 font-bold" : "text-stone-400"}`}>
                            {m.stealth ? "STEALTH" : fmtPrice(m)}
                          </div>
                          <div className="text-[10px] text-stone-600 font-mono">{fmtCtx(m.contextLimit)} ctx</div>
                        </div>
                        {active && <Check size={15} className="text-[var(--hi)] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {filtered.length > shown.length && (
              <div className="p-3 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLimit((l) => l + 200)}
                  className="h-7 text-xs border-border/50 bg-stone-900/60"
                >
                  Load {Math.min(200, filtered.length - shown.length)} more · {filtered.length - shown.length} remaining
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-4 py-2 border-t border-border/40 flex items-center justify-between text-[10px] text-stone-600">
          <span className="flex items-center gap-1"><Star size={10} className="text-amber-500/60" /> stealth previews are live and free while the preview lasts</span>
          <span>Prices per 1M tokens (in/out)</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
