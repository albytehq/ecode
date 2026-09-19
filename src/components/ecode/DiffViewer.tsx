"use client";

import { useMemo } from "react";

export function DiffViewer({ diff, compact = false }: { diff: string; compact?: boolean }) {
  const lines = useMemo(() => diff.split("\n"), [diff]);
  return (
    <div className={`rounded-md border border-stone-800 bg-stone-950 overflow-x-auto font-mono ${compact ? "text-[11px]" : "text-xs"}`}>
      <div className="min-w-full inline-block leading-relaxed">
        {lines.map((line, i) => {
          let cls = "text-stone-400";
          if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-emerald-400 bg-emerald-500/10";
          else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-red-400 bg-red-500/10";
          else if (line.startsWith("@@")) cls = "text-amber-500/90";
          else if (line.startsWith("+++") || line.startsWith("---")) cls = "text-stone-500";
          return (
            <div key={i} className={`px-3 whitespace-pre ${cls}`}>
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}
