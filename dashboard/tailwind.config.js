/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Teal brand theme — same token structure as the old WhatsApp-
        // derived palette (surface/brand/ink), just recolored, so every
        // existing `bg-surface-card`, `text-ink-muted`, etc. class keeps
        // working unchanged.
        surface: {
          DEFAULT: '#F8F9FF',
          card:    '#FFFFFF',
          hover:   '#EFF4FF',
          border:  '#BCC9C6',
        },
        brand: {
          DEFAULT: '#00685F',
          light:   '#89F5E7',
          dark:    '#005049',
        },
        ink: {
          DEFAULT: '#0B1C30',
          muted:   '#3D4947',
          faint:   '#6D7A77',
        },
        error: {
          DEFAULT: '#BA1A1A',
          light:   '#FFDAD6',
          dark:    '#93000A',
        },
        status: {
          pending:   '#f59e0b',
          accepted:  '#3b82f6',
          preparing: '#8b5cf6',
          ready:     '#10b981',
          completed: '#6b7280',
          rejected:  '#ef4444',
          cancelled: '#ef4444',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
    },
  },
  plugins: [],
}