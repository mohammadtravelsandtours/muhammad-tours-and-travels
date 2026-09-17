import type { Config } from 'tailwindcss';

/**
 * Admin portal design tokens — a control-room palette (ink navy +
 * amber signal) chosen because this is a dense, data-first operations
 * tool, not a marketing surface. See docs/ARCHITECTURE.md for how this
 * portal differs in purpose from the B2C site.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B0F17',
          900: '#0F1521',
          800: '#161E2E',
          700: '#232D40',
          600: '#374158',
        },
        paper: {
          100: '#E8EAF0',
          300: '#AEB6C7',
          500: '#8993A8',
        },
        signal: {
          DEFAULT: '#E8A33D',
          dim: '#B9822F',
        },
        danger: '#E15B5B',
        ok: '#3FB68B',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
