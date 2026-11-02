import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/presentation/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand Semantic Tokens (Pajarita Store: Plum & Warm Gold)
        brand: {
          primary: '#582452', // Deep Royal Plum
          primaryLight: '#7E3170',
          accent: '#EAA824', // Warm Honey Gold from bird logo
          accentDark: '#CF8A0F',
          surface: '#FAF5F7',
        },
        // Deep Plum palette (mapped to moss for 100% compatibility with existing codebase)
        moss: {
          DEFAULT: '#582452', // Deep Royal Plum
          50: '#FDF8FA',
          100: '#FAF2F6',
          200: '#F2DFEC',
          300: '#E4BEDB',
          400: '#CE93C2',
          500: '#A45395',
          600: '#7E3170',
          700: '#642759',
          800: '#582452', // Primary Brand
          900: '#3D1537',
          950: '#260B22',
        },
        royal: {
          DEFAULT: '#582452',
          50: '#FDF8FA',
          100: '#FAF2F6',
          200: '#F2DFEC',
          300: '#E4BEDB',
          400: '#CE93C2',
          500: '#A45395',
          600: '#7E3170',
          700: '#642759',
          800: '#582452',
          900: '#3D1537',
          950: '#260B22',
        },
        navy: {
          DEFAULT: '#3D1537',
          dark: '#260B22',
          muted: '#4D1D45',
        },
        azure: {
          DEFAULT: '#EAA824',
          light: '#FCE498',
          dark: '#CF8A0F',
        },
        // Warm Honey / Gold Accents (Pajarita bird logo & 'Moda que vuela a ti')
        mustard: {
          DEFAULT: '#EAA824',
          50: '#FFFDF5',
          100: '#FEF9E7',
          200: '#FDF0C5',
          300: '#FCE498',
          400: '#F9D15D',
          500: '#EAA824',
          600: '#CF8A0F',
          700: '#A66607',
          800: '#844D0C',
          900: '#6E3F0F',
        },
        // Delicate porcelain blush surfaces
        eggshell: {
          DEFAULT: '#F5ECF1',
          50: '#FCF9FA',
          100: '#FAF5F7',
          200: '#F5ECF1',
          300: '#EADCE4',
          400: '#D5BFCF',
        },
        surface: {
          DEFAULT: '#FAF5F7', // Soft porcelain blush
          soft: '#F4ECF1',
          card: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#220B1F', // Deep rich plum-charcoal (high contrast, ultra-sharp)
          muted: '#634E60',   // Refined plum slate
          subtle: '#968193',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'erp-sm': '0 1px 3px rgba(38, 11, 34, 0.03), 0 1px 2px rgba(38, 11, 34, 0.02)',
        'erp-md': '0 4px 16px rgba(38, 11, 34, 0.04), 0 1px 3px rgba(38, 11, 34, 0.02)',
        'erp-lg': '0 10px 30px rgba(38, 11, 34, 0.06), 0 2px 6px rgba(38, 11, 34, 0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
