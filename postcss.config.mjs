// PostCSS pipeline for Next.js 15 + Tailwind v4.
//
// Tailwind v4 ships its own PostCSS plugin (``@tailwindcss/postcss``) — no
// separate ``autoprefixer`` step is needed; v4 handles vendor prefixing
// internally.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
