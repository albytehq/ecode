import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { SHELL_DENY_PATTERNS, SHELL_TIMEOUT_MS, MAX_TOOL_OUTPUT } from "./constants";

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * Resolve a workspace-relative or absolute path and verify it stays inside the
 * workspace. Blocks traversal via "..", symlinks that escape, and absolute
 * paths pointing outside the sandbox.
 */
export function resolveInWorkspace(workspace: string, relPath: string): GuardResult & { abs?: string } {
  if (!relPath || typeof relPath !== "string") {
    return { ok: false, reason: "path is required" };
  }
  const wsRoot = path.resolve(workspace);
  let abs: string;
  if (path.isAbsolute(relPath)) {
    abs = path.resolve(relPath);
  } else {
    abs = path.resolve(wsRoot, relPath);
  }
  if (abs !== wsRoot && !abs.startsWith(wsRoot + path.sep)) {
    return { ok: false, reason: `path escapes workspace sandbox: ${relPath}` };
  }
  // symlink containment check
  let current = abs;
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;
    try {
      const real = fs.realpathSync(current);
      if (real !== current && real !== wsRoot && !real.startsWith(wsRoot + path.sep)) {
        return { ok: false, reason: `symlink escapes workspace sandbox: ${relPath}` };
      }
      current = parent;
    } catch {
      current = parent; // path may not exist yet
    }
    if (current === wsRoot || current === "/") break;
  }
  return { ok: true, abs };
}

export function checkShellCommand(command: string): GuardResult {
  if (!command || typeof command !== "string" || !command.trim()) {
    return { ok: false, reason: "command is required" };
  }
  for (const { pattern, reason } of SHELL_DENY_PATTERNS) {
    if (pattern.test(command)) {
      return { ok: false, reason: `Blocked by deny rule: ${reason}` };
    }
  }
  return { ok: true };
}

export function runShell(
  workspace: string,
  command: string
): Promise<{ ok: boolean; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: workspace,
        timeout: SHELL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          HOME: workspace,
          ECODE: "1",
          ECODE_WORKSPACE: workspace,
        },
      },
      (error, stdout, stderr) => {
        const timedOut = Boolean(error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed);
        resolve({
          ok: !error,
          stdout: clip(stdout?.toString() ?? ""),
          stderr: clip(stderr?.toString() ?? ""),
          timedOut,
        });
      }
    );
  });
}

export function clip(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) return text;
  return text.slice(0, MAX_TOOL_OUTPUT) + `\n... [output clipped at ${MAX_TOOL_OUTPUT} chars]`;
}
