import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./templates/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tenant-customizable colors driven by CSS variables
        brand: {
          primary: "var(--brand-primary, #3b82f6)",
          secondary: "var(--brand-secondary, #8b5cf6)",
          accent: "var(--brand-accent, #f59e0b)",
        },
      },
      fontFamily: {
        sans: ["var(--brand-font, system-ui)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
