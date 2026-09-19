"use client";

import { useEffect, useState } from "react";
import { File, FileCode2, Folder, FolderOpen, History, ScrollText, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DiffViewer } from "./DiffViewer";
import { useEcode, useUi } from "@/lib/ecode/store";
import type { FileNode } from "@/lib/ecode/workspace";

function FileTree({ nodes, onOpen }: { nodes: FileNode[]; onOpen: (p: string) => void }) {
  return (
    <div className="space-y-0.5">
      {nodes.map((n) =>
        n.type === "dir" ? (
          <details key={n.path} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded px-1.5 py-1 text-xs text-stone-300 hover:bg-stone-900">
              <Folder className="h-3.5 w-3.5 text-stone-500 group-open:hidden" />
              <FolderOpen className="hidden h-3.5 w-3.5 text-[var(--hi)]/70 group-open:block" />
              <span className="truncate">{n.name}</span>
            </summary>
            <div className="ml-4 border-l border-stone-800/70 pl-1.5">
              {n.children && <FileTree nodes={n.children} onOpen={onOpen} />}
            </div>
          </details>
        ) : (
          <button
            key={n.path}
            onClick={() => onOpen(n.path)}
            className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-stone-400 hover:bg-stone-900 hover:text-stone-200"
          >
            {/\.(ts|tsx|js|jsx|py|rs|go|json|md|css|html|sh|yml|yaml|toml)$/.test(n.name) ? (
              <FileCode2 className="h-3.5 w-3.5 text-[var(--hi)]/60" />
            ) : (
              <File className="h-3.5 w-3.5 text-stone-600" />
            )}
            <span className="truncate">{n.name}</span>
            {typeof n.size === "number" && (
              <span className="ml-auto font-mono text-[9px] text-stone-700">{n.size < 1024 ? `${n.size}B` : `${(n.size / 1024).toFixed(1)}k`}</span>
            )}
          </button>
        )
      )}
    </div>
  );
}

export function SidePanel() {
  const { currentSession, files, loadFiles, logs, logStats, changesets } = useEcode();
  const rightPanel = useUi((u) => u.rightPanel);
  const setUiRightPanel = useUi((u) => u.setRightPanel);
  const [filePreview, setFilePreview] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    if (rightPanel === "files" && currentSession) {
      void loadFiles(currentSession.id);
    }
  }, [rightPanel, currentSession, loadFiles, changesets.length]);

  if (!rightPanel || !currentSession) return null;

  const openFile = async (p: string) => {
    const res = await fetch(`/api/sessions/${currentSession.id}/files?path=${encodeURIComponent(p)}`);
    if (res.ok) {
      const data = await res.json();
      setFilePreview({ path: p, content: data.file?.content ?? "" });
    }
  };

  const eventColor: Record<string, string> = {
    model_request: "text-[var(--hi)]",
    tool_call: "text-amber-400",
    approval: "text-purple-400",
    yolo_toggle: "text-red-400",
    diff_apply: "text-cyan-400",
    context_compaction: "text-orange-400",
    session_start: "text-stone-400",
    session_end: "text-stone-400",
    provider_fallback: "text-yellow-400",
  };

  const close = () => {
    setFilePreview(null);
    setUiRightPanel(null);
  };

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-stone-800/60 bg-stone-950 lg:flex">
      <Tabs
        value={rightPanel}
        onValueChange={(v) => {
          // keep the store in sync when the user picks the "changes" tab
          // directly in the panel — header toggles stay accurate.
          if (v === "files" || v === "logs") setUiRightPanel(v);
        }}
        className="flex h-full min-h-0 w-full flex-col"
      >
        <div className="flex h-11 shrink-0 items-center border-b border-stone-800/60 pl-3 pr-1.5">
          <TabsList className="h-7 bg-stone-900">
            <TabsTrigger value="files" className="h-5 gap-1.5 px-2 text-[11px] data-[state=active]:text-[var(--hi)]">
              <File className="h-3 w-3" /> Files
            </TabsTrigger>
            <TabsTrigger value="logs" className="h-5 gap-1.5 px-2 text-[11px] data-[state=active]:text-[var(--hi)]">
              <ScrollText className="h-3 w-3" /> Logs
            </TabsTrigger>
            <TabsTrigger value="changes" className="h-5 gap-1.5 px-2 text-[11px] data-[state=active]:text-[var(--hi)]">
              <History className="h-3 w-3" /> Changes
            </TabsTrigger>
          </TabsList>
          {/* proper close affordance — the panel was impossible to close before */}
          <button
            onClick={close}
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-900 hover:text-stone-200"
            title="Close panel"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <TabsContent value="files" className="ec-scroll flex-1 overflow-y-auto p-3">
            {filePreview ? (
              <div className="space-y-2">
                <button className="text-xs text-[var(--hi)] hover:opacity-80" onClick={() => setFilePreview(null)}>
                  ← back to tree
                </button>
                <div className="truncate font-mono text-[11px] text-stone-400">{filePreview.path}</div>
                <pre className="overflow-x-auto whitespace-pre rounded-md border border-stone-800 bg-stone-950 p-2.5 font-mono text-[10.5px] leading-relaxed text-stone-300">
                  {filePreview.content.slice(0, 20_000)}
                </pre>
              </div>
            ) : (
              <FileTree nodes={files as FileNode[]} onOpen={openFile} />
            )}
          </TabsContent>

          <TabsContent value="logs" className="ec-scroll flex-1 space-y-3 overflow-y-auto p-3">
            {logStats && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "model calls", value: logStats.modelRequests ?? 0 },
                  { label: "avg latency", value: `${logStats.avgLatencyMs ?? 0}ms` },
                  { label: "tokens", value: (logStats.totalTokens ?? 0).toLocaleString() },
                  { label: "error rate", value: `${logStats.errorRate ?? 0}%` },
                  { label: "tool calls", value: logStats.toolCalls ?? 0 },
                  { label: "approvals", value: logStats.approvals ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="rounded-md border border-stone-800 bg-stone-900/50 p-2">
                    <div className="font-mono text-sm text-stone-200">{s.value}</div>
                    <div className="font-mono text-[10px] text-stone-500">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              {logs.length === 0 && <div className="py-6 text-center font-mono text-[11px] text-stone-600">no events yet</div>}
              {logs.map((l) => (
                <div key={l.id} className="rounded-md border border-stone-800/70 bg-stone-900/40 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed">
                  <div className="flex items-center gap-1.5">
                    <span className={eventColor[l.event] ?? "text-stone-400"}>{l.event}</span>
                    {l.status === "error" ? (
                      <Badge variant="outline" className="h-3.5 border-red-500/40 px-1 text-[8px] text-red-400">error</Badge>
                    ) : (
                      <span className="text-stone-700">·</span>
                    )}
                    <span className="ml-auto text-stone-600">{new Date(l.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-stone-500">
                    {l.model && <span>{l.model}</span>}
                    {l.totalTokens != null && <span>{l.totalTokens} tk</span>}
                    {l.latencyMs != null && <span>{l.latencyMs}ms</span>}
                    {l.userAction && <span>{l.userAction}</span>}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="changes" className="ec-scroll flex-1 space-y-2 overflow-y-auto p-3">
            {changesets.length === 0 && (
              <div className="py-6 text-center font-mono text-[11px] leading-relaxed text-stone-600">
                no file changes yet
                <br />
                ask the agent to edit something
              </div>
            )}
            {changesets.map((c) => (
              <details key={c.id} className="group overflow-hidden rounded-md border border-stone-800 bg-stone-900/40">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2">
                  <FileCode2 className="h-3.5 w-3.5 text-[var(--hi)]/60" />
                  <span className="truncate font-mono text-[11px] text-stone-300">{c.filePath}</span>
                  <Badge
                    variant="outline"
                    className={`ml-auto h-4 text-[9px] ${
                      c.status === "undone"
                        ? "border-stone-600 text-stone-500"
                        : "border-[color-mix(in_oklab,var(--hi)_40%,transparent)] text-[var(--hi)]"
                    }`}
                  >
                    {c.status}
                  </Badge>
                </summary>
                <div className="border-t border-stone-800/70 p-2">
                  <DiffViewer diff={c.diff} compact />
                </div>
              </details>
            ))}
            <div className="flex items-center gap-1.5 pt-1 font-mono text-[10px] text-stone-600">
              {changesets.filter((c) => c.status === "applied").length} applied ·{" "}
              {changesets.filter((c) => c.status === "undone").length} undone — /undo /redo
            </div>
          </TabsContent>
      </Tabs>
    </aside>
  );
}
