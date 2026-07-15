import { cx } from "../../lib/cx";
import { preview, relativeTime } from "../../lib/format";
import { detectContent } from "../../lib/detect";
import { tauri } from "../../lib/tauri";
import type { Clip } from "../../lib/types";
import { Icon } from "../ui/Icon";
import { useLanguage } from "../../context/LanguageContext";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface ClipCardProps {
  clip: Clip;
  index: number;
  selected: boolean;
  fresh: boolean;
  copied: boolean;
  masked: boolean;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
  onToggleHide: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ClipCard({
  clip,
  index,
  selected,
  fresh,
  copied,
  masked,
  onSelect,
  onActivate,
  onToggleHide,
  onDelete,
}: ClipCardProps) {
  const { t } = useLanguage();
  const delay = reduceMotion ? 0 : Math.min(index, 8) * 28;
  const detected = clip.kind === "text" ? detectContent(clip.text) : { kind: "plain" as const };

  return (
    <div
      data-index={index}
      onClick={() => (masked ? onToggleHide(clip.id) : onActivate(index))}
      onMouseMove={() => !masked && onSelect(index)}
      style={{ animationDelay: `${delay}ms` }}
      className={cx(
        "group relative shrink-0 cursor-pointer overflow-hidden rounded-[8px] border px-4 py-3",
        "transition-all duration-150 select-none",
        !selected && !copied && "border-border bg-surface hover:border-border-strong hover:bg-surface-hover",
        selected && !copied && "border-accent bg-accent-soft shadow-[0_1px_3px_rgba(4,122,105,0.05)]",
        copied && "border-accent bg-accent shadow-[0_2px_8px_rgba(4,122,105,0.2)]",
        fresh && "anim-slide-in",
      )}
    >
      {!copied && (
        <div className="absolute right-2 top-2 z-[2] flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {!masked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleHide(clip.id);
              }}
              title={t("hide")}
              aria-label={t("hide")}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-dim transition hover:bg-accent hover:text-white hover:border-transparent shadow-sm cursor-pointer"
            >
              <Icon name="eyeOff" className="h-3.5 w-3.5 stroke-[1.75]" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(clip.id);
            }}
            title={t("delete")}
            aria-label={t("delete")}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-dim transition hover:bg-danger hover:text-white hover:border-transparent shadow-sm cursor-pointer"
          >
            <Icon name="trash" className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>
        </div>
      )}

      {copied && (
        <div className="absolute right-2 top-2 z-[2] flex items-center gap-1 rounded-md bg-white px-2 py-1 text-accent text-[11.5px] font-semibold shadow-sm border border-accent/10 anim-slide-in select-none">
          <Icon name="check" className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>{t("copied")}</span>
        </div>
      )}

      <div className={cx("w-full transition-all duration-300", masked && "blur-[3.5px] opacity-15 select-none pointer-events-none")}>
        {clip.kind === "image" && clip.imageB64 ? (
          <div className="bg-transparency-grid flex max-h-[160px] w-full items-center justify-center rounded-md border border-border/40 p-2 overflow-hidden bg-surface mb-1">
            <img
              src={`data:${clip.mime ?? "image/png"};base64,${clip.imageB64}`}
              alt="image"
              className="block max-h-[140px] max-w-full rounded object-contain shadow-sm"
            />
          </div>
        ) : (
          <div
            className={cx(
              "max-h-[60px] overflow-hidden whitespace-pre-wrap break-words text-[13px] leading-[1.45] tracking-[-0.01em]",
              detected.kind === "code" && "font-mono text-[12px]",
              copied ? "text-white font-medium" : "text-text"
            )}
          >
            {preview(clip.text)}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <span className={cx("inline-flex items-center gap-1 text-[11px] font-medium", copied ? "text-white" : "text-dim")}>
            <Icon name={clip.mine ? "mac" : "remote"} className="h-3.5 w-3.5 stroke-[1.75]" />
            {clip.mine ? t("thisMac") : t("received")}
          </span>

          {detected.kind === "url" && !copied && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                tauri.openUrl(clip.text.trim());
              }}
              title={t("open")}
              className="inline-flex items-center gap-1 rounded-[4px] border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent transition hover:bg-accent hover:text-white cursor-pointer"
            >
              <Icon name="link" className="h-2.5 w-2.5 stroke-[2]" />
              {t("open")}
            </button>
          )}

          {detected.kind === "color" && (
            <span className={cx("inline-flex items-center gap-1 text-[10px] font-mono", copied ? "text-white" : "text-dim")}>
              <span
                className="h-3.5 w-3.5 rounded-[3px] border border-border shadow-sm"
                style={{ backgroundColor: detected.color }}
              />
              {detected.color}
            </span>
          )}
          {clip.is_sensitive && (
            <span className={cx(
              "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
              copied ? "bg-white text-accent" : "bg-[#fee2e2] dark:bg-[#450a0a] text-danger border border-danger/10"
            )}>
              <Icon name="shield" className="h-2.5 w-2.5 stroke-[2]" />
              {t("sensitive")}
            </span>
          )}
          <span className={cx("ml-auto text-[11px] tabular-nums font-normal", copied ? "text-white" : "text-faint")}>
            {relativeTime(clip.created_at)}
          </span>
        </div>
      </div>

      {masked && (
        <div className="absolute inset-0 bg-spoiler-stripes opacity-[0.55] pointer-events-none z-[1]" />
      )}

      {masked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-dim text-[11px] font-semibold shadow-sm">
            <Icon name="eye" className="h-3.5 w-3.5 stroke-[2] text-accent" />
            <span>{t("show")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
