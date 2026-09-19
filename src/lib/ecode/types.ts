// Ecode shared types

export type ChatRole = "user" | "assistant" | "tool";

export type SessionMode = "manual" | "auto" | "yolo";
export type AgentMode = "build" | "plan";
export type ThinkingLevel = "off" | "think" | "ultrathink";

export const THINKING_LEVELS: { id: ThinkingLevel; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Fastest — no reasoning pass" },
  { id: "think", label: "Think", hint: "Balanced reasoning before answering" },
  { id: "ultrathink", label: "UltraThink", hint: "Maximum reasoning effort" },
];

export interface UserQuestionPayload {
  question: string;
  options?: { label: string; description?: string }[];
  allowFreeText?: boolean;
}

export interface UserQuestionAnswer {
  selected?: string;
  text?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  diff?: string;
  filePath?: string;
  changesetId?: string;
  latencyMs: number;
  error?: string;
}

export type ToolName =
  | "file_read"
  | "file_list"
  | "file_write"
  | "file_delete"
  | "shell"
  | "grep_search"
  | "ask_user";

// SSE events emitted by the agent loop
export type AgentEvent =
  | { type: "llm_start"; provider: string; model: string; thinking: ThinkingLevel; agentMode: AgentMode }
  | { type: "provider_fallback"; from: string; to: string; reason: string }
  | { type: "thinking_start" }
  | { type: "thinking_token"; content: string }
  | { type: "thinking_end" }
  | { type: "token"; content: string }
  | { type: "message_saved"; id: string; role: string; content: string; reasoning?: string }
  | {
      type: "tool_call";
      id: string;
      tool: string;
      args: Record<string, unknown>;
      requiresApproval: boolean;
    }
  | { type: "approval_required"; approvalId: string; tool: string; args: Record<string, unknown> }
  | { type: "user_question"; questionId: string; payload: UserQuestionPayload }
  | {
      type: "tool_result";
      id: string;
      tool: string;
      ok: boolean;
      output: string;
      diff?: string;
      filePath?: string;
      changesetId?: string;
      latencyMs: number;
    }
  | {
      type: "usage";
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      estCost: number;
      sessionTotalTokens: number;
      contextPct: number;
    }
  | { type: "compaction"; droppedMessages: number }
  | { type: "done"; reason?: string }
  | { type: "error"; message: string };

export interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LlmTurnResult {
  content: string;
  reasoning?: string;
  usage: LlmUsage | null;
  provider: string;
  model: string;
}
