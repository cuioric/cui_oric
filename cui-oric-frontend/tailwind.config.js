/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { 50: '#f6f3fb', 100: '#eee8f8', 200: '#dfd3ef', 500: '#6640a5', 600: '#563390', 700: '#4B2884', 800: '#3d206c' }, cui: { blue: '#115EA6', pale: '#edf6fd' } },
      boxShadow: { panel: '0 1px 3px rgba(15, 23, 42, .08), 0 8px 24px rgba(15, 23, 42, .04)' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
