/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Gallery chrome — neutral and fixed. The artwork carries the colour, so
        // the chrome stays paper and a cream "Light" poster is never stranded in
        // dark UI.
        wall:  '#F4F1EB',
        mat:   '#FBFAF7',
        ink:   '#1D1B17',
        muted: '#8B857A',
        line:  'rgba(29,27,23,0.14)',
        frame: '#191919',
        // Adapts to the active artwork preset; set as a CSS var on the app root.
        accent: 'var(--accent)',
      },
      fontFamily: {
        sans: ['Jost', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        md: '3px',
      },
      boxShadow: {
        frame: '0 34px 78px -22px rgba(0,0,0,.5)',
        sheet: '0 -14px 40px rgba(0,0,0,.28)',
      },
    },
  },
  plugins: [],
}
