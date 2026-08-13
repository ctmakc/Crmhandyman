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
        sky: {
          DEFAULT: "var(--sky)",
          ink: "var(--sky-ink)",
          rail: "var(--sky-rail)",
        },
        emerald: {
          DEFAULT: "var(--emerald)",
          ink: "var(--emerald-ink)",
          rail: "var(--emerald-rail)",
        },
        rose: {
          DEFAULT: "var(--rose)",
          ink: "var(--rose-ink)",
          rail: "var(--rose-rail)",
        },
        slate: {
          DEFAULT: "var(--slate)",
          ink: "var(--slate-ink)",
          rail: "var(--slate-rail)",
        },
      },
      /**
       * The type scale deliberately does NOT live here.
       *
       * A `fontSize` entry named `body` compiles to `.text-body`, and `cn()`
       * runs every class list through `tailwind-merge`, which reads `text-<word>`
       * as a colour. On a button spelled `text-body … text-plate` the merge saw
       * two colours, kept the last one and deleted the size — every button in the
       * product silently rendered at the browser's 16px and grew from 38 to 42px.
       * Caught in the after-audit; it typechecks and lints clean either way.
       *
       * The scale is `.t-*` in globals.css instead: unknown to tailwind-merge,
       * so nothing can strip it.
       */
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
      /**
       * Two durations, and the second one is the exception. `duration-[140ms]`
       * spelled by hand in twenty places is how a third and a fourth arrive.
       */
      transitionDuration: {
        fast: "var(--t-fast)",
        instrument: "var(--t)",
      },
    },
  },
  plugins: [],
};
export default config;
