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
        surface: {
          DEFAULT: '#0f172a',
          card:    '#1e293b',
          hover:   '#334155',
          border:  '#334155',
        },
        brand: {
          DEFAULT: '#2A8C8C',
          light:   '#3aadad',
          dark:    '#1e6969',
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