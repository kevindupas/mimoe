/** Illustrations onboarding — SVG animés bicolores et épurés. */
const A = "var(--color-accent)";
const B = "var(--color-border-strong)";

export function IlluSync() {
  return (
    <svg viewBox="0 0 220 120" fill="none" className="h-[110px] w-auto">
      {/* Mac */}
      <rect x="6" y="34" width="58" height="40" rx="5" stroke={B} strokeWidth="2" />
      <path d="M21 82h28" stroke={B} strokeWidth="2" strokeLinecap="round" />

      {/* Serveur — tout transite par lui */}
      <rect x="103" y="39" width="32" height="13" rx="3" stroke={B} strokeWidth="2" fill="var(--color-surface)" />
      <rect x="103" y="56" width="32" height="13" rx="3" stroke={B} strokeWidth="2" fill="var(--color-surface)" />
      <circle className="led" cx="110" cy="45.5" r="2" fill={A} />
      <circle className="led led-2" cx="110" cy="62.5" r="2" fill={A} />

      {/* Phone */}
      <rect x="174" y="26" width="32" height="56" rx="6" stroke={B} strokeWidth="2" />
      <path d="M184 76h12" stroke={B} strokeWidth="2" strokeLinecap="round" />

      {/* Mac → serveur */}
      <path
        className="sync-line"
        d="M70 54h27"
        stroke={A}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
      />
      <circle className="sync-dot-in" cx="0" cy="54" r="4" fill={A} />

      {/* Serveur → phone */}
      <path
        className="sync-line"
        d="M141 54h27"
        stroke={A}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
      />
      <circle className="sync-dot-out" cx="0" cy="54" r="4" fill={A} />
    </svg>
  );
}

export function IlluServer() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-[110px] w-auto">
      {/* Rack — 3 unités */}
      <rect x="53" y="37" width="54" height="16" rx="4" stroke={B} strokeWidth="2" fill="var(--color-surface)" />
      <rect x="53" y="59" width="54" height="16" rx="4" stroke={B} strokeWidth="2" fill="var(--color-surface)" />
      <rect x="53" y="81" width="54" height="16" rx="4" stroke={B} strokeWidth="2" fill="var(--color-surface)" />

      {/* Grilles de ventilation */}
      <path
        d="M74 45h24M74 67h24M74 89h24"
        stroke={B}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />

      {/* LEDs d'activité — clignotent en cascade */}
      <circle className="led" cx="63" cy="45" r="2.5" fill={A} />
      <circle className="led led-2" cx="63" cy="67" r="2.5" fill={A} />
      <circle className="led led-3" cx="63" cy="89" r="2.5" fill={A} />
    </svg>
  );
}

export function IlluDevice() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-[110px] w-auto">
      {/* Screen */}
      <rect x="40" y="34" width="80" height="52" rx="7" stroke={B} strokeWidth="2" />
      <path d="M62 94h36" stroke={B} strokeWidth="2" strokeLinecap="round" />
      
      {/* Success Check */}
      <path
        className="check-draw"
        d="M68 59l8 8 16-17"
        stroke={A}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IlluLock() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-[110px] w-auto">
      <circle className="pulse-ring" cx="80" cy="62" r="34" stroke="var(--color-accent-soft)" strokeWidth="1.5" />
      {/* Shield Outline */}
      <path
        d="M80 32l24 9v15c0 16-11 26-24 31-13-5-24-15-24-31V41z"
        stroke={B}
        strokeWidth="2"
        strokeLinejoin="round"
        fill="var(--color-surface)"
      />
      {/* Keyhole */}
      <path d="M80 57v9" stroke={A} strokeWidth="2" strokeLinecap="round" />
      <circle cx="80" cy="72" r="2.5" fill={A} />
    </svg>
  );
}
