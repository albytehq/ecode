"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2, Map, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEcode } from "@/lib/ecode/store";

const HINTS = [
  { icon: Map, label: "Plan first", text: "plan a REST API for this project, then list the files you'd touch" },
  { icon: Wand2, label: "Build", text: "create a small express server in server.js with a /health route" },
  { icon: Map, label: "Explore", text: "read the codebase and explain how the auth flow works" },
];

/**
 * The Ecode home screen — not a landing page. A real, focused composer.
 * Sending the first message creates the session lazily, so there is no
 * empty-session spam in the sidebar.
 */
export function EmptyChat() {
  const { createSession, sendMessage, isStreaming, catalog, providers, setToast } = useEcode();
  const [draft, setDraft] = useState("");
  const [booting, setBooting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const openrouterKeyed = providers.find((p) => p.id === "openrouter")?.configured ?? false;

  const submit = async () => {
    const text = draft.trim();
    if (!text || isStreaming || booting) return;
    setDraft("");
    setBooting(true);
    try {
      const id = await createSession();
      if (!id) {
        setToast("could not start a session — try again");
        return;
      }
      await sendMessage(text);
    } finally {
      setBooting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
      <div className="w-full max-w-2xl space-y-8 py-10">
        {/* greeting — one line, no hero, no marketing */}
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-100">
            What are we building?
          </h1>
          <p className="font-mono text-[11px] text-stone-500">
            ecode v0.1.12 · {catalog?.total ?? "450+"} models live · {openrouterKeyed ? "openrouter connected" : "add a key in settings to start"}
          </p>
        </div>

        {/* the real composer */}
        <div className="group relative rounded-lg border border-stone-800 bg-stone-900/70 transition-colors focus-within:border-[color-mix(in_oklab,var(--hi)_50%,transparent)]">
          <textarea
            ref={taRef}
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(200, e.target.scrollHeight) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={3}
            placeholder="describe what you want to build…"
            className="max-h-[200px] w-full resize-none bg-transparent px-4 py-3.5 text-[15px] text-stone-100 placeholder:text-stone-600 outline-none"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="font-mono text-[10px] text-stone-600">enter to send · shift+enter newline</span>
            <Button
              size="icon"
              onClick={() => void submit()}
              disabled={!draft.trim() || isStreaming || booting}
              className="h-7 w-7 rounded-md border-0 bg-stone-700 text-stone-100 hover:bg-[var(--hi)] hover:text-[var(--hi-ink)] disabled:opacity-40"
            >
              {booting || isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* hint chips — clickable starters, not feature cards */}
        <div className="space-y-1.5">
          {HINTS.map((h) => (
            <button
              key={h.label}
              onClick={() => {
                setDraft(h.text);
                taRef.current?.focus();
              }}
              className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-stone-800 hover:bg-stone-900/60"
            >
              <h.icon className="h-3.5 w-3.5 shrink-0 text-[var(--hi)]" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">{h.label}</span>
              <span className="truncate text-[13px] text-stone-400">{h.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
