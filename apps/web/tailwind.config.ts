import type { Config } from 'tailwindcss';

/**
 * B2C design tokens. The palette is built around dusk-to-sunset —
 * departure-lounge-at-golden-hour rather than the generic
 * cream-background/terracotta-accent look. One accent (tangerine),
 * used sparingly, against a deep dusk-navy for headings and a warm
 * white ground.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#FBFAF8',
        dusk: {
          900: '#0F1730',
          700: '#1B2745',
          500: '#3A4A72',
        },
        sand: '#EFE9DE',
        tangerine: {
          DEFAULT: '#FF8A3D',
          dim: '#E06F26',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
