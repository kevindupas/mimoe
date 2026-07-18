import { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { tauri } from "../../lib/tauri";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/**
 * Displays the 12 generated words. Clipboard capture is paused by
 * `OnboardingView` while this screen is mounted: without that, a Cmd+C on the seed
 * would encrypt it with the key it just generated, then send it to the server.
 */
export function SeedReveal({ words }: { words: string[] }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await tauri.copySeed(words);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <ol className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
        {words.map((w, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-[7px] border border-border bg-surface px-2.5 py-1.5"
          >
            <span className="w-4 shrink-0 text-right text-[10.5px] tabular-nums text-faint">
              {i + 1}
            </span>
            <span className="font-mono text-[12.5px] font-medium text-text">{w}</span>
          </li>
        ))}
      </ol>

      <Button variant="mini" className="self-center" onClick={copy}>
        <span className="inline-flex items-center gap-1.5">
          <Icon name={copied ? "check" : "copy"} className="h-3 w-3 stroke-[2]" />
          {copied ? t("seedCopied") : t("seedCopy")}
        </span>
      </Button>

      <p className="flex items-start gap-2 rounded-[7px] border border-danger/15 bg-danger-soft px-2.5 py-2 text-left text-[11px] leading-[1.45] text-danger">
        <Icon name="shield" className="mt-px h-3.5 w-3.5 shrink-0 stroke-[1.75]" />
        <span>{t("seedRevealWarning")}</span>
      </p>
    </div>
  );
}
