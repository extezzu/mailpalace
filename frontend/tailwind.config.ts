import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-elevated": "rgb(var(--surface-elevated) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "text-primary": "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary) / <alpha-value>)",
        "text-tertiary": "rgb(var(--text-tertiary) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        urgent: "rgb(var(--urgent) / <alpha-value>)",
        important: "rgb(var(--important) / <alpha-value>)",
        newsletter: "rgb(var(--newsletter) / <alpha-value>)",
        promo: "rgb(var(--promo) / <alpha-value>)",
        transactional: "rgb(var(--transactional) / <alpha-value>)",
        "ai-meta": "rgb(var(--ai-meta) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["1.75rem", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "700" }],
        h1: ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        h2: ["1rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.5" }],
        small: ["0.75rem", { lineHeight: "1.4" }],
        caption: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.01em", fontWeight: "500" }],
      },
      animation: {
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
