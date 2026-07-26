import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Groovia Admin',
  description: 'Groovia Platform Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: '#0f172a' }}>
      <body style={{ background: '#0f172a', color: '#f1f5f9', margin: 0 }}>
        {children}
      </body>
    </html>
  )
}