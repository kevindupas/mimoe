import { useLanguage } from "../../context/LanguageContext";
import { cx } from "../../lib/cx";

export type ClipFilter = "all" | "text" | "image" | "file" | "pinned";

const ORDER: ClipFilter[] = ["all", "text", "image", "file", "pinned"];
const LABEL: Record<ClipFilter, "filterAll" | "filterText" | "filterImages" | "filterFiles" | "filterPinned"> = {
  all: "filterAll",
  text: "filterText",
  image: "filterImages",
  file: "filterFiles",
  pinned: "filterPinned",
};

export function FilterChips({ value, onChange }: { value: ClipFilter; onChange: (f: ClipFilter) => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex shrink-0 select-none gap-1.5 overflow-x-auto border-b border-border bg-surface px-4 py-2">
      {ORDER.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cx(
            "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition duration-150 cursor-pointer",
            value === f
              ? "bg-accent text-white"
              : "bg-surface-hover text-dim hover:text-text",
          )}
        >
          {t(LABEL[f])}
        </button>
      ))}
    </div>
  );
}
