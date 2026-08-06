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
        // WhatsApp-derived light theme: chat-list gray-white background,
        // white cards, WhatsApp's own border/text grays.
        surface: {
          DEFAULT: '#F0F2F5',
          card:    '#FFFFFF',
          hover:   '#F5F6F6',
          border:  '#E9EDEF',
        },
        brand: {
          DEFAULT: '#25D366',
          light:   '#DCF8C6',
          dark:    '#128C7E',
        },
        ink: {
          DEFAULT: '#111B21',
          muted:   '#667781',
          faint:   '#8696A0',
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