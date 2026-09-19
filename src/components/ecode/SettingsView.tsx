"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck, Check, Eye, EyeOff, ExternalLink, Gauge, Hammer, KeyRound, Loader2, Palette, Plug,
  Settings2, Sliders, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEcode, useUi, type Accent, type Appearance } from "@/lib/ecode/store";
import { ProviderIcon } from "./ProviderIcon";
import { ModelPicker } from "./ModelPicker";
import { THINKING_LEVELS } from "@/lib/ecode/types";

type Tab = "general" | "providers" | "appearance";

interface AppSettingsDto {
  defaultProvider: string;
  defaultModel: string;
  defaultMode: "manual" | "auto" | "yolo";
  defaultThinking: "off" | "think" | "ultrathink";
}

const GET_KEY_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
};

const ACCENTS: { id: Accent; label: string; hex: string }[] = [
  { id: "amber", label: "amber", hex: "#f2a93b" },
  { id: "emerald", label: "emerald", hex: "#3ecf8e" },
  { id: "sky", label: "sky", hex: "#56b6f7" },
  { id: "violet", label: "violet", hex: "#b196f8" },
  { id: "rose", label: "rose", hex: "#f27b93" },
];

/**
 * Full-screen settings page with a left rail: General / Providers / Appearance.
 * Streams live in the module-scope zustand store, so opening settings never
 * interrupts a running agent.
 */
export function SettingsView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { providerRows, loadProviderRows, saveProviderKey, setToast, catalog, loadCatalog, providers } = useEcode();
  const appearance = useUi((s) => s.appearance);
  const setAppearance = useUi((s) => s.setAppearance);
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<AppSettingsDto | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, "busy" | "ok" | "fail">>({});
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  // load data when the page opens
  useEffect(() => {
    if (!open) return;
    void loadProviderRows();
    void loadCatalog(true);
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) setSettings((await res.json()).settings);
      } catch {
        /* keep defaults */
      }
    })();
  }, [open, loadProviderRows, loadCatalog]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const saveSettings = async (patch: Partial<AppSettingsDto>) => {
    const next = { ...(settings ?? ({} as AppSettingsDto)), ...patch };
    setSettings(next as AppSettingsDto);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      setToast("defaults saved");
    } catch {
      setToast("could not save settings");
    }
  };

  const runTest = async (provider: string) => {
    setTesting((t) => ({ ...t, [provider]: "busy" }));
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setTesting((t) => ({ ...t, [provider]: data.ok ? "ok" : "fail" }));
      setTestMsg((m) => ({ ...m, [provider]: data.message ?? "" }));
    } catch {
      setTesting((t) => ({ ...t, [provider]: "fail" }));
      setTestMsg((m) => ({ ...m, [provider]: "request failed" }));
    }
  };

  const defaultModelLabel = useMemo(() => {
    if (!settings) return "";
    return catalog?.models.find((m) => m.id === settings.defaultModel)?.label ?? settings.defaultModel;
  }, [settings, catalog]);

  if (!open) return null;

  const openrouterKeyed = providers.find((p) => p.id === "openrouter")?.configured ?? false;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-950">
      {/* top bar */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-stone-800/60 px-3">
        <Settings2 className="h-4 w-4 text-[var(--hi)]" />
        <span className="font-mono text-[13px] font-semibold tracking-tight text-stone-100">settings</span>
        <button
          onClick={onClose}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-900 hover:text-stone-200"
          title="Close settings (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left rail */}
        <nav className="flex w-40 shrink-0 flex-col gap-1 border-r border-stone-800/60 p-2.5">
          {([
            { id: "general" as Tab, label: "general", icon: Sliders },
            { id: "providers" as Tab, label: "providers", icon: Plug },
            { id: "appearance" as Tab, label: "appearance", icon: Palette },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors ${
                tab === t.id
                  ? "bg-[color-mix(in_oklab,var(--hi)_10%,transparent)] text-[var(--hi)]"
                  : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
          <div className="mt-auto px-2.5 py-1 font-mono text-[10px] leading-relaxed text-stone-600">
            ecode v0.1.13
            <br />
            {catalog?.total ?? "…"} models live
          </div>
        </nav>

        {/* content */}
        <div className="ec-scroll min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">

            {/* ═══ GENERAL ═══ */}
            {tab === "general" && (
              <>
                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <Hammer className="h-3.5 w-3.5" /> default model
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    New sessions start with this model. Pick anything from the live catalog — stealth previews included.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-stone-800 bg-stone-900/70 px-3">
                      <ProviderIcon provider={settings?.defaultProvider ?? "openrouter"} model={settings?.defaultModel ?? ""} size={16} />
                      <span className="truncate text-[13px] text-stone-200">{defaultModelLabel || "loading…"}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-stone-600">{settings?.defaultProvider}</span>
                    </div>
                    <Button
                      onClick={() => setPickerOpen(true)}
                      className="h-9 rounded-md bg-stone-700 text-stone-100 hover:bg-[var(--hi)] hover:text-[var(--hi-ink)]"
                    >
                      choose
                    </Button>
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <Gauge className="h-3.5 w-3.5" /> default permission
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    How Ecode treats file writes, deletes and shell commands in new sessions.
                  </p>
                  <div className="flex overflow-hidden rounded-md border border-stone-800">
                    {(["manual", "auto"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => saveSettings({ defaultMode: mode })}
                        className={`flex-1 px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
                          settings?.defaultMode === mode
                            ? "bg-[color-mix(in_oklab,var(--hi)_12%,transparent)] text-[var(--hi)]"
                            : "text-stone-400 hover:bg-stone-900"
                        }`}
                      >
                        {mode === "manual" ? "manual — approve each action" : "auto — skip approvals"}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <Zap className="h-3.5 w-3.5" /> default thinking
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    Reasoning effort for new sessions. Thinking stays visible in the chat — it is never hidden.
                  </p>
                  <div className="flex overflow-hidden rounded-md border border-stone-800">
                    {THINKING_LEVELS.map((lv) => (
                      <button
                        key={lv.id}
                        onClick={() => saveSettings({ defaultThinking: lv.id })}
                        className={`flex-1 px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
                          settings?.defaultThinking === lv.id
                            ? "bg-[color-mix(in_oklab,var(--hi)_12%,transparent)] text-[var(--hi)]"
                            : "text-stone-400 hover:bg-stone-900"
                        }`}
                      >
                        {lv.label.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-2 rounded-md border border-stone-800 bg-stone-900/40 p-4 font-mono text-[11px] leading-relaxed text-stone-500">
                  <div className="flex justify-between"><span>version</span><span className="text-stone-300">0.1.13</span></div>
                  <div className="flex justify-between"><span>catalog</span><span className="text-stone-300">{catalog?.total ?? "…"} models</span></div>
                  <div className="flex justify-between"><span>storage</span><span className="text-stone-300">local sqlite + localStorage</span></div>
                  <div className="flex justify-between"><span>keys</span><span className="text-stone-300">server-side, never sent to third parties</span></div>
                </section>
              </>
            )}

            {/* ═══ PROVIDERS ═══ */}
            {tab === "providers" && (
              <>
                <section className="space-y-1">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <KeyRound className="h-3.5 w-3.5" /> api keys
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    Ecode is bring-your-own-key: no built-in provider, no bundled tokens. Keys are stored in the local
                    database and used only for direct calls to the provider you configured.
                  </p>
                </section>

                {providerRows.map((r) => {
                  const st = testing[r.provider];
                  return (
                    <div key={r.provider} className="space-y-2.5 rounded-lg border border-stone-800 bg-stone-900/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <ProviderIcon provider={r.provider} model="" size={16} />
                        <span className="text-[14px] font-medium text-stone-100">{r.label}</span>
                        {r.maskedKey ? (
                          <Badge variant="outline" className="h-5 border-[color-mix(in_oklab,var(--hi)_40%,transparent)] px-1.5 text-[9px] text-[var(--hi)]">
                            <BadgeCheck className="mr-1 h-3 w-3" /> configured
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 border-stone-700 px-1.5 text-[9px] text-stone-500">no key</Badge>
                        )}
                        {r.maskedKey && <span className="font-mono text-[10px] text-stone-600">{r.maskedKey}</span>}
                        {GET_KEY_URLS[r.provider] && (
                          <a
                            href={GET_KEY_URLS[r.provider]}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto flex items-center gap-1 font-mono text-[10px] text-stone-500 transition-colors hover:text-[var(--hi)]"
                          >
                            get a key <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-[12px] leading-relaxed text-stone-500">{r.description}</p>

                      {r.needsBaseUrl && (
                        <input
                          placeholder="base URL — e.g. http://localhost:11434/v1/chat/completions"
                          className="w-full rounded-md border border-stone-800 bg-stone-950 px-3 py-1.5 font-mono text-[11.5px] text-stone-200 placeholder:text-stone-600 outline-none focus:border-[color-mix(in_oklab,var(--hi)_50%,transparent)]"
                          value={drafts[`${r.provider}__url`] ?? r.baseUrl ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [`${r.provider}__url`]: e.target.value }))}
                        />
                      )}

                      <div className="flex flex-wrap gap-2">
                        <div className="flex min-w-[220px] flex-1 items-center rounded-md border border-stone-800 bg-stone-950 px-2.5 focus-within:border-[color-mix(in_oklab,var(--hi)_50%,transparent)]">
                          <input
                            type={showKey[r.provider] ? "text" : "password"}
                            placeholder={r.maskedKey ? "replace key…" : "paste API key…"}
                            className="flex-1 bg-transparent py-1.5 font-mono text-[11.5px] text-stone-200 placeholder:text-stone-600 outline-none"
                            value={drafts[r.provider] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [r.provider]: e.target.value }))}
                          />
                          <button
                            onClick={() => setShowKey((s) => ({ ...s, [r.provider]: !s[r.provider] }))}
                            className="ml-2 text-stone-600 hover:text-stone-300"
                            tabIndex={-1}
                          >
                            {showKey[r.provider] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 rounded-md bg-stone-700 text-stone-100 hover:bg-[var(--hi)] hover:text-[var(--hi-ink)]"
                          onClick={() => {
                            const key = (drafts[r.provider] ?? "").trim();
                            const url = (drafts[`${r.provider}__url`] ?? "").trim();
                            if (!key && !url && !r.needsBaseUrl) {
                              setToast("paste a key first");
                              return;
                            }
                            void saveProviderKey(r.provider, key, url || undefined).then(() => {
                              setDrafts((d) => ({ ...d, [r.provider]: "" }));
                            });
                          }}
                        >
                          save
                        </Button>
                        {r.maskedKey && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-md border-stone-700 text-stone-400 hover:text-red-400"
                              onClick={() => void saveProviderKey(r.provider, "")}
                            >
                              remove
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-8 rounded-md ${
                                st === "ok"
                                  ? "border-emerald-600/50 text-emerald-400"
                                  : st === "fail"
                                    ? "border-red-500/50 text-red-400"
                                    : "border-stone-700 text-stone-400"
                              }`}
                              disabled={st === "busy"}
                              onClick={() => void runTest(r.provider)}
                            >
                              {st === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                              test
                            </Button>
                          </>
                        )}
                      </div>
                      {st && st !== "busy" && testMsg[r.provider] && (
                        <p className={`font-mono text-[10.5px] ${st === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                          {testMsg[r.provider]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* ═══ APPEARANCE ═══ */}
            {tab === "appearance" && (
              <>
                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <Palette className="h-3.5 w-3.5" /> accent
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    One accent, applied everywhere: buttons, links, the user bubble, focus rings, the modeline.
                  </p>
                  <div className="flex gap-2.5">
                    {ACCENTS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAppearance({ accent: a.id })}
                        className={`flex h-11 w-11 items-center justify-center rounded-md border-2 transition-transform hover:scale-105 ${
                          appearance.accent === a.id ? "border-stone-300" : "border-transparent"
                        }`}
                        style={{ background: `${a.hex}22` }}
                        title={a.label}
                      >
                        <span className="h-5 w-5 rounded" style={{ background: a.hex }} />
                        {appearance.accent === a.id && <Check className="absolute h-3 w-3 text-stone-200" />}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <Sliders className="h-3.5 w-3.5" /> density
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    Compact pulls turns, padding and the composer closer together.
                  </p>
                  <div className="flex overflow-hidden rounded-md border border-stone-800">
                    {(["normal", "compact"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setAppearance({ density: d })}
                        className={`flex-1 px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
                          appearance.density === d
                            ? "bg-[color-mix(in_oklab,var(--hi)_12%,transparent)] text-[var(--hi)]"
                            : "text-stone-400 hover:bg-stone-900"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-stone-500">
                    <Gauge className="h-3.5 w-3.5" /> message timestamps
                  </h2>
                  <p className="text-[13px] leading-relaxed text-stone-400">
                    Small mono clocks next to each message. Turn off for a cleaner transcript.
                  </p>
                  <div className="flex overflow-hidden rounded-md border border-stone-800">
                    {([
                      { v: true, label: "show" },
                      { v: false, label: "hide" },
                    ] as { v: boolean; label: string }[]).map((o) => (
                      <button
                        key={o.label}
                        onClick={() => setAppearance({ times: o.v } as Partial<Appearance>)}
                        className={`flex-1 px-3 py-1.5 font-mono text-[11.5px] transition-colors ${
                          appearance.times === o.v
                            ? "bg-[color-mix(in_oklab,var(--hi)_12%,transparent)] text-[var(--hi)]"
                            : "text-stone-400 hover:bg-stone-900"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </section>

                <p className="font-mono text-[10.5px] leading-relaxed text-stone-600">
                  appearance is stored per-browser (localStorage) — it never leaves this machine.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <ModelPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        models={catalog?.models ?? []}
        currentProvider={settings?.defaultProvider ?? "openrouter"}
        currentModel={settings?.defaultModel ?? "openrouter/auto"}
        openrouterKeyed={openrouterKeyed}
        onSelect={(provider, model) => {
          void saveSettings({ defaultProvider: provider, defaultModel: model });
          setPickerOpen(false);
        }}
        onOpenSettings={() => setTab("providers")}
      />
    </div>
  );
}
