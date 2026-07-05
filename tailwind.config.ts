import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0f",
        panel: "#15151c",
        accent: "#ff3d6e",
        accent2: "#7c5cff",
      },
    },
  },
  plugins: [],
};
export default config;
