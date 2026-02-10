/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: '#050505',
        paper: '#0a0a0f',
        surface: '#121217',
        cyber: {
          cyan: '#00f0ff',
          purple: '#7000df',
          magenta: '#ff003c',
          green: '#00ff9d',
          orange: '#ff8a00',
          yellow: '#ffd000',
          red: '#ff003c',
        },
        slate: {
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
          500: '#64748b',
          400: '#94a3b8',
          300: '#cbd5e1',
          200: '#e2e8f0',
        }
      },
      fontFamily: {
        heading: ['Outfit', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
