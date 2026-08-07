import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        surfaceAlt: 'var(--color-surface-alt)',
        text: 'var(--color-text)',
        sub: 'var(--color-sub)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        pos: 'var(--color-pos)',
        neg: 'var(--color-neg)',
        onAccent: 'var(--color-on-accent)',
        onAccentSoft: 'var(--color-on-accent-soft)',
        transferBg: 'var(--color-transfer-bg)',
      },
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        input: '12px',
        pill: '20px',
      },
    },
  },
  plugins: [],
} satisfies Config;
