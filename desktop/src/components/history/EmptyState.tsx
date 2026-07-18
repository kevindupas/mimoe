import { Icon } from "../ui/Icon";
import { useLanguage } from "../../context/LanguageContext";

export function EmptyState({ searching }: { searching: boolean }) {
  const { t } = useLanguage();

  return (
    <div className="m-auto flex flex-col items-center gap-2 px-5 py-10 text-center text-faint">
      <Icon name="clip" className="h-8 w-8 opacity-40" />
      <p className="text-sm font-medium text-dim">
        {searching ? t("emptyNoResults") : t("emptyDefault")}
      </p>
      <span className="text-xs">{t("emptyHint")}</span>
    </div>
  );
}
