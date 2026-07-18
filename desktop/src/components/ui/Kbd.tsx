import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-[18px] min-w-[18px] place-items-center rounded border border-border-strong bg-kbd px-[5px] text-[9.5px] font-medium text-dim font-sans shadow-[0_1px_0.5px_rgba(0,0,0,0.08),0_1px_0_rgba(255,255,255,0.1)_inset]">
      {children}
    </kbd>
  );
}
