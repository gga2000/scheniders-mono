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
        // Intelly Pastel Design System Colors
        background: "#FDFBF7", // Cream/Beige
        foreground: "#1E1E1E", // Dark Grey/Black text

        sidebar: {
          DEFAULT: "#1E1E1E",
          foreground: "#FFFFFF",
        },

        // Pastel Accents
        pastel: {
          rose: "#F4C7CF",
          yellow: "#FBE38E",
          green: "#C0EBA6",
          blue: "#A6C8FF",
          purple: "#E4C1F9",
        },

        // Semantic Colors re-mapped to Pastel Theme
        primary: {
          DEFAULT: "#1E1E1E", // Primary actions are often dark in this theme
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "#F4C7CF", // Pastel Rose for negative/warn
          foreground: "#1E1E1E",
        },
        financial: {
          DEFAULT: "#FBE38E", // Pastel Yellow
          foreground: "#1E1E1E",
        },

        // Neutral scale (Warm Greys)
        zinc: {
          50: "#FAFAF9",
          100: "#F5F5F4",
          200: "#E7E5E4",
          300: "#D6D3D1",
          400: "#A8A29E",
          500: "#78716C",
          600: "#57534E",
          700: "#44403C",
          800: "#292524",
          900: "#1C1917",
          950: "#0C0A09",
        },

        // Border colors
        border: "#E7E5E4",
        "border-hover": "#D6D3D1",

        // Keep status colors for utility
        success: "#C0EBA6",
        warning: "#FBE38E",
        error: "#F4C7CF",
        info: "#A6C8FF",
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
