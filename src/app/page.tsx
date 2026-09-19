"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useEcode, useUi } from "@/lib/ecode/store";
import { SessionSidebar } from "@/components/ecode/SessionSidebar";
import { SessionHeader } from "@/components/ecode/SessionHeader";
import { ChatView } from "@/components/ecode/ChatView";
import { SidePanel } from "@/components/ecode/SidePanel";
import { SettingsView } from "@/components/ecode/SettingsView";
import { EmptyChat } from "@/components/ecode/EmptyChat";

export default function Page() {
  const { loadSessions, loadProviders, loadCatalog, createSession, currentSession, toast: storeToast, setToast, booted, setBooted } = useEcode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bootRan = useRef(false);

  // Parallel, non-gating data loads
  useEffect(() => {
    void loadSessions();
    void loadProviders();
    void loadCatalog();
  }, [loadSessions, loadProviders, loadCatalog]);

  // ─── Boot sequence (runs once) ─────────────────────────────────────────────
  // Priority: URL ?session= (CLI deep-link / reload) → ?dir= (ecode ~/path)
  // → persisted lastSessionId → empty chat. The session stays in the URL after
  // selection, so a plain reload lands right back in the conversation.
  useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("from") === "cli") useEcode.setState({ fromCli: true });
      const sessionId = params.get("session");
      const dir = params.get("dir");
      const plan = params.get("mode") === "plan";

      if (sessionId) {
        const ok = await useEcode.getState().selectSession(sessionId, { silent: true });
        if (ok) {
          setBooted(true);
          return;
        }
        window.history.replaceState({}, "", "/");
      } else if (dir) {
        await useEcode.getState().createSession({ dir, agentMode: plan ? "plan" : "build" });
        setBooted(true);
        return;
      } else {
        const last = useUi.getState().lastSessionId;
        if (last) {
          const ok = await useEcode.getState().selectSession(last, { silent: true });
          if (ok) {
            setBooted(true);
            return;
          }
          // stale id — clean it up and show the empty chat
          useUi.getState().setLastSessionId(null);
          window.history.replaceState({}, "", "/");
        }
      }
      setBooted(true);
    })();
  }, [setBooted]);

  useEffect(() => {
    if (storeToast) {
      toast(storeToast);
      setToast(null);
    }
  }, [storeToast, setToast]);

  const openSettings = () => {
    setSettingsOpen(true);
  };

  return (
    <div className="flex h-dvh flex-col bg-stone-950 text-stone-200">
      <Toaster theme="dark" position="bottom-center" richColors />
      <div className="flex min-h-0 flex-1">
        <SessionSidebar onOpenSettings={openSettings} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          {!currentSession && (
            <div className="flex h-11 items-center gap-2 border-b border-stone-800/60 px-3 md:hidden">
              <div className="flex h-6 w-6 items-center justify-center rounded border border-[color-mix(in_oklab,var(--hi)_35%,transparent)] bg-[color-mix(in_oklab,var(--hi)_12%,transparent)]">
                <span className="font-mono text-[11px] font-bold text-[var(--hi)]">E</span>
              </div>
              <span className="font-mono font-semibold tracking-tight text-stone-100">ecode</span>
              <button
                onClick={() => createSession()}
                className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--hi)_35%,transparent)] bg-[color-mix(in_oklab,var(--hi)_10%,transparent)] px-2.5 font-mono text-[11px] text-[var(--hi)]"
              >
                <Plus className="h-3 w-3" /> new
              </button>
              <button
                onClick={openSettings}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-800 text-stone-400"
                aria-label="Settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {currentSession ? (
            <>
              <SessionHeader onOpenSettings={openSettings} />
              <ChatView />
            </>
          ) : (
            <EmptyChat />
          )}
        </div>

        <SidePanel />
      </div>

      <SettingsView open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
