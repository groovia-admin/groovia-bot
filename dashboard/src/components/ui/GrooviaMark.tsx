// Placeholder reconstruction of the GrooVia brand mark (a multi-stroke
// teal "V" swoosh) — hand-rebuilt from a pasted reference image since no
// vector/source file was available. Swap the path data below for the real
// asset the moment it can be read from disk; nothing else using this
// component needs to change.
export default function GrooviaMark({ size = 40, color = "var(--brand)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 400 440" fill="none">
      <path d="M126,84 L172,158" stroke={color} strokeWidth="30" strokeLinecap="round" />
      <path d="M100,116 L178,222" stroke={color} strokeWidth="30" strokeLinecap="round" />
      <path d="M74,148 L182,282" stroke={color} strokeWidth="30" strokeLinecap="round" />
      <path d="M48,180 Q90,220 120,300 Q128,322 106,330" stroke={color} strokeWidth="30" strokeLinecap="round" />
      <path d="M156,332 L322,78" stroke={color} strokeWidth="30" strokeLinecap="round" />
      <path d="M232,268 L296,164" stroke={color} strokeWidth="30" strokeLinecap="round" />
    </svg>
  );
}
