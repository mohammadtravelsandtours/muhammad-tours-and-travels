import type { Config } from 'tailwindcss';

/** Corporate design tokens — enterprise indigo, distinct from admin
 * (amber), B2C (tangerine), and B2B (teal), so which portal you're in
 * is legible at a glance across screenshots and support tickets. */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#F8F8FC',
        graphite: { 900: '#191A2B', 700: '#33344D', 500: '#65667F' },
        indigo: { DEFAULT: '#4C4FE0', dim: '#3A3DBE' },
        line: '#E2E2ED',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
