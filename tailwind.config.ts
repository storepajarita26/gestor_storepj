import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/presentation/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Royal & Cobalt Blue palette inspired by reference image
        moss: {
          DEFAULT: '#1E3A8A', // Deep Royal Blue
          50: '#F0F7FF',
          100: '#E0EFFF',
          200: '#BAE0FF',
          300: '#7CC2FF',
          400: '#38A3FF',
          500: '#2563EB', // Cobalt Blue
          600: '#1D4ED8',
          700: '#1E40AF',
          800: '#1E3A8A', // Royal Blue
          900: '#172554', // Dark Sapphire
          950: '#0F172A',
        },
        // Sky & Ice Blue Accents
        mustard: {
          DEFAULT: '#38BDF8',
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
        // Pastel Blue surfaces
        eggshell: {
          DEFAULT: '#E2EAF4',
          50: '#F8FAFC',
          100: '#F0F5FA',
          200: '#E2EAF4',
          300: '#CBD5E1',
          400: '#94A3B8',
        },
        surface: {
          DEFAULT: '#F0F5FA',
          soft: '#E8F0F8',
          card: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#475569',
          subtle: '#94A3B8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'erp-sm': '0 1px 3px rgba(15, 23, 42, 0.03), 0 1px 2px rgba(15, 23, 42, 0.02)',
        'erp-md': '0 4px 16px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.02)',
        'erp-lg': '0 10px 30px rgba(15, 23, 42, 0.06), 0 2px 6px rgba(15, 23, 42, 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
