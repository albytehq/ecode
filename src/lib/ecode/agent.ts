import { db } from "@/lib/db";
import { callLlm, type LlmMessage } from "./llm";
import { buildEcodeSystemPrompt, formatToolResultForLlm, parseUserQuestion } from "./prompt";
import { parseToolCall, executeTool, requiresApproval } from "./tools";
import { estimateCost, MAX_AGENT_ITERATIONS, getModel } from "./constants";
import { findCatalogModel } from "./catalog";
import { audit } from "./audit";
import { createWorkspace, workspaceExists } from "./workspace";
import type { AgentEvent, AgentMode, ThinkingLevel } from "./types";

export type Emit = (event: AgentEvent) => void;

interface DbSession {
  id: string;
  title: string;
  provider: string;
  model: string;
  mode: string;
  agentMode: string;
  thinking: string;
  workspace: string;
  contextLimit: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estCost: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Turn {
  role: "user" | "assistant" | "tool";
  content: string;
}

/**
 * Build the message array sent to the LLM, with automatic context compaction
 * when the estimated context exceeds 80% of the session limit.
 */
function buildLlmMessages(
  systemPrompt: string,
  turns: Turn[],
  contextLimit: number,
  emit: Emit
): LlmMessage[] {
  const messages: LlmMessage[] = [{ role: "user", content: systemPrompt }];
  let body = [...turns];

  const size = () => estimateTokens(systemPrompt) + body.reduce((s, t) => s + estimateTokens(t.content), 0);

  let dropped = 0;
  while (size() > contextLimit * 0.8 && body.length > 6) {
    const remove = Math.max(4, Math.floor(body.length / 3));
    body = body.slice(remove);
    dropped += remove;
  }
  if (dropped > 0) {
    body = [
      { role: "user", content: `[context compacted: ${dropped} older messages were summarized away to stay within the context window]` },
      ...body,
    ];
    emit({ type: "compaction", droppedMessages: dropped });
  }

  for (const t of body) {
    if (t.role === "user") messages.push({ role: "user", content: t.content });
    else if (t.role === "assistant") messages.push({ role: "assistant", content: t.content });
    else messages.push({ role: "user", content: t.content }); // tool results are fed back as user turns
  }
  return messages;
}

async function currentTurns(sessionId: string): Promise<Turn[]> {
  const msgs = await db.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  const turns: Turn[] = [];
  for (const m of msgs) {
    if (m.role === "user") {
      turns.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      turns.push({ role: "assistant", content: m.content });
    } else if (m.role === "tool") {
      const denied = m.toolStatus === "denied";
      turns.push({
        role: "tool",
        content: formatToolResultForLlm(m.toolName ?? "tool", m.toolStatus === "error", m.toolResult ?? "", denied),
      });
    }
  }
  return turns;
}

/**
 * The Ecode agent loop: stream a model response, detect tool calls, enforce
 * the permission engine, execute tools and feed results back — until the
 * model produces a final answer or an approval gate stops the stream.
 */
export async function runAgentLoop(
  sessionId: string,
  emit: Emit,
  options: {
    resumeApprovalId?: string;
    decision?: "approve" | "deny";
    resumeQuestionId?: string;
    answer?: { selected?: string; text?: string };
    /** Aborts LLM fetches when the client disconnects (reload, tab close, session switch). */
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  const session = (await db.session.findUnique({ where: { id: sessionId } })) as DbSession | null;
  if (!session) {
    emit({ type: "error", message: "session not found" });
    return;
  }
  if (!workspaceExists(session.workspace)) {
    createWorkspace(session.id);
  }

  const mode = (session.mode as "manual" | "auto" | "yolo") ?? "manual";
  const agentMode = (session.agentMode === "plan" ? "plan" : "build") as AgentMode;
  const thinking = (["off", "think", "ultrathink"].includes(session.thinking) ? session.thinking : "off") as ThinkingLevel;

  // --- Resume path: resolve a pending approval first ----------------------
  if (options.resumeApprovalId && options.decision) {
    const approval = await db.approval.findUnique({ where: { id: options.resumeApprovalId } });
    if (!approval || approval.sessionId !== sessionId || approval.status !== "pending") {
      emit({ type: "error", message: "approval not found or already decided" });
      return;
    }
    const args = JSON.parse(approval.args) as Record<string, unknown>;
    const decidedAt = new Date();
    await db.approval.update({
      where: { id: approval.id },
      data: {
        status: options.decision === "approve" ? "approved" : "denied",
        decidedAt,
      },
    });

    if (options.decision === "approve") {
      emit({ type: "tool_call", id: approval.messageId ?? approval.id, tool: approval.toolName, args, requiresApproval: false });
      const result = await executeTool(sessionId, session.workspace, { name: approval.toolName, args }, agentMode);
      await db.message.update({
        where: { id: approval.messageId ?? "___none___" },
        data: {
          toolStatus: result.ok ? "success" : "error",
          toolResult: result.output,
        },
      }).catch(() => undefined);
      emit({
        type: "tool_result",
        id: approval.messageId ?? approval.id,
        tool: approval.toolName,
        ok: result.ok,
        output: result.output,
        diff: result.diff,
        filePath: result.filePath,
        changesetId: result.changesetId,
        latencyMs: result.latencyMs,
      });
      await audit({
        sessionId,
        event: "tool_call",
        userAction: "approve",
        status: result.ok ? "success" : "error",
        detail: { tool: approval.toolName, latencyMs: result.latencyMs },
      });
    } else {
      await db.message.update({
        where: { id: approval.messageId ?? "___none___" },
        data: { toolStatus: "denied", toolResult: "Action denied by the user." },
      }).catch(() => undefined);
      emit({
        type: "tool_result",
        id: approval.messageId ?? approval.id,
        tool: approval.toolName,
        ok: false,
        output: "Action denied by the user.",
        latencyMs: 0,
      });
      await audit({
        sessionId,
        event: "approval",
        userAction: "deny",
        status: "success",
        detail: { tool: approval.toolName },
      });
    }
  }

  // --- Resume path: resolve a pending user question first -------------------
  if (options.resumeQuestionId && options.answer) {
    const q = await db.userQuestion.findUnique({ where: { id: options.resumeQuestionId } });
    if (!q || q.sessionId !== sessionId || q.status !== "pending") {
      emit({ type: "error", message: "question not found or already answered" });
      return;
    }
    await db.userQuestion.update({
      where: { id: q.id },
      data: { status: "answered", answer: JSON.stringify(options.answer), answeredAt: new Date() },
    });
    const answerText = options.answer.selected
      ? `User selected: "${options.answer.selected}"${options.answer.text ? ` (note: ${options.answer.text})` : ""}`
      : `User answered: ${options.answer.text ?? "(no answer)"}`;
    await db.message.update({
      where: { id: q.messageId ?? "___none___" },
      data: { toolStatus: "answered", toolResult: answerText },
    }).catch(() => undefined);
    emit({
      type: "tool_result",
      id: q.messageId ?? q.id,
      tool: "ask_user",
      ok: true,
      output: answerText,
      latencyMs: 0,
    });
    await audit({
      sessionId,
      event: "tool_call",
      userAction: "answer_question",
      status: "success",
      detail: { tool: "ask_user", answer: options.answer },
    });
  }

  // --- Agent iterations ------------------------------------------------------
  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    if (options.signal?.aborted) {
      emit({ type: "done", reason: "client disconnected" });
      return;
    }
    const live = (await db.session.findUnique({ where: { id: sessionId } })) as DbSession | null;
    if (!live) {
      emit({ type: "error", message: "session disappeared" });
      return;
    }
    const liveAgentMode = (live.agentMode === "plan" ? "plan" : "build") as AgentMode;
    const liveThinking = (["off", "think", "ultrathink"].includes(live.thinking) ? live.thinking : "off") as ThinkingLevel;

    // Live catalog entry first: powers the identity block and context limit.
    const catalogModel = await findCatalogModel(live.provider, live.model).catch(() => null);

    const systemPrompt = buildEcodeSystemPrompt({
      workspace: live.workspace,
      mode: (live.mode as "manual" | "auto" | "yolo") ?? "manual",
      agentMode: liveAgentMode,
      thinking: liveThinking,
      provider: live.provider,
      model: live.model,
      catalog: catalogModel
        ? {
            label: catalogModel.label,
            knowledgeCutoff: (catalogModel as unknown as { knowledgeCutoff?: string | null }).knowledgeCutoff ?? null,
            stealth: Boolean((catalogModel as unknown as { stealth?: boolean }).stealth),
          }
        : null,
    });
    const turns = await currentTurns(sessionId);
    if (turns.length === 0) {
      emit({ type: "done", reason: "empty session" });
      return;
    }

    // Context limit: prefer the live catalog's context_length
    const contextLimit = catalogModel?.contextLimit ?? live.contextLimit;

    const llmMessages = buildLlmMessages(systemPrompt, turns, contextLimit, emit);

    emit({ type: "llm_start", provider: live.provider, model: live.model, thinking: liveThinking, agentMode: liveAgentMode });

    let turn;
    try {
      turn = await callLlm({
        provider: live.provider,
        model: live.model,
        messages: llmMessages,
        thinking: liveThinking,
        signal: options.signal,
        onToken: (t) => emit({ type: "token", content: t }),
        onThinkingStart: () => emit({ type: "thinking_start" }),
        onThinking: (t) => emit({ type: "thinking_token", content: t }),
        onThinkingEnd: () => emit({ type: "thinking_end" }),
        sessionId,
        onAudit: (a) =>
          audit({
            sessionId,
            event: a.event,
            status: a.status,
            errorCode: a.errorCode,
            latencyMs: a.latencyMs,
            provider: a.provider,
            model: a.model,
            promptTokens: a.promptTokens ?? undefined,
            completionTokens: a.completionTokens ?? undefined,
            totalTokens: a.totalTokens ?? undefined,
          }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await audit({ sessionId, event: "model_request", status: "error", errorCode: message.slice(0, 200) });
      emit({ type: "error", message: `model call failed: ${message}` });
      return;
    }

    // Save the assistant message (reasoning kept separate for the thinking UI)
    const assistantMsg = await db.message.create({
      data: {
        sessionId,
        role: "assistant",
        content: turn.content,
        ...(turn.reasoning ? { reasoning: turn.reasoning } : {}),
        tokens: turn.usage?.completion_tokens ?? 0,
      },
    });
    emit({ type: "message_saved", id: assistantMsg.id, role: "assistant", content: turn.content, ...(turn.reasoning ? { reasoning: turn.reasoning } : {}) });

    // Usage + context meter
    const usage = turn.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    const costDelta = catalogModel
      ? (promptTokens / 1_000_000) * catalogModel.inputPrice + (completionTokens / 1_000_000) * catalogModel.outputPrice
      : estimateCost(live.provider, live.model, promptTokens, completionTokens);
    await db.session.update({
      where: { id: sessionId },
      data: {
        promptTokens: { increment: promptTokens },
        completionTokens: { increment: completionTokens },
        totalTokens: { increment: totalTokens },
        estCost: { increment: costDelta },
      },
    });
    const currentContext = llmMessages.reduce((s, m) => s + estimateTokens(m.content), 0);
    const modelInfo = catalogModel ?? getModel(live.provider, live.model);
    emit({
      type: "usage",
      promptTokens,
      completionTokens,
      totalTokens,
      estCost: costDelta,
      sessionTotalTokens: live.totalTokens + totalTokens,
      contextPct: Math.min(100, (currentContext / (modelInfo?.contextLimit ?? live.contextLimit)) * 100),
    });

    // Tool call detection
    const toolCall = parseToolCall(turn.content);
    if (!toolCall) {
      emit({ type: "done" });
      return;
    }
    if (options.signal?.aborted) {
      emit({ type: "done", reason: "client disconnected" });
      return;
    }

    // --- ask_user: pause the loop and surface a question card -----------------
    if (toolCall.name === "ask_user") {
      const payload = parseUserQuestion(toolCall.args);
      const toolMsg = await db.message.create({
        data: {
          sessionId,
          role: "tool",
          content: "",
          toolName: "ask_user",
          toolStatus: "pending",
          toolArgs: JSON.stringify(payload),
        },
      });
      const q = await db.userQuestion.create({
        data: {
          sessionId,
          messageId: toolMsg.id,
          question: JSON.stringify(payload),
        },
      });
      emit({ type: "tool_call", id: toolMsg.id, tool: "ask_user", args: payload as unknown as Record<string, unknown>, requiresApproval: false });
      emit({ type: "user_question", questionId: q.id, payload });
      await audit({
        sessionId,
        event: "tool_call",
        userAction: "question_asked",
        status: "success",
        detail: { tool: "ask_user", question: payload.question },
      });
      return; // stream ends; client answers via the question endpoint
    }

    // --- Plan mode engine-level guard ----------------------------------------
    if (liveAgentMode === "plan" && (toolCall.name === "file_write" || toolCall.name === "file_delete" || toolCall.name === "shell")) {
      await db.message.create({
        data: {
          sessionId,
          role: "tool",
          content: "",
          toolName: toolCall.name,
          toolStatus: "error",
          toolArgs: JSON.stringify(toolCall.args),
          toolResult: "blocked in plan mode",
        },
      });
      emit({ type: "tool_call", id: `t-${iteration}`, tool: toolCall.name, args: toolCall.args, requiresApproval: false });
      emit({ type: "tool_result", id: `t-${iteration}`, tool: toolCall.name, ok: false, output: "blocked in plan mode — read-only tools only", latencyMs: 0 });
      continue; // feed the block back so the model presents the plan
    }

    const needsApproval = requiresApproval(toolCall.name, (live.mode as "manual" | "auto" | "yolo") ?? "manual");

    if (needsApproval) {
      // Create pending tool message + approval record, then stop the stream.
      const toolMsg = await db.message.create({
        data: {
          sessionId,
          role: "tool",
          content: "",
          toolName: toolCall.name,
          toolStatus: "pending",
          toolArgs: JSON.stringify(toolCall.args),
        },
      });
      const approval = await db.approval.create({
        data: {
          sessionId,
          messageId: toolMsg.id,
          toolName: toolCall.name,
          args: JSON.stringify(toolCall.args),
        },
      });
      emit({
        type: "tool_call",
        id: toolMsg.id,
        tool: toolCall.name,
        args: toolCall.args,
        requiresApproval: true,
      });
      emit({ type: "approval_required", approvalId: approval.id, tool: toolCall.name, args: toolCall.args });
      await audit({
        sessionId,
        event: "approval",
        userAction: "approval_requested",
        status: "success",
        detail: { tool: toolCall.name, args: toolCall.args },
      });
      return; // stream ends; client resumes via the approval endpoint
    }

    // Execute directly (auto / yolo mode, or read-only tools)
    emit({ type: "tool_call", id: `t-${iteration}`, tool: toolCall.name, args: toolCall.args, requiresApproval: false });
    const result = await executeTool(sessionId, live.workspace, toolCall, liveAgentMode);
    await db.message.create({
      data: {
        sessionId,
        role: "tool",
        content: "",
        toolName: toolCall.name,
        toolStatus: result.ok ? "success" : "error",
        toolArgs: JSON.stringify(toolCall.args),
        toolResult: result.output,
        latencyMs: result.latencyMs,
      },
    });
    emit({
      type: "tool_result",
      id: `t-${iteration}`,
      tool: toolCall.name,
      ok: result.ok,
      output: result.output,
      diff: result.diff,
      filePath: result.filePath,
      changesetId: result.changesetId,
      latencyMs: result.latencyMs,
    });
    await audit({
      sessionId,
      event: "tool_call",
      status: result.ok ? "success" : "error",
      detail: { tool: toolCall.name, latencyMs: result.latencyMs, args: toolCall.args },
    });
    // loop continues — the tool result is now part of the conversation
  }

  emit({ type: "done", reason: "max iterations reached" });
}

/** Undo the most recent applied changeset. */
export async function undoLastChangeset(sessionId: string) {
  const cs = await db.changeset.findFirst({
    where: { sessionId, status: "applied" },
    orderBy: { createdAt: "desc" },
  });
  if (!cs) return { ok: false, message: "nothing to undo" };
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false, message: "session not found" };
  const abs = `${session.workspace}/${cs.filePath}`;
  const fs = await import("fs");
  try {
    if (cs.action === "write") {
      if (cs.oldContent === null) {
        fs.unlinkSync(abs); // file was created → remove it
      } else {
        fs.writeFileSync(abs, cs.oldContent, "utf-8");
      }
    } else if (cs.action === "delete" && cs.oldContent !== null) {
      fs.writeFileSync(abs, cs.oldContent, "utf-8");
    }
  } catch (e) {
    return { ok: false, message: `undo failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  await db.changeset.update({ where: { id: cs.id }, data: { status: "undone" } });
  await audit({ sessionId, event: "diff_apply", userAction: "undo", status: "success", detail: { filePath: cs.filePath } });
  return { ok: true, message: `undone: ${cs.filePath}`, filePath: cs.filePath };
}

/** Redo the most recently undone changeset. */
export async function redoLastChangeset(sessionId: string) {
  const cs = await db.changeset.findFirst({
    where: { sessionId, status: "undone" },
    orderBy: { createdAt: "desc" },
  });
  if (!cs) return { ok: false, message: "nothing to redo" };
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false, message: "session not found" };
  const abs = `${session.workspace}/${cs.filePath}`;
  const fs = await import("fs");
  try {
    if (cs.action === "write") {
      if (cs.newContent === null) {
        fs.unlinkSync(abs);
      } else {
        fs.writeFileSync(abs, cs.newContent, "utf-8");
      }
    } else if (cs.action === "delete") {
      fs.unlinkSync(abs);
    }
  } catch (e) {
    return { ok: false, message: `redo failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  await db.changeset.update({ where: { id: cs.id }, data: { status: "applied" } });
  await audit({ sessionId, event: "diff_apply", userAction: "redo", status: "success", detail: { filePath: cs.filePath } });
  return { ok: true, message: `re-applied: ${cs.filePath}`, filePath: cs.filePath };
}
