/** Illustrations onboarding — SVG animés bicolores et épurés. */
const A = "var(--color-accent)";
const B = "var(--color-border-strong)";

export function IlluSync() {
  return (
    <svg viewBox="0 0 220 120" fill="none" className="h-[110px] w-auto">
      {/* Mac */}
      <rect x="16" y="34" width="70" height="46" rx="6" stroke={B} strokeWidth="2" />
      <path d="M34 88h34" stroke={B} strokeWidth="2" strokeLinecap="round" />
      
      {/* Phone */}
      <rect x="150" y="26" width="40" height="66" rx="7" stroke={B} strokeWidth="2" />
      <path d="M166 82h8" stroke={B} strokeWidth="2" strokeLinecap="round" />
      
      {/* Sync Arrow/Line */}
      <path
        className="sync-line"
        d="M94 57h48"
        stroke={A}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 6"
      />
      <circle className="sync-dot" cx="0" cy="57" r="4.5" fill={A} />
    </svg>
  );
}

export function IlluServer() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="h-[110px] w-auto">
      <circle cx="80" cy="60" r="32" stroke={A} strokeWidth="1.5" className="pulse-ring opacity-50" />
      {/* Server Rack 1 */}
      <rect x="52" y="42" width="56" height="15" rx="3" stroke={B} strokeWidth="2" fill="var(--color-surface)" />
      <circle cx="62" cy="49.5" r="2" fill={A} />
      
      {/* Server Rack 2 */}
      <rect x="52" y="63" width="56" height="15" rx="3" stroke={B} strokeWidth="2" fill="var(--color-surface)" />
      <circle cx="62" cy="70.5" r="2" fill={A} />
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
