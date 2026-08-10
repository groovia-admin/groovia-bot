// The real GrooVia brand mark (public/logo-mark.png) — a single-color
// teal PNG with transparency. `variant="white"` recolors it for dark
// backgrounds (the login showcase panel) via a CSS filter rather than
// needing a second exported asset: brightness(0) turns every opaque
// pixel black while preserving the alpha channel, invert(1) then flips
// that black to white.
export default function GrooviaMark({ size = 40, variant = "brand" }: { size?: number; variant?: "brand" | "white" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt="GrooVia"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        filter: variant === "white" ? "brightness(0) invert(1)" : undefined,
      }}
    />
  );
}
