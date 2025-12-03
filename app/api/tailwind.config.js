/** @type {import('tailwindcss').Config} */
module.exports = {
  // On contrôle le thème sombre avec la classe "dark" sur <html>
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
