// Branded loading indicator — a cart rolling back and forth along a line,
// same motif as the login page's logo animation, reused here so "the app is
// thinking" always looks like the same app rather than a generic spinner.
// Used both as a full route-level loading.tsx screen and inline wherever a
// fetch is in flight (e.g. the storefront's initial catalog load).
//
// Previously orbited in a tight, fast circle — read as jittery rather than
// "loading." A cart moving in a straight line, at a slower pace, reads more
// like something actually being pushed/rolled.
export default function CartLoader({ label, size = "page" }: { label?: string; size?: "page" | "inline" }) {
  const trackWidth = size === "page" ? 96 : 56;
  const cart = size === "page" ? 22 : 14;

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
      }}
    >
      <style>{`
        @keyframes cartLoaderRoll { 0% { transform: translateX(0); } 50% { transform: translateX(${trackWidth - cart}px); } 100% { transform: translateX(0); } }
        @keyframes cartLoaderFlip { 0%, 49% { transform: scaleX(1); } 50%, 100% { transform: scaleX(-1); } }
        @keyframes cartLoaderBob { 0%, 100% { transform: translateY(0); } 25% { transform: translateY(-2px); } 75% { transform: translateY(-2px); } }
        .cart-loader-roll { animation: cartLoaderRoll 2.2s ease-in-out infinite; }
        .cart-loader-flip { animation: cartLoaderFlip 2.2s steps(1) infinite; }
        .cart-loader-bob { animation: cartLoaderBob 0.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cart-loader-roll, .cart-loader-flip, .cart-loader-bob { animation: none; }
        }
      `}</style>
      <div style={{ position: "relative", width: trackWidth, height: cart + 6 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 2,
            borderBottom: "2px dashed #E9EDEF",
          }}
        />
        <div className="cart-loader-roll" style={{ position: "absolute", top: 0, left: 0 }}>
          <div className="cart-loader-bob">
            <div className="cart-loader-flip" style={{ width: cart, height: cart }}>
              <svg width={cart} height={cart} viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      {label && <div style={{ fontSize: 13, color: "#667781" }}>{label}</div>}
    </div>
  );
}
