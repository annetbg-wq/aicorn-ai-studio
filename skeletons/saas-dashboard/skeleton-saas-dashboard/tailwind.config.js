/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--pm-canvas) / <alpha-value>)',
        foreground: 'rgb(var(--pm-ink) / <alpha-value>)',
        card: 'rgb(var(--pm-surface) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--pm-surface-soft) / <alpha-value>)',
          foreground: 'rgb(var(--pm-muted) / <alpha-value>)',
        },
        border: 'rgb(var(--pm-line) / <alpha-value>)',
        input: 'rgb(var(--pm-line) / <alpha-value>)',
        ring: 'rgb(var(--pm-brand) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--pm-brand) / <alpha-value>)',
          foreground: 'rgb(var(--pm-on-brand) / <alpha-value>)',
        },
        success: 'rgb(var(--pm-success) / <alpha-value>)',
        warning: 'rgb(var(--pm-warning) / <alpha-value>)',
        rose: 'rgb(var(--pm-rose) / <alpha-value>)',
        violet: 'rgb(var(--pm-violet) / <alpha-value>)',
        overlay: 'rgb(var(--pm-overlay) / <alpha-value>)',
      },
      borderRadius: { lg: '0.75rem', md: '0.5rem', sm: '0.375rem' },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
