interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}

/** Interrupteur style macOS (piste + pastille). */
export function Switch({ checked, onChange, id }: SwitchProps) {
  return (
    <label className="relative h-5 w-[34px] shrink-0 cursor-pointer select-none">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 z-10"
      />
      <span
        className="absolute inset-0 rounded-full bg-border-strong transition-all duration-200 peer-checked:bg-accent
          after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white
          after:shadow-[0_1.5px_3px_rgba(0,0,0,0.15)] after:transition-all after:duration-200
          peer-checked:after:translate-x-[14px] active:after:w-[18px] peer-checked:active:after:translate-x-[10px]"
      />
    </label>
  );
}
