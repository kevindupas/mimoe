import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { tauri } from "../../lib/tauri";
import { cx } from "../../lib/cx";

/**
 * Seed entry on an additional device.
 *
 * A free-form field rather than 12 boxes: the real path on desktop is pasting
 * from a password manager. Words outside the wordlist are flagged live; the
 * checksum, meanwhile, is verified on the Rust side at validation — that is what
 * catches a valid but misplaced word.
 */
export function SeedInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useLanguage();
  const [wordlist, setWordlist] = useState<Set<string> | null>(null);

  useEffect(() => {
    tauri.seedWordlist().then((w) => setWordlist(new Set(w)));
  }, []);

  const words = useMemo(
    () => value.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [value],
  );
  const unknown = useMemo(
    () => (wordlist ? words.filter((w) => !wordlist.has(w)) : []),
    [words, wordlist],
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        data-ob-focus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        rows={3}
        placeholder={t("seedInputPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-[8px] border border-border-strong bg-surface px-3 py-2.5 text-center font-mono text-[12.5px] leading-[1.6] text-text placeholder-faint outline-none transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
      />

      <div className="flex items-center justify-between px-0.5 text-[10.5px]">
        <span className={cx("tabular-nums", words.length === 12 ? "text-accent" : "text-faint")}>
          {words.length}/12
        </span>
        {unknown.length > 0 && (
          <span className="truncate pl-2 text-danger">
            {t("seedInputUnknown")} {unknown.slice(0, 3).join(", ")}
            {unknown.length > 3 && "…"}
          </span>
        )}
      </div>
    </div>
  );
}
