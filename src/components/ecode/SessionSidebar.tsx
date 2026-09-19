"use client";

import { useEffect } from "react";
import { ChevronsLeft, ChevronsRight, Plus, Settings2, SquarePen, Trash2 } from "lucide-react";
import { useEcode, useUi } from "@/lib/ecode/store";

/**
 * Collapsible session sidebar (Ctrl/Cmd+B).
 * One JSX tree driven by data-state on the <aside> — zero remount, so the
 * chat area only reflows, never rebuilds. Expanded = w-72, rail = w-14.
 */
export function SessionSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { sessions, currentSession, selectSession, createSession, deleteSession, isStreaming } = useEcode();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const totalTokens = sessions.reduce((s, x) => s + x.totalTokens, 0);

  // Global Ctrl/Cmd+B — guarded while typing in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        const t = e.target as HTMLElement | null;
        const typing =
          t &&
          (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("contenteditable") === "true");
        if (typing) return;
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const goHome = () => useEcode.getState().goHome();

  return (
    <aside
      data-state={collapsed ? "collapsed" : "expanded"}
      className="relative hidden shrink-0 overflow-hidden border-r border-stone-800/60 bg-stone-950 transition-[width] duration-200 ease-out md:block"
      style={{ width: collapsed ? "3.5rem" : "18rem" }}
    >
      {/* ─── expanded layer ─────────────────────────────────────────────── */}
      <div
        aria-hidden={collapsed}
        className={`absolute inset-0 flex w-72 flex-col transition-opacity duration-150 ${
          collapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {/* header: logo = home */}
        <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-stone-800/60 px-3">
          <button
            onClick={goHome}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_oklab,var(--hi)_35%,transparent)] bg-[color-mix(in_oklab,var(--hi)_12%,transparent)]"
            title="Ecode — home (new chat)"
          >
            <span className="font-mono text-[13px] font-bold text-[var(--hi)]">E</span>
          </button>
          <button onClick={goHome} className="font-mono text-[13px] font-semibold tracking-tight text-stone-100 hover:text-[var(--hi)]" title="Home">
            ecode
          </button>
          <span className="font-mono text-[10px] text-stone-600">v0.1.12</span>
          <button
            onClick={toggleSidebar}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:bg-stone-900 hover:text-stone-300"
            title="Collapse sidebar (Ctrl+B)"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        </div>

        {/* new session */}
        <div className="p-2.5 pb-1">
          <button
            onClick={() => createSession()}
            className="flex w-full items-center gap-2 rounded-md border border-[color-mix(in_oklab,var(--hi)_30%,transparent)] bg-[color-mix(in_oklab,var(--hi)_8%,transparent)] px-2.5 py-1.5 text-[12.5px] text-[var(--hi)] transition-colors hover:bg-[color-mix(in_oklab,var(--hi)_15%,transparent)]"
          >
            <Plus className="h-3.5 w-3.5" /> New session
          </button>
        </div>

        {/* session list */}
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 && (
            <div className="px-3 py-6 text-center font-mono text-[10.5px] leading-relaxed text-stone-600">
              no sessions yet
              <br />
              type below to start
            </div>
          )}
          {sessions.map((s) => {
            const active = s.id === currentSession?.id;
            return (
              <div
                key={s.id}
                className={`group cursor-pointer rounded-md border px-2.5 py-1.5 transition-colors ${
                  active
                    ? "border-[color-mix(in_oklab,var(--hi)_30%,transparent)] bg-[color-mix(in_oklab,var(--hi)_8%,transparent)]"
                    : "border-transparent hover:bg-stone-900"
                }`}
                onClick={() => selectSession(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && selectSession(s.id)}
              >
                <div className="flex items-center gap-2">
                  <span className={`truncate text-[13px] ${active ? "text-stone-100" : "text-stone-300"}`}>{s.title}</span>
                  {s.mode === "yolo" && (
                    <span className="ml-auto shrink-0 rounded border border-red-500/40 px-1 font-mono text-[9px] text-red-400">YOLO</span>
                  )}
                </div>
                {/* meta row — delete lives here, never covering the title */}
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-stone-600">
                  <span className="truncate">{s.model}</span>
                  <span className="shrink-0">{s.totalTokens.toLocaleString()}tk</span>
                  {s.estCost > 0 && <span className="shrink-0">${s.estCost.toFixed(3)}</span>}
                  <button
                    className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-stone-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    aria-label="Delete session"
                    title="Delete session"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* footer: stats + settings */}
        <div className="shrink-0 space-y-2 border-t border-stone-800/60 p-2.5">
          <div className="flex justify-between rounded-md border border-stone-800/60 bg-stone-900/40 px-2.5 py-1.5 font-mono text-[10px] text-stone-500">
            <span>{sessions.length} sessions</span>
            <span>{totalTokens.toLocaleString()} tk</span>
          </div>
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] text-stone-400 transition-colors hover:bg-stone-900 hover:text-stone-200"
          >
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </button>
        </div>
      </div>

      {/* ─── collapsed rail layer ────────────────────────────────────────── */}
      <div
        aria-hidden={!collapsed}
        className={`absolute inset-0 flex w-14 flex-col items-center transition-opacity duration-150 ${
          collapsed ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex h-11 w-full shrink-0 items-center justify-center border-b border-stone-800/60">
          <button
            onClick={goHome}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_oklab,var(--hi)_35%,transparent)] bg-[color-mix(in_oklab,var(--hi)_12%,transparent)]"
            title="Ecode — home"
          >
            <span className="font-mono text-[13px] font-bold text-[var(--hi)]">E</span>
          </button>
        </div>
        <div className="mt-2.5 flex w-full flex-col items-center gap-1.5">
          <button
            onClick={() => createSession()}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[color-mix(in_oklab,var(--hi)_30%,transparent)] text-[var(--hi)] transition-colors hover:bg-[color-mix(in_oklab,var(--hi)_12%,transparent)]"
            title="New session"
          >
            <SquarePen className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1" />
        <div className="mb-2 flex w-full flex-col items-center">
          <button
            onClick={onOpenSettings}
            className="flex h-9 w-9 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-900 hover:text-stone-200"
            title="Settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSidebar}
            className="flex h-9 w-9 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-900 hover:text-stone-300"
            title="Expand sidebar (Ctrl+B)"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* streaming indicator on the rail edge — subtle amber pulse */}
      {isStreaming && collapsed && (
        <span className="absolute left-0 top-0 h-full w-0.5 animate-pulse bg-[var(--hi)]" />
      )}
    </aside>
  );
}
