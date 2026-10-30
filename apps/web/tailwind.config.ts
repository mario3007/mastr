import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        studio: {
          950: "#090a0f",
          900: "#0e1117",
          850: "#131722",
          800: "#1b202e",
          700: "#283044",
          600: "#3d4863",
          500: "#5d6d93",
          400: "#8898be",
          300: "#b5c2e2",
          200: "#dce3f5",
          100: "#f0f4fc",
        },
        accent: {
          cyan: "#00f0ff",
          amber: "#ffaa00",
          purple: "#9d4edd",
          emerald: "#10b981",
        },
      },
      backgroundImage: {
        "radial-studio": "radial-gradient(circle at 50% 20%, rgba(27, 32, 46, 0.8) 0%, rgba(9, 10, 15, 1) 100%)",
        "metal-knob": "conic-gradient(from 180deg at 50% 50%, #71717a 0deg, #d4d4d8 60deg, #71717a 120deg, #e4e4e7 180deg, #71717a 240deg, #d4d4d8 300deg, #71717a 360deg)",
      },
    },
  },
  plugins: [],
};
export default config;
