import type { Config } from "tailwindcss";

/**
 * Tailwind CSS Configuration
 * Design System: "Midnight Glass"
 * 
 * Note: Tailwind CSS v4 primarily uses @theme in globals.css
 * This config file is for extending functionality and plugins
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Midnight Glass Design System Colors
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        
        // Surface colors
        surface: "var(--color-surface)",
        "surface-solid": "var(--color-surface-solid)",
        
        // Brand colors
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          foreground: "var(--color-primary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--color-destructive)",
          hover: "var(--color-destructive-hover)",
          foreground: "var(--color-destructive-foreground)",
        },
        financial: {
          DEFAULT: "var(--color-financial)",
          hover: "var(--color-financial-hover)",
          foreground: "var(--color-financial-foreground)",
        },
        
        // Zinc scale
        zinc: {
          50: "var(--color-zinc-50)",
          100: "var(--color-zinc-100)",
          200: "var(--color-zinc-200)",
          300: "var(--color-zinc-300)",
          400: "var(--color-zinc-400)",
          500: "var(--color-zinc-500)",
          600: "var(--color-zinc-600)",
          700: "var(--color-zinc-700)",
          800: "var(--color-zinc-800)",
          900: "var(--color-zinc-900)",
          950: "var(--color-zinc-950)",
        },
        
        // Border colors
        border: "var(--color-border)",
        "border-hover": "var(--color-border-hover)",
        
        // Status colors
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        error: "var(--color-error)",
        info: "var(--color-info)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      backdropBlur: {
        glass: "var(--backdrop-blur-glass)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-in-up": "slideInUp 0.3s ease-out",
        "slide-in-down": "slideInDown 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
