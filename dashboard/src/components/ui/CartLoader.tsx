// Branded loading indicator — a cart running continuously along a road,
// reused here so "the app is thinking" always looks like the same app
// rather than a generic spinner. Used as a full route-level loading.tsx
// screen, inline wherever a fetch is in flight (e.g. the storefront's
// initial catalog load), and on the login page's own submit buttons —
// the same component everywhere rather than a bespoke look-alike per
// page.
//
// Continuous one-direction loop: the cart exits the right edge and
// re-enters from the left (clipped by the track, so the reset is
// invisible), always facing forward, wheels visibly turning — a
// back-and-forth ping-pong reads as sliding, not running.
export default function CartLoader({ label, size = "page" }: { label?: string; size?: "page" | "inline" }) {
  const trackWidth = size === "page" ? 140 : 84;
  const cart = size === "page" ? 30 : 19;
  const duration = 0.75; // 2x the original 1.5s

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: size === "page" ? "80px 20px" : "20px",
        width: "100%",
        // Page-level usage (route loading.tsx files) previously just sat
        // wherever the page's normal content flow put it, rarely actually
        // centered on the visible screen since justifyContent:center does
        // nothing without a meaningful height to center within. minHeight
        // gives it one; inline usage (embedded inside existing content,
        // e.g. StorefrontApp's catalog load) is left alone since it should
        // stay in its own flow, not force extra page height.
        minHeight: size === "page" ? "60vh" : undefined,
      }}
    >
      <style>{`
        @keyframes cartLoaderRun {
          0%   { transform: translateX(-${cart + 8}px); }
          100% { transform: translateX(${trackWidth + 8}px); }
        }
        @keyframes cartLoaderBounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes cartLoaderWheel {
          to { stroke-dashoffset: -8; }
        }
        .cart-loader-track { overflow: hidden; }
        .cart-loader-run { animation: cartLoaderRun ${duration}s linear infinite; }
        .cart-loader-bounce { animation: cartLoaderBounce ${duration / 4}s ease-in-out infinite; }
        .cart-loader-wheel { animation: cartLoaderWheel ${duration / 3}s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cart-loader-run { animation-duration: ${duration * 3}s; }
          .cart-loader-bounce, .cart-loader-wheel { animation: none; }
        }
      `}</style>
      <div className="cart-loader-track" style={{ position: "relative", width: trackWidth, height: cart + 10 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 3,
            borderBottom: "2px dashed var(--surface-border)",
          }}
        />
        <div className="cart-loader-run" style={{ position: "absolute", top: 2, left: 0 }}>
          <div className="cart-loader-bounce">
            <svg width={cart} height={cart} viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              <circle className="cart-loader-wheel" cx="9" cy="21" r="1.6" strokeDasharray="4 4" />
              <circle className="cart-loader-wheel" cx="20" cy="21" r="1.6" strokeDasharray="4 4" />
            </svg>
          </div>
        </div>
      </div>
      {label && <div style={{ fontSize: "var(--text-base)", color: "var(--ink-muted)" }}>{label}</div>}
    </div>
  );
}
