import { useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { OB_STEPS, useOnboarding } from "../../hooks/useOnboarding";
import { tauri } from "../../lib/tauri";
import { cx } from "../../lib/cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IlluDevice, IlluLock, IlluServer, IlluSync } from "./Illustrations";
import { useLanguage } from "../../context/LanguageContext";
import type { InputHTMLAttributes } from "react";

function ObField(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      autoComplete="off"
      className="w-full rounded-[8px] border border-border-strong bg-surface px-4 py-2.5 text-center text-[13.5px] text-text placeholder-faint outline-none transition-all duration-150 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
      {...props}
    />
  );
}

export function OnboardingView() {
  const { onPaired } = useApp();
  const { t } = useLanguage();
  const ob = useOnboarding(onPaired);
  const { step, mode, data, error, busy, setField, toggleMode, back, next } = ob;

  useEffect(() => {
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>("[data-ob-focus]")?.focus(),
    );
  }, [step, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!busy) next();
      } else if (e.key === "Escape") {
        if (step > 0) back();
        else tauri.hideWindow();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, step, next, back]);

  const content = stepContent();

  return (
    <div className="flex h-screen flex-col bg-bg select-none">
      <div className="flex items-center justify-between px-4 pb-1 pt-4 shrink-0">
        {step > 0 ? (
          <Button variant="ghost" onClick={back} aria-label="Retour">
            <Icon name="back" className="h-4 w-4 stroke-[1.75]" />
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-text">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Clipd
          </span>
        )}
        <div className="flex gap-[5px] items-center">
          {Array.from({ length: OB_STEPS }, (_, i) => (
            <span
              key={i}
              className={cx(
                "h-1.5 rounded-full transition-all duration-200",
                i === step
                  ? "w-4 bg-accent"
                  : i < step
                    ? "w-1.5 bg-accent/40"
                    : "w-1.5 bg-border-strong/60",
              )}
            />
          ))}
        </div>
        <span className="w-8" />
      </div>

      <div
        key={step}
        className="anim-ob-in flex flex-1 flex-col items-center justify-center gap-1.5 px-8 pb-4 pt-2 text-center"
      >
        <div className="mb-2 grid h-[120px] place-items-center">{content.illu}</div>
        <h1 className="text-balance text-[22px] font-bold leading-tight tracking-tight text-text">
          {content.title}
        </h1>
        <p className="mt-1.5 max-w-[290px] text-[13px] leading-relaxed text-dim">{content.sub}</p>
        {content.fields && <div className="mt-5 flex w-full max-w-[280px] flex-col gap-2.5">{content.fields}</div>}
        {error && (
          <div className="mb-1 mt-3 max-w-[280px] rounded-md bg-danger-soft px-3 py-2 text-[11.5px] font-medium text-danger border border-danger/10">
            {error}
          </div>
        )}
      </div>

      <div className="px-8 pb-8 shrink-0">
        <Button className="w-full" disabled={busy} onClick={next}>
          {content.cta}
        </Button>
      </div>
    </div>
  );

  function stepContent() {
    switch (step) {
      case 0:
        return {
          illu: <IlluSync />,
          title: t("onboardingTitle0"),
          sub: t("onboardingSub0"),
          fields: null,
          cta: t("onboardingCta0"),
        };
      case 1:
        return {
          illu: <IlluServer />,
          title: t("onboardingTitle1"),
          sub: t("onboardingSub1"),
          fields: (
            <ObField
              data-ob-focus
              placeholder="https://clipd.exemple.com"
              spellCheck={false}
              value={data.server}
              onChange={(e) => setField("server", e.target.value)}
            />
          ),
          cta: t("onboardingCta1"),
        };
      case 2:
        return {
          illu: <IlluDevice />,
          title: mode === "register" ? t("onboardingTitle2Register") : t("onboardingTitle2Login"),
          sub: t("onboardingSub2"),
          fields: (
            <>
              <ObField
                data-ob-focus
                type="email"
                placeholder={t("emailPlaceholder")}
                spellCheck={false}
                value={data.email}
                onChange={(e) => setField("email", e.target.value)}
              />
              <ObField
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={data.password}
                onChange={(e) => setField("password", e.target.value)}
              />
              <div className="text-[11.5px] leading-[1.5] text-faint">
                {mode === "register" ? t("hasAccount") : t("noAccount")}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    toggleMode();
                  }}
                  className="font-semibold text-accent no-underline hover:underline"
                >
                  {mode === "register" ? t("loginLink") : t("registerLink")}
                </a>
              </div>
            </>
          ),
          cta: t("onboardingCta2"),
        };
      default:
        return {
          illu: <IlluLock />,
          title: t("onboardingTitle3"),
          sub: t("onboardingSub3"),
          fields: (
            <ObField
              data-ob-focus
              type="password"
              placeholder={t("passphrasePlaceholder")}
              value={data.passphrase}
              onChange={(e) => setField("passphrase", e.target.value)}
            />
          ),
          cta: busy ? t("onboardingCta3Busy") : t("onboardingCta3"),
        };
    }
  }
}
