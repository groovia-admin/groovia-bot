// Branded loading indicator — a cart orbiting a ring, same motif as the
// login page's logo animation, reused here so "the app is thinking" always
// looks like the same app rather than a generic spinner. Used both as a
// full route-level loading.tsx screen and inline wherever a fetch is
// in flight (e.g. the storefront's initial catalog load).
export default function CartLoader({ label, size = "page" }: { label?: string; size?: "page" | "inline" }) {
  const ring = size === "page" ? 64 : 34;
  const cart = size === "page" ? 20 : 12;

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
        @keyframes cartLoaderOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes cartLoaderCounter { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(-360deg); } }
        .cart-loader-orbit { animation: cartLoaderOrbit 1.1s linear infinite; }
        .cart-loader-icon { animation: cartLoaderCounter 1.1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cart-loader-orbit, .cart-loader-icon { animation-duration: 2.4s; }
        }
      `}</style>
      <div style={{ position: "relative", width: ring, height: ring }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid #E9EDEF" }} />
        <div className="cart-loader-orbit" style={{ position: "absolute", inset: 0 }}>
          <div
            className="cart-loader-icon"
            style={{
              position: "absolute",
              top: -cart / 2 + 1,
              left: "50%",
              width: cart,
              height: cart,
              borderRadius: "50%",
              background: "#25D366",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 4px rgba(17,27,33,0.2)",
            }}
          >
            <svg width={cart * 0.55} height={cart * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </div>
        </div>
      </div>
      {label && <div style={{ fontSize: 13, color: "#667781" }}>{label}</div>}
    </div>
  );
}
