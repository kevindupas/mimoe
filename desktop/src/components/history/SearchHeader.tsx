import { forwardRef } from "react";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { useLanguage } from "../../context/LanguageContext";
import { useApp } from "../../context/AppContext";
import { cx } from "../../lib/cx";

interface SearchHeaderProps {
  value: string;
  onChange: (value: string) => void;
  onOpenSettings: () => void;
}

export const SearchHeader = forwardRef<HTMLInputElement, SearchHeaderProps>(
  function SearchHeader({ value, onChange, onOpenSettings }, ref) {
    const { t } = useLanguage();
    const { paused, setPaused } = useApp();

    return (
      <header
        data-tauri-drag-region
        className="flex items-center gap-3 border-b border-border bg-surface px-4 py-[11px] select-none shrink-0"
      >
        <span className="flex text-dim shrink-0">
          <Icon name="search" className="h-[15px] w-[15px] stroke-[1.75]" />
        </span>
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 border-none bg-transparent py-1 text-[13px] text-text placeholder-faint outline-none font-sans"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="text-[11px] font-medium text-dim hover:text-text px-1.5 py-0.5 rounded hover:bg-surface-hover transition duration-150 font-sans cursor-pointer"
          >
            {t("clear")}
          </button>
        )}
        <button
          onClick={() => setPaused(!paused)}
          title={paused ? t("resumeTitle") : t("pauseTitle")}
          aria-label={paused ? t("resumeTitle") : t("pauseTitle")}
          className={cx(
            "flex h-7 w-7 items-center justify-center rounded-md transition duration-150 shrink-0 cursor-pointer",
            paused
              ? "bg-[#fef3c7] text-[#b45309] dark:bg-[#78350f]/40 dark:text-[#fbbf24]"
              : "text-dim hover:bg-surface-hover hover:text-text",
          )}
        >
          <Icon name={paused ? "play" : "pause"} className="h-[15px] w-[15px] stroke-[1.75]" />
        </button>
        <div className="h-4 w-[1px] bg-border shrink-0" />
        <Button
          variant="ghost"
          onClick={onOpenSettings}
          title={t("settingsTitle")}
          aria-label={t("settingsLabel")}
          className="hover:rotate-[30deg] transition-transform duration-300 shrink-0"
        >
          <Icon name="gear" className="h-[15px] w-[15px] stroke-[1.75]" />
        </Button>
      </header>
    );
  },
);
