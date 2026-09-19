"use client";

import { useState } from "react";
import {
  Brain, Check, Coins, FolderTree, Gauge, Hammer, Map, MoreHorizontal, Redo2, Shield, Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEcode, useUi } from "@/lib/ecode/store";
import { YOLO_WARNING } from "@/lib/ecode/constants";
import { ProviderIcon } from "./ProviderIcon";
import { ModelPicker } from "./ModelPicker";
import { THINKING_LEVELS } from "@/lib/ecode/types";

/**
 * Compact h-11 toolbar. Only the controls that change every few minutes are
 * visible; permission mode, context/cost meters and undo/redo live in the
 * "..." overflow. Everything is icon + tooltip, terminal-voice labels.
 */
export function SessionHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { currentSession: s, providers, catalog, updateSession, undo, redo, isStreaming, fromCli, loadCatalog } = useEcode();
  const rightPanel = useUi((u) => u.rightPanel);
  const setRightPanel = useEcode((st) => st.setRightPanel);
  const [yoloOpen, setYoloOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!s) return null;

  const catalogEntry = catalog?.models.find((m) => m.id === s.model);
  const modelLabel = catalogEntry?.label
    ?? providers.find((p) => p.id === s.provider)?.models?.find((m) => m.id === s.model)?.label
    ?? s.model;
  const contextLimit = catalogEntry?.contextLimit
    ?? providers.find((p) => p.id === s.provider)?.models?.find((m) => m.id === s.model)?.contextLimit
    ?? s.contextLimit;
  const contextPct = Math.min(100, Math.round((s.totalTokens / Math.max(1, contextLimit)) * 100));

  const modeBadge = s.mode === "yolo" ? "YOLO" : s.mode === "auto" ? "auto" : "manual";

  return (
    <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-stone-800/60 bg-stone-950 px-3">
      {/* Title (inline editable) */}
      {titleDraft === null ? (
        <button
          className="max-w-[140px] truncate text-[13px] font-medium text-stone-200 transition-colors hover:text-[var(--hi)] xl:max-w-[240px]"
          onClick={() => setTitleDraft(s.title)}
          title="Rename session"
        >
          {s.title}
        </button>
      ) : (
        <input
          autoFocus
          className="max-w-[140px] rounded border border-stone-700 bg-stone-900 px-2 py-0.5 text-[13px] text-stone-100 outline-none xl:max-w-[240px]"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft.trim() && titleDraft !== s.title) updateSession(s.id, { title: titleDraft.trim() });
            setTitleDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setTitleDraft(null);
          }}
        />
      )}

      {fromCli && (
        <Badge variant="outline" className="hidden h-4 shrink-0 border-stone-700 px-1 font-mono text-[9px] text-stone-500 lg:inline-flex">
          cli
        </Badge>
      )}

      {/* Model selector — the most-used control stays visible */}
      <button
        onClick={() => {
          loadCatalog();
          setPickerOpen(true);
        }}
        className="flex h-7 max-w-[210px] shrink-0 items-center gap-1.5 rounded-md border border-stone-800 bg-stone-900 px-2 transition-colors hover:border-stone-700 hover:bg-stone-800"
        title="Select model — 450+ models with search"
      >
        <ProviderIcon provider={s.provider} model={s.model} size={13} />
        <span className="truncate text-[11.5px] text-stone-300">{modelLabel}</span>
        {catalogEntry?.stealth && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hi)]" title="stealth preview" />}
      </button>

      {/* Plan / Build — icon-only segmented control */}
      <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-stone-800 bg-stone-900">
        <button
          onClick={() => updateSession(s.id, { agentMode: "build" })}
          className={`flex h-7 w-8 items-center justify-center transition-colors ${
            s.agentMode !== "plan" ? "bg-[color-mix(in_oklab,var(--hi)_15%,transparent)] text-[var(--hi)]" : "text-stone-500 hover:text-stone-300"
          }`}
          title="Build mode — the agent can read, write and execute"
        >
          <Hammer className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => updateSession(s.id, { agentMode: "plan" })}
          className={`flex h-7 w-8 items-center justify-center border-l border-stone-800 transition-colors ${
            s.agentMode === "plan" ? "bg-amber-500/15 text-amber-300" : "text-stone-500 hover:text-stone-300"
          }`}
          title="Plan mode — read-only research and implementation plans"
        >
          <Map className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Thinking level */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex h-7 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
              s.thinking !== "off"
                ? "border-[color-mix(in_oklab,var(--hi)_40%,transparent)] bg-[color-mix(in_oklab,var(--hi)_10%,transparent)] text-[var(--hi)]"
                : "border-stone-800 bg-stone-900 text-stone-500 hover:text-stone-300"
            }`}
            title="Thinking mode — watch the model reason before answering"
          >
            <Brain className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 border-stone-800 bg-stone-900">
          <DropdownMenuLabel className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-stone-500">
            <Brain className="h-3 w-3" /> reasoning effort
          </DropdownMenuLabel>
          {THINKING_LEVELS.map((lv) => (
            <DropdownMenuItem
              key={lv.id}
              className={`gap-2 ${s.thinking === lv.id ? "text-[var(--hi)]" : "text-stone-300"}`}
              onClick={() => updateSession(s.id, { thinking: lv.id })}
            >
              <Check className={`h-3.5 w-3.5 ${s.thinking === lv.id ? "opacity-100" : "opacity-0"}`} />
              <div className="flex flex-col">
                <span className="text-xs font-medium">{lv.label}</span>
                <span className="text-[10px] text-stone-500">{lv.hint}</span>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-stone-800" />
          <div className="px-2 py-1.5 text-[10px] leading-relaxed text-stone-500">
            Reasoning stays visible above each answer — it is never hidden when the answer starts.
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-1">
        {/* Overflow: permission, context, cost, undo/redo */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-7 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-900 hover:text-stone-200"
              title="Session controls"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 border-stone-800 bg-stone-900">
            <DropdownMenuLabel className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-stone-500">
              <Shield className="h-3 w-3" /> permission · <span className="text-stone-300">{modeBadge}</span>
            </DropdownMenuLabel>
            <DropdownMenuItem
              className="gap-2 text-stone-300"
              onClick={() => updateSession(s.id, { mode: "manual" })}
            >
              <Check className={`h-3.5 w-3.5 ${s.mode === "manual" ? "opacity-100" : "opacity-0"}`} /> Manual — approve each action
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-stone-300"
              onClick={() => updateSession(s.id, { mode: "auto" })}
            >
              <Check className={`h-3.5 w-3.5 ${s.mode === "auto" ? "opacity-100" : "opacity-0"}`} /> Auto — skip approvals
            </DropdownMenuItem>
            <DropdownMenuItem
              className={`gap-2 ${s.mode === "yolo" ? "text-red-400" : "text-stone-300"}`}
              onClick={() => {
                if (s.mode !== "yolo") setYoloOpen(true);
                else updateSession(s.id, { mode: "manual" });
              }}
            >
              <Check className={`h-3.5 w-3.5 ${s.mode === "yolo" ? "opacity-100" : "opacity-0"}`} /> YOLO — auto-approve everything
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-stone-800" />
            <div className="flex items-center gap-2 px-2 py-1.5 font-mono text-[10.5px] text-stone-500">
              <Gauge className="h-3 w-3" /> context
              <span className="text-stone-300">{contextPct}%</span>
              <Coins className="ml-2 h-3 w-3" /> spend
              <span className="text-stone-300">${s.estCost.toFixed(4)}</span>
            </div>
            <DropdownMenuSeparator className="bg-stone-800" />
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                onClick={undo}
                disabled={isStreaming}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-stone-800 py-1 font-mono text-[10.5px] text-stone-400 transition-colors hover:text-stone-200 disabled:opacity-40"
              >
                <Undo2 className="h-3 w-3" /> undo
              </button>
              <button
                onClick={redo}
                disabled={isStreaming}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-stone-800 py-1 font-mono text-[10.5px] text-stone-400 transition-colors hover:text-stone-200 disabled:opacity-40"
              >
                <Redo2 className="h-3 w-3" /> redo
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Panels */}
        <button
          onClick={() => setRightPanel(rightPanel === "files" ? null : "files")}
          className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors hover:bg-stone-900 ${
            rightPanel === "files" ? "text-[var(--hi)]" : "text-stone-500 hover:text-stone-200"
          }`}
          title="Workspace files"
        >
          <FolderTree className="h-4 w-4" />
        </button>
        <button
          onClick={() => setRightPanel(rightPanel === "logs" ? null : "logs")}
          className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors hover:bg-stone-900 ${
            rightPanel === "logs" ? "text-[var(--hi)]" : "text-stone-500 hover:text-stone-200"
          }`}
          title="Audit log & telemetry"
        >
          <Gauge className="h-4 w-4" />
        </button>
      </div>

      <ModelPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        models={catalog?.models ?? []}
        currentProvider={s.provider}
        currentModel={s.model}
        openrouterKeyed={providers.find((p) => p.id === "openrouter")?.configured ?? false}
        onSelect={(provider, model) => updateSession(s.id, { provider, model })}
        onOpenSettings={onOpenSettings ?? (() => {})}
      />

      <AlertDialog open={yoloOpen} onOpenChange={setYoloOpen}>
        <AlertDialogContent className="border-stone-800 bg-stone-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">Enable YOLO mode?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed text-stone-400">{YOLO_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-stone-700 bg-stone-900 text-stone-300 hover:bg-stone-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={() => updateSession(s.id, { mode: "yolo" })}
            >
              I understand — enable YOLO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
