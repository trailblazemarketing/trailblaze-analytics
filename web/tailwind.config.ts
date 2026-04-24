import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tb: {
          blue: "var(--tb-blue)",
          purple: "var(--tb-purple)",
          bg: "var(--tb-bg)",
          surface: "var(--tb-surface)",
          border: "var(--tb-border)",
          text: "var(--tb-text)",
          muted: "var(--tb-text-muted)",
          success: "var(--tb-success)",
          beacon: "var(--tb-beacon)",
          narrative: "var(--tb-narrative)",
          danger: "var(--tb-danger)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
