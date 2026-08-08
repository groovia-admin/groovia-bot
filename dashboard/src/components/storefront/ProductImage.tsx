'use client'

import { useState } from 'react'

// Product photos are the main thing that pops in visibly when switching
// categories — a shimmer placeholder that fades into the real image (once
// it's actually loaded) reads as "the app is doing something" instead of
// the abrupt blank-then-pop that looked like unexplained lag.
export default function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  const [loaded, setLoaded] = useState(false)

  if (!src) {
    return (
      <div className="h-24 w-full rounded-lg mb-2 flex items-center justify-center bg-surface-hover">
        <span className="text-2xl font-bold text-ink-faint">{alt.charAt(0).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <div className="relative h-24 w-full rounded-lg mb-2 overflow-hidden bg-surface-hover">
      {!loaded && (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, #F0F2F5 25%, #E9EDEF 37%, #F0F2F5 63%)',
            backgroundSize: '400% 100%',
            animation: 'productImageShimmer 1.4s ease infinite',
          }}
        />
      )}
      <style>{`
        @keyframes productImageShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
      `}</style>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="h-full w-full object-cover"
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease' }}
      />
    </div>
  )
}
