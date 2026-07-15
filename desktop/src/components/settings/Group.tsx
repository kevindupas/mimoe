import type { ReactNode } from "react";

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 select-none">
      <div className="pl-1 text-[10px] font-bold uppercase tracking-wider text-faint">
        {title}
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-[8px] border border-border bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        {children}
      </div>
    </div>
  );
}

/** Ligne clé/valeur ou libellé + contrôle. */
export function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3 px-4 py-3 text-[13px]">
      {children}
    </div>
  );
}
