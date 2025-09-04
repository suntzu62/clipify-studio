import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 100%)",
        foreground: "hsl(240 10% 3.9%)",
        primary: {
          DEFAULT: "#7c3aed",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#f4f4f5",
          foreground: "#6b7280",
        },
        border: "#e5e7eb",
        accent: "#f5f3ff",
      },
      borderRadius: {
        lg: "0.5rem",
      },
    },
  },
  plugins: [],
};

export default config;

