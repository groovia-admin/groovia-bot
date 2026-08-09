import type { MetadataRoute } from 'next'

// Lets staff "Add to Home Screen" on the tablet/phone they run the counter
// from, so the dashboard opens full-screen like a native app instead of a
// browser tab with an address bar. Icons are generated at build/request
// time by the sibling icon-192.png and icon-512.png route handlers.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Groovia Admin',
    short_name: 'Groovia',
    description: 'Manage orders, catalog, and shop settings for your Groovia storefront.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F8F9FF',
    theme_color: '#00685F',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
