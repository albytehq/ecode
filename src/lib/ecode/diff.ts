// Minimal LCS-based line diff producing unified-diff-like output for the Ecode diff viewer

export interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.length ? oldText.split("\n") : [];
  const b = newText.length ? newText.split("\n") : [];
  const n = a.length;
  const m = b.length;

  // LCS table
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "ctx", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    out.push({ type: "del", text: a[i] });
    i++;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j] });
    j++;
  }
  return out;
}

export function toUnifiedDiff(
  filePath: string,
  oldText: string,
  newText: string,
  context = 3
): string {
  const lines = diffLines(oldText, newText);
  const out: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  let idx = 0;
  while (idx < lines.length) {
    // find next changed line
    while (idx < lines.length && lines[idx].type === "ctx") idx++;
    if (idx >= lines.length) break;

    const hunkStart = Math.max(0, idx - context);
    let end = idx;
    while (end < lines.length && lines[end].type !== "ctx") end++;
    // include trailing context, but stop at another change block if far
    let hunkEnd = Math.min(lines.length, end + context);
    // merge hunks separated by small context gaps
    let next = hunkEnd;
    while (next < lines.length) {
      let k = next;
      while (k < lines.length && lines[k].type === "ctx") k++;
      if (k < lines.length && k - hunkEnd <= context * 2) {
        hunkEnd = Math.min(lines.length, k + context + (k - hunkEnd));
        // advance to end of this change run
        while (hunkEnd < lines.length && lines[hunkEnd].type !== "ctx") hunkEnd++;
        next = hunkEnd;
      } else break;
    }

    const hunk = lines.slice(hunkStart, hunkEnd);
    // compute start line numbers (1-based) for old and new
    let oldNo = 1;
    let newNo = 1;
    for (let k = 0; k < hunkStart; k++) {
      if (lines[k].type !== "add") oldNo++;
      if (lines[k].type !== "del") newNo++;
    }
    let oldCount = 0;
    let newCount = 0;
    for (const l of hunk) {
      if (l.type !== "add") oldCount++;
      if (l.type !== "del") newCount++;
    }
    out.push(`@@ -${oldNo},${oldCount} +${newNo},${newCount} @@`);
    for (const l of hunk) {
      const prefix = l.type === "add" ? "+" : l.type === "del" ? "-" : " ";
      out.push(prefix + l.text);
    }
    idx = hunkEnd;
  }
  return out.join("\n");
}

export function diffStats(oldText: string, newText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of diffLines(oldText, newText)) {
    if (l.type === "add") added++;
    else if (l.type === "del") removed++;
  }
  return { added, removed };
}
