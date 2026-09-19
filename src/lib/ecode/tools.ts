import * as fs from "fs";
import * as path from "path";
import { db } from "@/lib/db";
import { resolveInWorkspace, checkShellCommand, runShell, clip } from "./sandbox";
import { toUnifiedDiff } from "./diff";
import type { ToolCall, ToolResult } from "./types";

const MAX_READ = 60_000;

export function parseToolCall(text: string): ToolCall | null {
  // Strict form: complete <ecode-tool>...</ecode-tool> block
  const match = text.match(/<ecode-tool>\s*([\s\S]*?)\s*<\/?ecode-tool>/);
  if (match) {
    const parsed = tryParseToolJson(match[1]);
    if (parsed) return parsed;
  }
  // Lenient fallback: models occasionally emit a malformed closing tag.
  // Find the opening tag and brace-match the JSON object that follows.
  const openIdx = text.indexOf("<ecode-tool>");
  if (openIdx === -1) return null;
  const after = text.slice(openIdx + "<ecode-tool>".length);
  const json = extractJsonObject(after);
  if (json) return tryParseToolJson(json);
  return null;
}

function tryParseToolJson(raw: string): ToolCall | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string" && parsed.arguments && typeof parsed.arguments === "object") {
      return { name: parsed.name, args: parsed.arguments as Record<string, unknown> };
    }
  } catch {
    /* malformed JSON — fall through */
  }
  return null;
}

/** Extract the first complete top-level {...} object via brace matching. */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unterminated — stream still in progress or malformed
}

/** Strip the tool block (or any trailing unterminated block start) from displayed text. */
export function stripToolBlock(text: string): string {
  return text
    .replace(/<ecode-tool>[\s\S]*?<\/?ecode-tool>/g, "")
    .replace(/<ecode-tool>[\s\S]*$/g, "") // malformed/unterminated trailing block
    .trimEnd();
}

export function requiresApproval(tool: string, mode: "manual" | "auto" | "yolo"): boolean {
  if (mode !== "manual") return false;
  return tool === "file_write" || tool === "file_delete" || tool === "shell";
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : "";
}

async function recordChangeset(
  sessionId: string,
  filePath: string,
  action: string,
  oldContent: string | null,
  newContent: string | null,
  diff: string
): Promise<string> {
  const cs = await db.changeset.create({
    data: {
      sessionId,
      filePath,
      action,
      diff,
      oldContent,
      newContent,
      status: "applied",
    },
  });
  return cs.id;
}

export async function executeTool(
  sessionId: string,
  workspace: string,
  call: ToolCall,
  agentMode: "build" | "plan" = "build"
): Promise<ToolResult> {
  const started = Date.now();
  const done = (r: Partial<ToolResult>): ToolResult => ({
    ok: false,
    output: "",
    latencyMs: Date.now() - started,
    ...r,
  });

  // Engine-level plan mode guard: only read-only tools pass through.
  if (agentMode === "plan" && (call.name === "file_write" || call.name === "file_delete" || call.name === "shell")) {
    return done({ output: "blocked in plan mode — only read-only tools are available" });
  }

  switch (call.name) {
    case "file_list": {
      const guard = resolveInWorkspace(workspace, str(call.args, "path") || ".");
      if (!guard.ok) return done({ output: guard.reason ?? "invalid path" });
      const dir = guard.abs!;
      const walk = (d: string, depth: number): string[] => {
        if (depth > 3) return [];
        const SKIP = new Set(["node_modules", ".git", "__pycache__", ".next", "dist", "target"]);
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(d, { withFileTypes: true });
        } catch {
          return [];
        }
        const out: string[] = [];
        for (const e of entries) {
          const rel = path.relative(workspace, path.join(d, e.name));
          if (e.isDirectory()) {
            out.push(rel + "/");
            if (!SKIP.has(e.name)) out.push(...walk(path.join(d, e.name), depth + 1));
          } else {
            out.push(rel);
          }
        }
        return out;
      };
      const files = walk(dir, 0);
      return done({ ok: true, output: files.length ? files.join("\n") : "(empty directory)" });
    }

    case "file_read": {
      const guard = resolveInWorkspace(workspace, str(call.args, "path"));
      if (!guard.ok) return done({ output: guard.reason ?? "invalid path" });
      try {
        const stat = fs.statSync(guard.abs!);
        if (stat.isDirectory()) return done({ output: "path is a directory (use file_list)" });
        if (stat.size > MAX_READ) {
          return done({ output: `file too large to read (${stat.size} bytes > ${MAX_READ})` });
        }
        const content = fs.readFileSync(guard.abs!, "utf-8");
        return done({ ok: true, output: clip(content) });
      } catch (e) {
        return done({ output: `cannot read file: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    case "file_write": {
      const guard = resolveInWorkspace(workspace, str(call.args, "path"));
      if (!guard.ok) return done({ output: guard.reason ?? "invalid path" });
      const content = str(call.args, "content");
      if (typeof call.args.content !== "string") {
        return done({ output: "file_write requires string 'content' argument" });
      }
      let oldContent: string | null = null;
      try {
        oldContent = fs.readFileSync(guard.abs!, "utf-8");
      } catch {
        oldContent = null;
      }
      try {
        fs.mkdirSync(path.dirname(guard.abs!), { recursive: true });
        fs.writeFileSync(guard.abs!, content, "utf-8");
      } catch (e) {
        return done({ output: `cannot write file: ${e instanceof Error ? e.message : String(e)}` });
      }
      const rel = path.relative(workspace, guard.abs!);
      const diff = toUnifiedDiff(rel, oldContent ?? "", content);
      const changesetId = await recordChangeset(sessionId, rel, "write", oldContent, content, diff);
      const note = oldContent ? "updated" : "created";
      return done({
        ok: true,
        output: `file ${note}: ${rel}`,
        diff,
        filePath: rel,
        changesetId,
      });
    }

    case "file_delete": {
      const guard = resolveInWorkspace(workspace, str(call.args, "path"));
      if (!guard.ok) return done({ output: guard.reason ?? "invalid path" });
      let oldContent: string | null = null;
      try {
        oldContent = fs.readFileSync(guard.abs!, "utf-8");
      } catch {
        oldContent = null;
      }
      try {
        fs.unlinkSync(guard.abs!);
      } catch (e) {
        return done({ output: `cannot delete file: ${e instanceof Error ? e.message : String(e)}` });
      }
      const rel = path.relative(workspace, guard.abs!);
      const diff = toUnifiedDiff(rel, oldContent ?? "", "");
      const changesetId = await recordChangeset(sessionId, rel, "delete", oldContent, null, diff);
      return done({ ok: true, output: `file deleted: ${rel}`, diff, filePath: rel, changesetId });
    }

    case "shell": {
      const command = str(call.args, "command");
      const guard = checkShellCommand(command);
      if (!guard.ok) return done({ output: guard.reason ?? "command blocked" });
      const res = await runShell(workspace, command);
      let output = "";
      if (res.stdout) output += res.stdout;
      if (res.stderr) output += (output ? "\n" : "") + res.stderr;
      if (res.timedOut) output += "\n[process timed out and was killed]";
      if (!output.trim()) output = "(no output)";
      return done({ ok: res.ok && !res.timedOut, output: clip(output) });
    }

    case "grep_search": {
      const pattern = str(call.args, "pattern");
      if (!pattern) return done({ output: "pattern is required" });
      const guard = resolveInWorkspace(workspace, str(call.args, "path") || ".");
      if (!guard.ok) return done({ output: guard.reason ?? "invalid path" });
      let regex: RegExp;
      try {
        regex = new RegExp(pattern);
      } catch {
        return done({ output: `invalid regex: ${pattern}` });
      }
      const matches: string[] = [];
      const walk = (d: string) => {
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(d, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const full = path.join(d, e.name);
          const rel = path.relative(workspace, full);
          if (e.isDirectory()) {
            if (!["node_modules", ".git", "__pycache__", ".next"].includes(e.name)) walk(full);
          } else {
            try {
              const stat = fs.statSync(full);
              if (stat.size > 512 * 1024) continue;
              const content = fs.readFileSync(full, "utf-8");
              const lines = content.split("\n");
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  matches.push(`${rel}:${i + 1}: ${lines[i].slice(0, 200)}`);
                  if (matches.length >= 50) return;
                }
              }
            } catch {
              /* binary or unreadable */
            }
          }
        }
      };
      walk(guard.abs!);
      return done({
        ok: true,
        output: matches.length ? matches.join("\n") : "no matches",
      });
    }

    case "ask_user": {
      // Handled by the agent loop before execution — reaching this branch
      // means a resume path executed it directly, which should not happen.
      return done({ output: "ask_user must pause the agent loop, not execute" });
    }

    default:
      return done({ output: `unknown tool: ${call.name}` });
  }
}
