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
      },
      fontFamily: {
        display: ['-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    }
  },
  plugins: []
}

export default config
