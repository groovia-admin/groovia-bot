import type { Metadata, Viewport } from 'next'
import './globals.css'

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
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
