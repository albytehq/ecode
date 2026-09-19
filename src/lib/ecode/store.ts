"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { streamSse } from "./client-sse";

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  reasoning?: string | null;
  toolName?: string | null;
  toolStatus?: string | null;
  toolArgs?: string | null;
  toolResult?: string | null;
  latencyMs?: number;
  diff?: string;
  filePath?: string;
  changesetId?: string;
  streaming?: boolean;
  thinkingLive?: boolean;
  createdAt?: string;
}

export interface UiSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  mode: "manual" | "auto" | "yolo";
  agentMode: "build" | "plan";
  thinking: "off" | "think" | "ultrathink";
  status: string;
  contextLimit: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estCost: number;
  messageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UiChangeset {
  id: string;
  filePath: string;
  action: string;
  diff: string;
  status: string;
  createdAt: string;
}

export interface PendingApproval {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface PendingQuestion {
  id: string;
  payload: {
    question: string;
    options?: { label: string; description?: string }[];
    allowFreeText?: boolean;
  };
}

export interface UiProvider {
  id: string;
  label: string;
  description: string;
  builtin: boolean;
  brand?: string;
  configured: boolean;
  models?: { id: string; label: string; contextLimit: number }[];
}

export interface AuditEntryUi {
  id: string;
  sessionId: string | null;
  event: string;
  provider: string | null;
  model: string | null;
  totalTokens: number | null;
  latencyMs: number | null;
  status: string;
  userAction: string | null;
  detail: string | null;
  createdAt: string;
}

export type Accent = "amber" | "emerald" | "sky" | "violet" | "rose";
export type Density = "normal" | "compact";

export interface Appearance {
  accent: Accent;
  density: Density;
  times: boolean; // show per-message timestamps
}

// ─── UI store — appearance, sidebar, last session. Persisted to localStorage. ─
interface UiState {
  sidebarCollapsed: boolean;
  lastSessionId: string | null;
  rightPanel: "files" | "logs" | null;
  appearance: Appearance;
  hydrated: boolean;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
  setRightPanel: (p: "files" | "logs" | null) => void;
  setLastSessionId: (id: string | null) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      lastSessionId: null,
      rightPanel: null,
      appearance: { accent: "amber", density: "normal", times: true },
      hydrated: false,
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setSidebar: (v) => set({ sidebarCollapsed: v }),
      setRightPanel: (p) => set({ rightPanel: p }),
      setLastSessionId: (id) => set({ lastSessionId: id }),
      setAppearance: (patch) => {
        const appearance = { ...get().appearance, ...patch };
        set({ appearance });
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-accent", appearance.accent);
          document.documentElement.setAttribute("data-density", appearance.density);
          document.documentElement.setAttribute("data-times", appearance.times ? "on" : "off");
        }
      },
    }),
    {
      name: "ecode-ui",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        lastSessionId: s.lastSessionId,
        rightPanel: s.rightPanel,
        appearance: s.appearance,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
        if (state && typeof document !== "undefined") {
          document.documentElement.setAttribute("data-accent", state.appearance.accent);
          document.documentElement.setAttribute("data-density", state.appearance.density);
          document.documentElement.setAttribute("data-times", state.appearance.times ? "on" : "off");
        }
      },
    }
  )
);

interface EcodeState {
  sessions: UiSession[];
  currentSession: UiSession | null;
  messages: UiMessage[];
  changesets: UiChangeset[];
  pendingApproval: PendingApproval | null;
  pendingQuestion: PendingQuestion | null;
  providers: UiProvider[];
  catalog: {
    version: string;
    total: number;
    models: {
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
    }[];
  } | null;
  isStreaming: boolean;
  contextPct: number;
  files: { name: string; path: string; type: "file" | "dir"; size?: number; children?: unknown[] }[];
  logs: AuditEntryUi[];
  logStats: Record<string, number> | null;
  providerRows: ProviderRow[];
  toast: string | null;
  fromCli: boolean;
  booted: boolean;

  setBooted: (v: boolean) => void;
  loadSessions: () => Promise<void>;
  createSession: (opts?: { provider?: string; model?: string; dir?: string; agentMode?: "build" | "plan"; thinking?: "off" | "think" | "ultrathink" }) => Promise<string | null>;
  selectSession: (id: string, opts?: { silent?: boolean }) => Promise<boolean>;
  deleteSession: (id: string) => Promise<void>;
  goHome: () => void;
  updateSession: (id: string, patch: Partial<Pick<UiSession, "title" | "mode" | "provider" | "model" | "agentMode" | "thinking">>) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  decideApproval: (approvalId: string, decision: "approve" | "deny") => Promise<void>;
  answerQuestion: (questionId: string, answer: { selected?: string; text?: string }) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  loadProviders: () => Promise<void>;
  loadCatalog: (force?: boolean) => Promise<void>;
  loadProviderRows: () => Promise<void>;
  loadFiles: (sessionId?: string) => Promise<void>;
  loadLogs: () => Promise<void>;
  saveProviderKey: (provider: string, apiKey: string, baseUrl?: string) => Promise<void>;
  setRightPanel: (p: "files" | "logs" | null) => void;
  setToast: (t: string | null) => void;
}

const TOOL_ICONS: Record<string, string> = {
  file_read: "read",
  file_list: "list",
  file_write: "write",
  file_delete: "delete",
  shell: "shell",
  grep_search: "search",
};

/** One in-flight stream at a time (R10: single-flight per client). */
let streamAbort: AbortController | null = null;

function abortStream() {
  if (streamAbort) {
    streamAbort.abort();
    streamAbort = null;
  }
}

function syncSessionUrl(id: string | null) {
  if (typeof window === "undefined") return;
  const url = id ? `/?session=${id}` : "/";
  window.history.replaceState({}, "", url);
}

export const useEcode = create<EcodeState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  changesets: [],
  pendingApproval: null,
  pendingQuestion: null,
  providers: [],
  catalog: null,
  isStreaming: false,
  contextPct: 0,
  files: [],
  logs: [],
  logStats: null,
  providerRows: [],
  toast: null,
  fromCli: false,
  booted: false,

  setBooted: (v) => set({ booted: v }),

  loadSessions: async () => {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    set({ sessions: data.sessions ?? [] });
  },

  createSession: async (opts) => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts ?? {}),
    });
    const data = await res.json();
    if (!res.ok) {
      set({ toast: data.error ?? "failed to create session" });
      return null;
    }
    await get().loadSessions();
    await get().selectSession(data.session.id);
    return data.session.id;
  },

  selectSession: async (id, opts) => {
    if (get().isStreaming) abortStream(); // switching mid-stream stops the old one
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) {
      if (!opts?.silent) set({ toast: "session not found" });
      return false;
    }
    const data = await res.json();
    set({
      currentSession: data.session,
      messages: data.messages.map((m: Record<string, unknown>) => ({ ...m }) as unknown as UiMessage),
      changesets: data.changesets ?? [],
      pendingApproval: data.pendingApproval ?? null,
      pendingQuestion: data.pendingQuestion ?? null,
      contextPct: 0,
    });
    useUi.getState().setLastSessionId(id);
    syncSessionUrl(id);
    const rp = useUi.getState().rightPanel;
    if (rp === "files") await get().loadFiles(id);
    if (rp === "logs") await get().loadLogs();
    return true;
  },

  deleteSession: async (id) => {
    if (get().currentSession?.id === id) {
      abortStream(); // never let an orphan stream keep writing to a deleted session
      set({ currentSession: null, messages: [], changesets: [], pendingApproval: null, pendingQuestion: null });
      useUi.getState().setLastSessionId(null);
      syncSessionUrl(null);
    }
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    await get().loadSessions();
  },

  /** Logo click: leave the session, land on the EmptyChat composer. */
  goHome: () => {
    if (get().isStreaming) abortStream();
    set({ currentSession: null, messages: [], changesets: [], pendingApproval: null, pendingQuestion: null });
    useUi.getState().setLastSessionId(null);
    syncSessionUrl(null);
  },

  updateSession: async (id, patch) => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      set({ currentSession: data.session });
      await get().loadSessions();
    }
  },

  sendMessage: async (text) => {
    const session = get().currentSession;
    if (!session || get().isStreaming) return;

    abortStream();
    const controller = new AbortController();
    streamAbort = controller;
    set({ isStreaming: true });
    const now = Date.now();
    const userMsg: UiMessage = {
      id: `u-${now}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantMsg: UiMessage = {
      id: `a-${now}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    set({ messages: [...get().messages, userMsg, assistantMsg] });

    try {
      await streamSse(`/api/sessions/${session.id}/chat`, { message: text }, (ev) =>
        handleAgentEvent(set, get, ev)
      , controller.signal);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // switched away / went home — freeze the partial reply in place
        set({
          messages: get().messages.map((m) => (m.streaming ? { ...m, streaming: false, thinkingLive: false } : m)),
          isStreaming: false,
        });
        return;
      }
      set({
        messages: get().messages.filter((m) => !m.streaming).concat(
          get().messages.filter((m) => m.streaming).map((m) =>
            m.content ? { ...m, streaming: false } : { ...m, streaming: false, content: `⚠️ ${e instanceof Error ? e.message : String(e)}` }
          )
        ),
      });
    } finally {
      streamAbort = null;
      set({ isStreaming: false });
      get().loadSessions();
    }
  },

  decideApproval: async (approvalId, decision) => {
    const session = get().currentSession;
    if (!session || get().isStreaming) return;
    abortStream();
    const controller = new AbortController();
    streamAbort = controller;
    set({ isStreaming: true, pendingApproval: null });

    const assistantMsg: UiMessage = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    set({ messages: [...get().messages, assistantMsg] });

    try {
      await streamSse(`/api/sessions/${session.id}/approvals`, { approvalId, decision }, (ev) =>
        handleAgentEvent(set, get, ev)
      , controller.signal);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        set({ toast: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      streamAbort = null;
      set({ isStreaming: false });
      get().loadSessions();
      if (useUi.getState().rightPanel === "files") await get().loadFiles();
    }
  },

  answerQuestion: async (questionId, answer) => {
    const session = get().currentSession;
    if (!session || get().isStreaming) return;
    abortStream();
    const controller = new AbortController();
    streamAbort = controller;
    set({ isStreaming: true, pendingQuestion: null });

    const assistantMsg: UiMessage = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    set({ messages: [...get().messages, assistantMsg] });

    try {
      await streamSse(`/api/sessions/${session.id}/question`, { questionId, ...answer }, (ev) =>
        handleAgentEvent(set, get, ev)
      , controller.signal);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        set({ toast: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      streamAbort = null;
      set({ isStreaming: false });
      get().loadSessions();
    }
  },

  undo: async () => {
    const session = get().currentSession;
    if (!session) return;
    const res = await fetch(`/api/sessions/${session.id}/changesets/x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undo" }),
    });
    const data = await res.json();
    set({ toast: data.message ?? (data.ok ? "undone" : "nothing to undo") });
    await get().selectSession(session.id, { silent: true });
    if (useUi.getState().rightPanel === "files") await get().loadFiles();
  },

  redo: async () => {
    const session = get().currentSession;
    if (!session) return;
    const res = await fetch(`/api/sessions/${session.id}/changesets/x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redo" }),
    });
    const data = await res.json();
    set({ toast: data.message ?? (data.ok ? "re-applied" : "nothing to redo") });
    await get().selectSession(session.id, { silent: true });
    if (useUi.getState().rightPanel === "files") await get().loadFiles();
  },

  loadProviders: async () => {
    const res = await fetch("/api/models");
    const data = await res.json();
    set({ providers: data.providers ?? [] });
  },

  loadCatalog: async (force) => {
    if (get().catalog && !force) return;
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      if (data?.models?.length) {
        set({ catalog: { version: data.version ?? "", total: data.total ?? 0, models: data.models } });
      }
    } catch {
      /* picker degrades to empty */
    }
  },

  loadProviderRows: async () => {
    const res = await fetch("/api/providers");
    if (!res.ok) return;
    const data = await res.json();
    set({ providerRows: data.providers ?? [] });
  },

  loadFiles: async (sessionId) => {
    const id = sessionId ?? get().currentSession?.id;
    if (!id) return;
    const res = await fetch(`/api/sessions/${id}/files`);
    if (!res.ok) return;
    const data = await res.json();
    set({ files: data.tree ?? [] });
  },

  loadLogs: async () => {
    const res = await fetch("/api/audit?limit=150");
    const data = await res.json();
    set({ logs: data.logs ?? [], logStats: data.stats ?? null });
  },

  saveProviderKey: async (provider, apiKey, baseUrl) => {
    const res = await fetch("/api/providers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey, baseUrl }),
    });
    set({ toast: res.ok ? (apiKey || baseUrl ? `${provider} saved` : `${provider} removed`) : "failed to save" });
    await get().loadProviders();
    await get().loadProviderRows();
  },

  setRightPanel: (p) => {
    useUi.getState().setRightPanel(p);
    if (p === "files") get().loadFiles();
    if (p === "logs") get().loadLogs();
  },

  setToast: (t) => set({ toast: t }),
}));

type SetState = (partial: Partial<EcodeState> | ((s: EcodeState) => Partial<EcodeState>)) => void;
type GetState = () => EcodeState;

function updateStreamingMessage(set: SetState, get: GetState, updater: (m: UiMessage) => UiMessage) {
  const has = get().messages.some((m) => m.streaming);
  if (!has) {
    // a new agent turn began (e.g. after an inline tool call) — create the
    // streaming assistant message so turn-2+ tokens render live
    const msg: UiMessage = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: new Date().toISOString(),
    };
    set({ messages: [...get().messages, msg] });
    return;
  }
  set({
    messages: get().messages.map((m) => (m.streaming ? updater(m) : m)),
  });
}

function handleAgentEvent(set: SetState, get: GetState, ev: Record<string, unknown>) {
  const type = ev.type as string;
  switch (type) {
    case "llm_start": {
      const provider = ev.provider as string;
      const model = ev.model as string;
      updateStreamingMessage(set, get, (m) => ({ ...m, content: m.content }));
      if (get().currentSession) {
        set({
          currentSession: { ...get().currentSession!, provider, model },
        });
      }
      break;
    }
    case "thinking_start": {
      updateStreamingMessage(set, get, (m) => ({ ...m, thinkingLive: true, reasoning: "" }));
      break;
    }
    case "thinking_token": {
      const content = ev.content as string;
      updateStreamingMessage(set, get, (m) => ({ ...m, reasoning: (m.reasoning ?? "") + content }));
      break;
    }
    case "thinking_end": {
      // NOTE: the reasoning text STAYS visible after thinking completes —
      // only the "live" shimmer state ends. No auto-collapse.
      updateStreamingMessage(set, get, (m) => ({ ...m, thinkingLive: false }));
      break;
    }
    case "token": {
      const content = ev.content as string;
      updateStreamingMessage(set, get, (m) => ({ ...m, content: m.content + content }));
      break;
    }
    case "message_saved": {
      const id = ev.id as string;
      const role = ev.role as string;
      const content = ev.content as string;
      const reasoning = ev.reasoning as string | undefined;
      if (role === "user") {
        // swap the optimistic user message id for the real DB id
        set({
          messages: get().messages.map((m) => (m.role === "user" && m.id.startsWith("u-") ? { ...m, id } : m)),
        });
        break;
      }
      set({
        messages: get().messages.map((m) =>
          m.streaming ? { ...m, content, streaming: true, ...(reasoning !== undefined ? { reasoning } : {}) } : m
        ),
      });
      if (role === "assistant") {
        // swap the temp id of the FIRST streaming message for the real DB id
        const idx = get().messages.findIndex((m) => m.streaming);
        if (idx !== -1) {
          const msgs = [...get().messages];
          msgs[idx] = { ...msgs[idx], id };
          set({ messages: msgs });
        }
      }
      break;
    }
    case "tool_call": {
      const id = ev.id as string;
      const tool = ev.tool as string;
      const args = ev.args as Record<string, unknown>;
      const requiresApproval = ev.requiresApproval as boolean;
      // finalize current streaming assistant message
      const msgs = get().messages.map((m) => (m.streaming ? { ...m, streaming: false } : m));
      const targetId = `tool-${id}`;
      const existing = msgs.find((m) => m.id === targetId);
      if (existing) {
        // same tool message re-emitted (e.g. approval resume) — update in place
        set({
          messages: msgs.map((m) =>
            m.id === targetId
              ? { ...m, toolStatus: requiresApproval ? "pending" : "running", toolArgs: JSON.stringify(args, null, 2) }
              : m
          ),
        });
      } else {
        const toolMsg: UiMessage = {
          id: targetId,
          role: "tool",
          content: "",
          toolName: tool,
          toolStatus: requiresApproval ? "pending" : "running",
          toolArgs: JSON.stringify(args, null, 2),
        };
        set({ messages: [...msgs, toolMsg] });
      }
      break;
    }
    case "approval_required": {
      const approvalId = ev.approvalId as string;
      const tool = ev.tool as string;
      const args = ev.args as Record<string, unknown>;
      set({ pendingApproval: { id: approvalId, tool, args } });
      break;
    }
    case "user_question": {
      const questionId = ev.questionId as string;
      const payload = ev.payload as PendingQuestion["payload"];
      set({ pendingQuestion: { id: questionId, payload } });
      break;
    }
    case "tool_result": {
      const id = ev.id as string;
      const tool = ev.tool as string;
      const ok = ev.ok as boolean;
      const output = ev.output as string;
      const diff = ev.diff as string | undefined;
      const filePath = ev.filePath as string | undefined;
      const changesetId = ev.changesetId as string | undefined;
      const latencyMs = ev.latencyMs as number;
      const targetId = `tool-${id}`;
      const exists = get().messages.some((m) => m.id === targetId);
      if (exists) {
        set({
          messages: get().messages.map((m) =>
            m.id === targetId
              ? {
                  ...m,
                  toolStatus: ok ? "success" : "error",
                  toolResult: output,
                  diff,
                  filePath,
                  changesetId,
                  latencyMs,
                }
              : m
          ),
        });
      } else {
        set({
          messages: [
            ...get().messages,
            {
              id: targetId,
              role: "tool" as const,
              content: "",
              toolName: tool,
              toolStatus: ok ? "success" : "error",
              toolArgs: JSON.stringify({}, null, 2),
              toolResult: output,
              diff,
              filePath,
              changesetId,
              latencyMs,
            },
          ],
        });
      }
      // start a new streaming assistant message for the continued turn
      set({
        messages: [
          ...get().messages,
          {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: "assistant" as const,
            content: "",
            streaming: true,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      break;
    }
    case "usage": {
      const promptTokens = ev.promptTokens as number;
      const completionTokens = ev.completionTokens as number;
      const totalTokens = ev.totalTokens as number;
      const estCost = ev.estCost as number;
      const contextPct = ev.contextPct as number;
      const cs = get().currentSession;
      if (cs) {
        set({
          currentSession: {
            ...cs,
            promptTokens: cs.promptTokens + promptTokens,
            completionTokens: cs.completionTokens + completionTokens,
            totalTokens: cs.totalTokens + totalTokens,
            estCost: cs.estCost + estCost,
          },
          contextPct,
        });
      }
      break;
    }
    case "compaction": {
      set({ toast: `context compacted: ${ev.droppedMessages} older messages trimmed` });
      break;
    }
    case "done": {
      const msgs = get().messages;
      const lastStreaming = [...msgs].reverse().find((m) => m.streaming);
      if (lastStreaming && !lastStreaming.content.trim() && msgs.filter((m) => m.streaming).length === 1) {
        // empty trailing streaming message (e.g. tool-only continuation that ended) — drop it
        set({ messages: msgs.filter((m) => m !== lastStreaming) });
      } else {
        set({ messages: msgs.map((m) => ({ ...m, streaming: false, thinkingLive: false })) });
      }
      break;
    }
    case "error": {
      const message = ev.message as string;
      set({ toast: `agent error: ${message}` });
      set({
        messages: get().messages.map((m) =>
          m.streaming
            ? { ...m, streaming: false, content: m.content || `⚠️ ${message}` }
            : m
        ),
      });
      break;
    }
    default:
      break;
  }
}

export interface ProviderRow {
  provider: string;
  label: string;
  description: string;
  needsBaseUrl?: boolean;
  defaultBaseUrl?: string | null;
  baseUrl?: string | null;
  maskedKey: string | null;
  configuredAt: string | null;
}

export { TOOL_ICONS };
