import type { Config } from "tailwindcss";

/**
 * Tailwind CSS Configuration
 * Design System: "Midnight Glass"
 * 
 * Note: Tailwind CSS v4 primarily uses @theme in globals.css
 * This config file is for extending functionality and plugins
 */
const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Intelly Pastel Design System Colors
        background: "var(--background)",
        foreground: "var(--foreground)",

        sidebar: {
          DEFAULT: "var(--sidebar-bg)",
          foreground: "var(--sidebar-fg)",
        },

        // Pastel Accents
        pastel: {
          rose: "var(--pastel-pink)",
          yellow: "var(--pastel-yellow)",
          green: "var(--pastel-green)",
          blue: "var(--pastel-blue)",
          purple: "var(--pastel-purple)",
        },

        // Semantic Colors re-mapped to Pastel Theme
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-fg)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-fg)",
        },
        financial: {
          DEFAULT: "var(--financial)",
          foreground: "var(--financial-fg)",
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
        border: "var(--border)",
        "border-hover": "var(--border-hover)",

        // Keep status colors for utility
        success: "var(--status-success)",
        warning: "var(--status-warning)",
        error: "var(--status-error)",
        info: "var(--status-info)",
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
