import { useLanguage } from "../../context/LanguageContext";

/**
 * Checks that the seed has been written down: a few words asked again at
 * randomly picked positions.
 *
 * This is not a security measure — zero bits gained. It is about availability:
 * without a saved seed, the user could never pair a second device.
 */
export function SeedQuiz({
  positions,
  answers,
  onAnswer,
}: {
  positions: number[];
  answers: Record<number, string>;
  onAnswer: (pos: number, value: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="grid w-full grid-cols-2 gap-2.5">
      {positions.map((pos, i) => (
        <label key={pos} className="flex flex-col gap-1 text-left">
          <span className="text-[10.5px] font-medium text-faint">
            {t("seedQuizWord")} {pos + 1}
          </span>
          <input
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-ob-focus={i === 0 ? true : undefined}
            value={answers[pos] ?? ""}
            onChange={(e) => onAnswer(pos, e.target.value)}
            className="w-full rounded-[7px] border border-border-strong bg-surface px-2.5 py-2 font-mono text-[12.5px] text-text outline-none transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
          />
        </label>
      ))}
    </div>
  );
}
