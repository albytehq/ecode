import * as fs from "fs";
import * as path from "path";
import { WORKSPACES_ROOT } from "./constants";

export function ensureWorkspaceRoot(): void {
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
}

export function createWorkspace(sessionId: string): string {
  const dir = path.join(WORKSPACES_ROOT, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const readme = path.join(dir, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      `# Ecode Workspace\n\nThis is the isolated sandbox for session \`${sessionId}\`.\nEvery file the Ecode agent reads or writes lives under this directory.\n\n- File tools cannot escape this folder (path traversal & symlinks are blocked)\n- Shell commands run with this folder as cwd and a deny-rule filter\n- Changes are tracked as changesets and can be undone\n`
    );
  }
  return dir;
}

export function workspaceExists(workspace: string): boolean {
  try {
    return fs.statSync(workspace).isDirectory();
  } catch {
    return false;
  }
}

const FORBIDDEN_EXTERNAL_DIRS = new Set([
  "/",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/sys",
  "/proc",
  "/dev",
  "/boot",
  "/run",
  "/lib",
  "/lib64",
  "/opt",
  "/root",
  "/home",
]);

/**
 * Validate an external workspace directory (used by the Ecode CLI:
 * `ecode ~/myproject`). Returns the absolute path or a rejection reason.
 */
export function resolveExternalWorkspace(dir: string): { ok: true; abs: string } | { ok: false; reason: string } {
  const abs = path.resolve(dir);
  if (FORBIDDEN_EXTERNAL_DIRS.has(abs)) {
    return { ok: false, reason: `refusing to use "${abs}" as a workspace (protected system path)` };
  }
  if (process.env.ECODE_ALLOW_ANY_DIR === "1") {
    // explicit opt-in escape hatch for advanced users
  } else if (!abs.startsWith("/home/") && !abs.startsWith("/Users/")) {
    return { ok: false, reason: `workspace must live under a user home directory (got "${abs}")` };
  }
  try {
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) return { ok: false, reason: `"${abs}" is not a directory` };
  } catch {
    return { ok: false, reason: `directory "${abs}" does not exist` };
  }
  return { ok: true, abs };
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FileNode[];
}

export function listTree(dir: string, depth = 3, currentDepth = 0): FileNode[] {
  const SKIP = new Set(["node_modules", ".git", "__pycache__", ".next", "dist", "target"]);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: FileNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".DS_Store")) continue;
    const rel = path.relative(dir, e.name) || e.name;
    const node: FileNode = {
      name: e.name,
      path: rel,
      type: e.isDirectory() ? "dir" : "file",
    };
    if (e.isDirectory() && currentDepth < depth && !SKIP.has(e.name)) {
      node.children = listTree(path.join(dir, e.name), depth, currentDepth + 1);
    } else if (e.isFile()) {
      try {
        node.size = fs.statSync(path.join(dir, e.name)).size;
      } catch {
        /* ignore */
      }
    }
    nodes.push(node);
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

export function deleteWorkspace(workspace: string): void {
  try {
    fs.rmSync(workspace, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
