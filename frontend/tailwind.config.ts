import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        fog: "#E5E7EB",
        mist: "#F8FAFC",
        ember: "#C2410C",
        pine: "#14532D",
        sky: "#0F766E"
      }
    }
  },
  plugins: []
};

export default config;

