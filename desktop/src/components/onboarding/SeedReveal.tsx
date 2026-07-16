import { useLanguage } from "../../context/LanguageContext";
import { Icon } from "../ui/Icon";

/**
 * Affiche les 12 mots générés. La capture presse-papier est mise en pause par
 * `OnboardingView` tant que cet écran est monté : sans ça, un Cmd+C sur la seed
 * la ferait chiffrer avec la clé qu'elle vient de générer, puis envoyer au serveur.
 */
export function SeedReveal({ words }: { words: string[] }) {
  const { t } = useLanguage();
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

      <p className="flex items-start gap-2 rounded-[7px] border border-danger/15 bg-danger-soft px-2.5 py-2 text-left text-[11px] leading-[1.45] text-danger">
        <Icon name="shield" className="mt-px h-3.5 w-3.5 shrink-0 stroke-[1.75]" />
        <span>{t("seedRevealWarning")}</span>
      </p>
    </div>
  );
}
