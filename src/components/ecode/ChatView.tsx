"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ArrowDown, ArrowUp, Brain, ChevronDown, ChevronRight, Loader2, MessageCircleQuestion, Send, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEcode } from "@/lib/ecode/store";
import { ToolTrace, ApprovalBanner } from "./ToolTrace";
import { ModelIcon, modelLabelFor } from "./ProviderIcon";

function fmtTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code(props: ComponentPropsWithoutRef<"code">) {
          const { className, children, ...rest } = props;
          const match = /language-(\w+)/.exec(className ?? "");
          const text = String(children).replace(/\n$/, "");
          if (!match) {
            return (
              <code className="rounded border border-stone-800 bg-stone-900 px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--hi)]" {...rest}>
                {children}
              </code>
            );
          }
          return (
            <SyntaxHighlighter
              style={oneDark}
              language={match[1]}
              PreTag="div"
              customStyle={{ background: "#0e0d0b", border: "1px solid #292524", borderRadius: "0.375rem", fontSize: "11.5px" }}
            >
              {text}
            </SyntaxHighlighter>
          );
        },
        p(props: ComponentPropsWithoutRef<"p">) {
          const { children, ...rest } = props;
          return (
            <p className="max-w-[75ch] leading-relaxed whitespace-pre-wrap" {...rest}>
              {children}
            </p>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── USER — right side, bubble only. No avatar, no name, no chrome. ───────────
function UserMessage({ content, createdAt }: { content: string; createdAt?: string }) {
  return (
    <div className="group/msg flex justify-end">
      <div className="flex max-w-[min(85%,68ch)] flex-col items-end">
        <div className="rounded-lg rounded-br-sm border border-[color-mix(in_oklab,var(--hi)_25%,transparent)] bg-[color-mix(in_oklab,var(--hi)_10%,transparent)] px-4 py-2.5 text-sm whitespace-pre-wrap break-words text-stone-100">
          {content}
        </div>
        {createdAt && <span className="ec-time mt-1 pr-1 font-mono text-[10px] text-stone-600">{fmtTime(createdAt)}</span>}
      </div>
    </div>
  );
}

// ─── AI — left side, the model's own face + a detailed meta header. ───────────
function AssistantMessage({
  content,
  streaming,
  reasoning,
  thinkingLive,
  model,
  provider,
  createdAt,
}: {
  content: string;
  streaming?: boolean;
  reasoning?: string | null;
  thinkingLive?: boolean;
  model: string;
  provider: string;
  createdAt?: string;
}) {
  // strip a completed block, a malformed-close block, or a trailing unterminated one
  const stripped = content
    .replace(/<ecode-tool>[\s\S]*?<\/?ecode-tool>/g, "")
    .replace(/<ecode-tool>[\s\S]*$/g, "")
    .trim();
  const hasReasoning = Boolean(reasoning && reasoning.trim());
  const showThinkingPlaceholder = streaming && !stripped && thinkingLive;
  // nothing to show yet (optimistic placeholder from approval/question resume)
  if (!stripped && !hasReasoning && !streaming) return null;
  return (
    <div className="group/msg flex gap-3">
      {/* the AI's own icon — Claude for claude, Gemini for gemini, stealth mask for stealth… */}
      <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-800 bg-stone-900">
        <ModelIcon provider={provider} model={model} size={17} />
        {streaming && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-stone-950 bg-[var(--hi)]" />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {/* detailed meta header — who is answering, when */}
        <div className="flex items-baseline gap-2">
          <span className="text-[12.5px] font-semibold tracking-tight text-stone-100">{modelLabelFor(model)}</span>
          {createdAt && <span className="ec-time font-mono text-[10px] text-stone-600">{fmtTime(createdAt)}</span>}
          {streaming && <span className="font-mono text-[10px] text-[var(--hi)]/80">· generating</span>}
        </div>
        {hasReasoning && <ThinkingBlock text={reasoning!} live={thinkingLive} />}
        {showThinkingPlaceholder ? null : stripped ? (
          <div className="space-y-2 text-sm text-stone-300 [&_p]:!my-0 [&_pre]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_a]:text-[var(--hi)] [&_a]:underline [&_a]:decoration-[color-mix(in_oklab,var(--hi)_40%,transparent)]">
            <Markdown content={stripped} />
            {streaming ? <span className="ec-cursor ml-0.5 inline-block h-3.5 w-2 align-middle bg-[var(--hi)]" /> : null}
          </div>
        ) : streaming ? (
          <span className="inline-flex items-center gap-2 text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-mono text-xs">thinking…</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Reasoning block. While live it shimmers and auto-scrolls; when the answer
 * starts it KEEPS SHOWING — header switches to "Thought", the body clamps to
 * a max-height with its own thin scroll. It never auto-hides.
 */
function ThinkingBlock({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(true);
  const [mountedLive] = useState(live ?? false);
  const bodyRef = useRef<HTMLDivElement>(null);
  // track seconds while thinking is live
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  // keep the live tail visible
  useEffect(() => {
    if (live && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [text, live]);

  return (
    <div className="overflow-hidden rounded-md border border-stone-800 bg-stone-900/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-stone-900/80"
        onClick={() => setOpen(!open)}
      >
        <Brain className={`h-3 w-3 shrink-0 ${live ? "text-[var(--hi)]" : "text-stone-500"}`} />
        {live ? (
          <span className="bg-[linear-gradient(110deg,var(--hi)_20%,#d6d3d1_40%,var(--hi)_60%)] bg-[length:200%_100%] bg-clip-text font-mono text-[11px] text-transparent [animation:shimmer_2s_linear_infinite]">
            thinking… {secs}s
          </span>
        ) : (
          <span className="font-mono text-[11px] text-stone-400">
            thought{secs > 0 ? ` · ${secs}s` : ""} · kept visible
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-stone-600">{text.length.toLocaleString()} ch</span>
        <span className="text-stone-500">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div className="border-t border-stone-800/70 px-3 py-2">
          <div
            ref={bodyRef}
            className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-stone-400"
          >
            {text}
            {live && <span className="ec-cursor ml-0.5 inline-block h-3 w-1.5 bg-[var(--hi)] align-middle" />}
          </div>
        </div>
      )}
      {mountedLive && !live && null /* transition marker — body remains mounted */}
    </div>
  );
}

// AskUserQuestion card — options + free text, answers resume the agent.
function QuestionCard({
  question,
  onAnswer,
  busy,
}: {
  question: { question: string; options?: { label: string; description?: string }[]; allowFreeText?: boolean };
  onAnswer: (answer: { selected?: string; text?: string }) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState("");
  const allowText = question.allowFreeText !== false;
  const submit = (answer: { selected?: string; text?: string }) => {
    if (busy) return;
    onAnswer(answer);
  };
  return (
    <div className="rounded-lg border border-[color-mix(in_oklab,var(--hi)_40%,transparent)] bg-[color-mix(in_oklab,var(--hi)_5%,transparent)] p-3.5">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hi)]" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-100">{question.question}</div>
          {question.options && question.options.length > 0 && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {question.options.map((opt, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => submit({ selected: opt.label })}
                  className="group rounded-md border border-stone-800 bg-stone-900/80 px-3 py-2 text-left transition-colors hover:border-[color-mix(in_oklab,var(--hi)_50%,transparent)] hover:bg-[color-mix(in_oklab,var(--hi)_8%,transparent)] disabled:opacity-50"
                >
                  <div className="text-[13px] font-medium text-stone-200 group-hover:text-stone-100">{opt.label}</div>
                  {opt.description && <div className="mt-0.5 text-[11px] leading-snug text-stone-500">{opt.description}</div>}
                </button>
              ))}
            </div>
          )}
          {allowText && (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    e.preventDefault();
                    submit({ text: draft.trim() });
                  }
                }}
                placeholder="type your answer…"
                disabled={busy}
                className="flex-1 rounded-md border border-stone-800 bg-stone-900 px-3 py-1.5 text-sm text-stone-200 placeholder:text-stone-600 outline-none focus:border-[color-mix(in_oklab,var(--hi)_50%,transparent)]"
              />
              <Button
                size="icon"
                disabled={!draft.trim() || busy}
                onClick={() => submit({ text: draft.trim() })}
                className="h-8 w-8 shrink-0 rounded-md bg-stone-700 text-stone-100 hover:bg-[var(--hi)] hover:text-[var(--hi-ink)]"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatView() {
  const {
    messages, pendingApproval, pendingQuestion, sendMessage, decideApproval, answerQuestion, isStreaming,
    currentSession, updateSession, undo, redo, fromCli, contextPct,
  } = useEcode();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // stick-to-edge scroll (R2): follow only while the user is at the bottom
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, messages[messages.length - 1]?.content, messages[messages.length - 1]?.reasoning]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = nearBottom;
    setShowJump(!nearBottom && el.scrollHeight > el.clientHeight + 400);
  };

  const jumpToLatest = () => {
    atBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";

    // slash commands
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      if (cmd === "undo") return void undo();
      if (cmd === "redo") return void redo();
      if (cmd === "yolo" && currentSession) {
        return void updateSession(currentSession.id, { mode: arg === "on" ? "yolo" : "manual" });
      }
      if ((cmd === "plan" || cmd === "build") && currentSession) {
        return void updateSession(currentSession.id, { agentMode: cmd as "plan" | "build" });
      }
      if (cmd === "think" && currentSession) {
        const level = ["off", "think", "ultrathink"].includes(arg) ? arg : currentSession.thinking === "off" ? "think" : currentSession.thinking === "think" ? "ultrathink" : "off";
        return void updateSession(currentSession.id, { thinking: level as "off" | "think" | "ultrathink" });
      }
      if (cmd === "status" && currentSession) {
        useEcode.setState({
          messages: [
            ...useEcode.getState().messages,
            { id: `sys-${Date.now()}`, role: "user" as const, content: "/status" },
            {
              id: `sys-a-${Date.now()}`,
              role: "assistant" as const,
              content: [
                "```",
                `model      ${currentSession.provider}/${currentSession.model}`,
                `mode       ${currentSession.mode}`,
                `agent      ${currentSession.agentMode}`,
                `thinking   ${currentSession.thinking}`,
                `tokens     ${currentSession.totalTokens.toLocaleString()} total (${currentSession.promptTokens.toLocaleString()} prompt + ${currentSession.completionTokens.toLocaleString()} completion)`,
                `context    ${currentSession.contextLimit.toLocaleString()} limit`,
                `spend      $${currentSession.estCost.toFixed(4)}`,
                `messages   ${messages.length}`,
                "```",
              ].join("\n"),
            },
          ],
        });
        return;
      }
      if (cmd === "share") {
        const lines = messages
          .filter((m) => m.role !== "tool")
          .map((m) => (m.role === "user" ? `## User\n\n${m.content}` : `## Ecode\n\n${m.content.replace(/<ecode-tool>[\s\S]*?(<\/?ecode-tool>|$)/g, "").trim()}`));
        const blob = new Blob([`# Ecode session: ${currentSession?.title ?? "session"}\n\n${lines.join("\n\n---\n\n")}\n`], { type: "text/markdown" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `ecode-session-${currentSession?.id ?? "export"}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      }
      if (cmd === "help") {
        useEcode.setState({
          messages: [
            ...useEcode.getState().messages,
            { id: `sys-${Date.now()}`, role: "user" as const, content: "/help" },
            {
              id: `sys-a-${Date.now()}`,
              role: "assistant" as const,
              content:
                "**Commands**\n\n" +
                "- `/plan` · `/build` — toggle plan mode (read-only research & plan) vs build mode\n" +
                "- `/think [off|think|ultrathink]` — set reasoning effort; reasoning stays visible\n" +
                "- `/undo` — revert the last applied file change\n" +
                "- `/redo` — re-apply the last undone change\n" +
                "- `/yolo on|off` — toggle YOLO auto-approval mode\n" +
                "- `/status` — session status card\n" +
                "- `/share` — export the transcript as markdown\n" +
                "- `/help` — this message",
            },
          ],
        });
        return;
      }
    }
    await sendMessage(text);
  };

  const planMode = currentSession?.agentMode === "plan";
  const provider = currentSession?.provider ?? "openrouter";
  const model = currentSession?.model ?? "openrouter/auto";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="ec-scroll relative flex-1 overflow-y-auto">
        {/* Plan mode banner */}
        {planMode && (
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-amber-500/25 bg-amber-500/[0.06] px-[var(--chat-pad-x)] py-1.5 backdrop-blur">
            <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">plan mode</span>
            <span className="text-[11.5px] text-amber-200/80">read-only — researching and planning, no file changes</span>
            <button
              className="ml-auto shrink-0 font-mono text-[10.5px] text-stone-400 transition-colors hover:text-[var(--hi)]"
              onClick={() => currentSession && updateSession(currentSession.id, { agentMode: "build" })}
            >
              switch to build →
            </button>
          </div>
        )}
        {/* terminal badge when launched via `ecode` CLI */}
        {fromCli && (
          <div className="flex items-center justify-center gap-1.5 pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-800 bg-stone-900/60 px-2.5 py-0.5 font-mono text-[10px] text-stone-500">
              <Terminal className="h-3 w-3 text-[var(--hi)]/80" /> launched via <span className="text-[var(--hi)]">ecode</span> cli
            </span>
          </div>
        )}

        {/* full-width thread — no centering, no max-w cap on the container.
            Prose is capped at 75ch inside Markdown; code and traces use the
            full width. */}
        <div className="space-y-[var(--chat-gap)] px-[var(--chat-pad-x)] py-6">
          {messages.map((m) => {
            if (m.role === "user") return <UserMessage key={m.id} content={m.content} createdAt={m.createdAt} />;
            // tool traces line up under the assistant's content column (icon width + gap)
            if (m.role === "tool")
              return (
                <div key={m.id} className="pl-11">
                  <ToolTrace msg={m} />
                </div>
              );
            return (
              <AssistantMessage
                key={m.id}
                content={m.content}
                streaming={m.streaming}
                reasoning={m.reasoning}
                thinkingLive={m.thinkingLive}
                model={model}
                provider={provider}
                createdAt={m.createdAt}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* jump to latest */}
        {showJump && (
          <button
            onClick={jumpToLatest}
            className="sticky bottom-4 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900/95 px-3 font-mono text-[10px] text-stone-300 shadow-lg backdrop-blur"
          >
            <ArrowDown className="h-3 w-3" /> latest
          </button>
        )}
      </div>

      <div className="border-t border-stone-800/60 bg-stone-950/90 px-[var(--chat-pad-x)] py-2.5">
        <div className="space-y-2">
          {pendingQuestion && (
            <QuestionCard
              question={pendingQuestion.payload as { question: string; options?: { label: string; description?: string }[]; allowFreeText?: boolean }}
              onAnswer={(answer) => void answerQuestion(pendingQuestion.id, answer)}
              busy={isStreaming}
            />
          )}
          {pendingApproval && (
            <ApprovalBanner
              tool={pendingApproval.tool}
              args={pendingApproval.args}
              onDecide={(d) => decideApproval(pendingApproval.id, d)}
              busy={isStreaming}
            />
          )}
          <div className="flex items-end gap-2 rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2 transition-colors focus-within:border-[color-mix(in_oklab,var(--hi)_50%,transparent)]">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(160, e.target.scrollHeight) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              placeholder={
                pendingQuestion
                  ? "answer the question above to continue…"
                  : isStreaming
                    ? "agent is running…"
                    : planMode
                      ? "ask ecode to research & plan…"
                      : "ask ecode to build something…"
              }
              className="max-h-40 flex-1 resize-none bg-transparent text-sm text-stone-200 placeholder:text-stone-600 outline-none"
              disabled={isStreaming}
            />
            <Button
              size="icon"
              onClick={() => void submit()}
              disabled={!draft.trim() || isStreaming}
              className="h-7 w-7 shrink-0 rounded-md bg-stone-700 text-stone-100 hover:bg-[var(--hi)] hover:text-[var(--hi-ink)]"
            >
              {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {/* status modeline — vim-style: always tells you what state you're in */}
          <div className="flex items-center justify-between gap-3 overflow-x-auto font-mono text-[10px] whitespace-nowrap text-stone-600">
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--hi)]/70">--</span>
              {planMode ? "PLAN" : "BUILD"}
              <span className="text-stone-700">·</span>
              {currentSession?.mode === "yolo" ? (
                <span className="text-red-400/80">yolo</span>
              ) : (
                (currentSession?.mode ?? "manual")
              )}
              <span className="text-stone-700">·</span>
              {model}
              <span className="text-stone-700">·</span>
              {contextPct > 0 || currentSession?.totalTokens ? `${contextPct || 0}% ctx` : "0% ctx"}
              <span className="text-stone-700">·</span>
              ${((currentSession?.estCost ?? 0)).toFixed(4)}
              <span className="text-[var(--hi)]/70">--</span>
            </span>
            <span className="hidden shrink-0 sm:inline">enter send · shift+enter newline · ctrl+b sidebar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
