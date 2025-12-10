import type { Config } from "tailwindcss";

const config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [], // <- here: empty array instead of {}
} satisfies Config;

export default config;
