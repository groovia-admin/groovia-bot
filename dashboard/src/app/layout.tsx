import type { Metadata, Viewport } from 'next'
import { Inter, Sora } from 'next/font/google'
import './globals.css'

// Both fonts were configured in tailwind.config.js (font-sans / font-display)
// but never actually loaded anywhere — every page had been silently falling
// back to each browser's default system font the entire time. next/font
// self-hosts these at build time (no runtime request, no layout shift, no
// external font CDN call that a strict CSP would block) and exposes them as
// CSS variables so the existing Tailwind classes just start working.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const sora = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-sora', display: 'swap' })

export const metadata: Metadata = {
  title: 'Groovia Admin',
  description: 'Groovia Platform Dashboard',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Groovia',
  },
}

export const viewport: Viewport = {
  themeColor: '#00685F',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body>{children}</body>
    </html>
  )
}
