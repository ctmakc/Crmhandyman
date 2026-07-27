import type { Config } from "tailwindcss";

/**
 * Tokens are law — see DESIGN.md. Tailwind here is only a thin alias layer over
 * the CSS custom properties in globals.css. No palette scales, no shadows.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "var(--navy-900)",
          800: "var(--navy-800)",
          700: "var(--navy-700)",
        },
        deck: "var(--deck)",
        sunk: "var(--sunk)",
        plate: "var(--plate)",
        line: "var(--line)",
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          rail: "var(--rail-ink)",
        },
        amber: {
          DEFAULT: "var(--amber)",
          ink: "var(--amber-ink)",
        },
        sky: "var(--sky)",
        emerald: "var(--emerald)",
        rose: {
          DEFAULT: "var(--rose)",
          ink: "var(--rose-ink)",
        },
        slate: "var(--slate)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "var(--r)",
        sm: "var(--r)",
        md: "var(--r)",
        lg: "var(--r)",
        xl: "var(--r)",
        full: "999px",
      },
      boxShadow: {
        // Depth in this system is a hairline, a recess or a spine — never a shadow.
        none: "none",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
        instrument: "var(--ease)",
      },
    },
  },
  plugins: [],
};
export default config;
