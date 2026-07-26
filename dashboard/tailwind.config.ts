import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: '#3b82f6',
        surface: {
          DEFAULT: '#0f172a',
          card:    '#1e293b',
          hover:   '#334155',
          border:  '#334155',
        },
        d: {
          bg:     '#0f172a',
          bg2:    '#1e293b',
          bg3:    '#334155',
          border: '#334155',
          text:   '#f1f5f9',
          text2:  '#94a3b8',
          green:  '#22c55e',
          blue:   '#3b82f6',
          orange: '#f59e0b',
          red:    '#ef4444',
        }
      },
      fontFamily: {
        display: ['-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderColor: {
        'surface-border': '#334155',
      }
    }
  },
  plugins: []
}

export default config