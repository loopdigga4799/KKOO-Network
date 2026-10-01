/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff8f1',
          600: '#1d7a3e',
          700: '#166531',
        },
        success: { 50: '#f0fdf4', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 600: '#d97706', 700: '#b45309' },
        danger: { 50: '#fef2f2', 600: '#dc2626', 700: '#b91c1c' },
      },
    },
  },
  plugins: [],
};
