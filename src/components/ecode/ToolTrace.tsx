"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Loader2, Terminal, FileText, FilePlus, FileMinus, FolderOpen, Search, ShieldAlert, Check, Ban, MessageCircleQuestion, CornerDownRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiffViewer } from "./DiffViewer";
import type { UiMessage } from "@/lib/ecode/store";

const TOOL_META: Record<string, { icon: typeof FileText; label: string; risky: boolean }> = {
  file_read: { icon: FileText, label: "read file", risky: false },
  file_list: { icon: FolderOpen, label: "list files", risky: false },
  file_write: { icon: FilePlus, label: "write file", risky: true },
  file_delete: { icon: FileMinus, label: "delete file", risky: true },
  shell: { icon: Terminal, label: "shell", risky: true },
  grep_search: { icon: Search, label: "grep", risky: false },
  ask_user: { icon: MessageCircleQuestion, label: "ask user", risky: false },
};

export function ToolTrace({ msg }: { msg: UiMessage }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[msg.toolName ?? ""] ?? { icon: Terminal, label: msg.toolName ?? "tool", risky: false };
  const Icon = meta.icon;

  const status = msg.toolStatus ?? "running";
  const statusIcon =
    status === "pending" ? <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> :
    status === "running" ? <Loader2 className="h-3.5 w-3.5 text-stone-400 animate-spin" /> :
    status === "success" ? <CircleCheck className="h-3.5 w-3.5 text-emerald-400" /> :
    status === "denied" ? <Ban className="h-3.5 w-3.5 text-stone-400" /> :
    <CircleX className="h-3.5 w-3.5 text-red-400" />;

  const isAskUser = msg.toolName === "ask_user";
  let summary = "";
  let askPayload: { question?: string; options?: { label: string; description?: string }[] } | null = null;
  try {
    const args = msg.toolArgs ? (JSON.parse(msg.toolArgs) as Record<string, unknown>) : {};
    if (isAskUser) {
      askPayload = args as { question?: string; options?: { label: string; description?: string }[] };
      summary = typeof args.question === "string" ? args.question : "";
    } else {
      summary = typeof args.path === "string" ? args.path : typeof args.command === "string" ? args.command : typeof args.pattern === "string" ? `"${args.pattern}"` : "";
    }
  } catch {
    summary = "";
  }
  const hasDetails = Boolean(msg.toolResult || msg.diff);

  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/60 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-800/40 transition-colors"
          onClick={() => setOpen(!open)}
        >
          {statusIcon}
          <Icon className="h-3.5 w-3.5 text-stone-400" />
          <span className="font-mono text-xs text-stone-300">{meta.label}</span>
          <span className="truncate font-mono text-[11px] text-stone-500 max-w-[380px]">{summary}</span>
          {meta.risky && status === "pending" && (
            <Badge variant="outline" className="h-4 border-amber-500/40 text-amber-400/90 text-[9px] px-1">
              needs approval
            </Badge>
          )}
          {typeof msg.latencyMs === "number" && msg.latencyMs > 0 && (
            <span className="ml-auto font-mono text-[10px] text-stone-600">{msg.latencyMs}ms</span>
          )}
          <span className="text-stone-500">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        </button>
        <CollapsibleContent>
          <div className="border-t border-stone-800/80 px-3 py-2 space-y-2">
            {isAskUser ? (
              <>
                {askPayload?.question && (
                  <div className="text-[13px] text-stone-200 leading-relaxed">{askPayload.question}</div>
                )}
                {askPayload?.options && askPayload.options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {askPayload.options.map((o, i) => (
                      <span key={i} className="rounded-md border border-stone-700 bg-stone-900 px-2 py-0.5 text-[11px] text-stone-400">{o.label}</span>
                    ))}
                  </div>
                )}
                {msg.toolResult && (
                  <div className="flex items-start gap-2 rounded-md border border-sky-500/25 bg-sky-500/[0.06] px-2.5 py-1.5">
                    <CornerDownRight className="h-3.5 w-3.5 text-sky-400 mt-0.5 shrink-0" />
                    <span className="text-[12.5px] text-stone-200 whitespace-pre-wrap break-words">{msg.toolResult}</span>
                  </div>
                )}
              </>
            ) : (
              <>
            {msg.toolArgs && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">arguments</div>
                <pre className="rounded bg-stone-950 border border-stone-800 p-2 font-mono text-[11px] text-stone-300 overflow-x-auto whitespace-pre-wrap break-all">
                  {msg.toolArgs}
                </pre>
              </div>
            )}
            {msg.toolResult && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">output</div>
                <pre className={`rounded bg-stone-950 border p-2 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all ${status === "error" ? "border-red-500/30 text-red-300" : status === "denied" ? "border-stone-700 text-stone-400" : "border-stone-800 text-stone-300"}`}>
                  {msg.toolResult}
                </pre>
              </div>
            )}
            {msg.diff && <DiffViewer diff={msg.diff} />}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {!open && hasDetails && msg.diff && (
        <div className="border-t border-stone-800/60 px-3 py-1.5 flex items-center gap-2 text-[11px] text-stone-500 font-mono">
          <span className="text-emerald-400">+{msg.diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).length}</span>
          <span className="text-red-400">−{msg.diff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length}</span>
          <span className="truncate">{msg.filePath}</span>
        </div>
      )}
    </div>
  );
}

export function ApprovalBanner({
  tool,
  args,
  onDecide,
  busy,
}: {
  tool: string;
  args: Record<string, unknown>;
  onDecide: (decision: "approve" | "deny") => void;
  busy: boolean;
}) {
  let summary = "";
  if (tool === "shell") summary = typeof args.command === "string" ? args.command : "";
  else if (tool === "file_write" || tool === "file_delete") summary = typeof args.path === "string" ? args.path : "";

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-stone-200 font-medium">
            Approval required — <span className="font-mono text-amber-300">{tool}</span>
          </div>
          <div className="mt-1 font-mono text-xs text-stone-400 truncate" title={summary}>
            {summary || "—"}
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={() => onDecide("approve")} disabled={busy} className="h-7 border-0 bg-[var(--hi)] text-[var(--hi-ink)] hover:opacity-90">
              <Check className="h-3.5 w-3.5 mr-1" /> Approve &amp; run
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecide("deny")} disabled={busy} className="h-7 border-stone-700 hover:bg-stone-800">
              <Ban className="h-3.5 w-3.5 mr-1" /> Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
