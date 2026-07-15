import { cx } from "../../lib/cx";
import type { WsStatus } from "../../lib/types";
import { Kbd } from "../ui/Kbd";
import { useLanguage } from "../../context/LanguageContext";

const dotColor: Record<WsStatus, string> = {
  connected: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]",
  connecting: "bg-amber-500 animate-pulse",
  error: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]",
};

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-faint font-medium">{children}</span>;
}

export function Footer({ wsStatus }: { wsStatus: WsStatus }) {
  const { t } = useLanguage();

  const wsTitle = {
    connected: t("wsConnected"),
    connecting: t("wsConnecting"),
    error: t("wsError"),
  }[wsStatus];

  return (
    <footer className="flex items-center gap-[18px] border-t border-border bg-surface px-4 py-2 shrink-0 select-none">
      <div className="flex items-center gap-3">
        <Hint>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span className="ml-[2px]">{t("navigate")}</span>
        </Hint>
        <div className="h-3 w-[1px] bg-border/60" />
        <Hint>
          <Kbd>↵</Kbd>
          <span className="ml-[2px]">{t("copy")}</span>
        </Hint>
        <div className="h-3 w-[1px] bg-border/60" />
        <Hint>
          <Kbd>esc</Kbd>
          <span className="ml-[2px]">{t("close")}</span>
        </Hint>
      </div>
      <span className="ml-auto inline-flex items-center" title={wsTitle}>
        <span className={cx("inline-block h-2 w-2 rounded-full transition-all duration-300", dotColor[wsStatus])} />
      </span>
    </footer>
  );
}
