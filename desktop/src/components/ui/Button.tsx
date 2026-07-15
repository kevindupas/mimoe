import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

type Variant = "primary" | "ghost" | "mini" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "text-[13px] font-medium text-white bg-accent hover:bg-accent-hover rounded-[8px] py-2 px-3 transition-all duration-150 active:scale-[0.985] disabled:opacity-50 disabled:cursor-default shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
  ghost:
    "text-dim w-8 h-8 rounded-md grid place-items-center transition-colors duration-150 hover:bg-surface-hover hover:text-text",
  mini:
    "text-[11px] font-medium text-accent bg-accent-soft rounded-md py-1 px-2.5 whitespace-nowrap transition-colors duration-150 hover:bg-accent hover:text-white disabled:opacity-50 disabled:cursor-default",
  danger:
    "w-full text-[13px] font-medium text-danger bg-transparent border border-danger/25 rounded-[8px] py-2 px-3 transition-all duration-150 hover:bg-danger hover:text-white hover:border-transparent hover:shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={cx(variants[variant], className)} {...props} />;
}
