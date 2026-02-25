/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#060708',
        surface: '#0f0f12',
        border: '#1a1a24',
        'text-primary': '#f0f0f0',
        'text-muted': '#6b6b80',
        accent: {
          purple: '#9b59b6',
          orange: '#e67e22',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
