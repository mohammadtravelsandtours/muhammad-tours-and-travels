import type { Config } from 'tailwindcss';

/** B2B design tokens — a working tool for agents, not a storefront:
 * light, calm, teal accent (distinct from the admin amber and B2C
 * tangerine so the portal is visually identifiable at a glance). */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#F7F9F9',
        slate: { 900: '#132022', 700: '#294044', 500: '#5C7276' },
        teal: { DEFAULT: '#0F9B8E', dim: '#0C7C72' },
        line: '#DCE4E3',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
