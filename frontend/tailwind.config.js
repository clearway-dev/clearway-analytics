/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#2c3e50',
        'success': '#2ecc71',
        'danger': '#e74c3c',
      },
      zIndex: {
        'map': '400',
        'header': '1000',
      },
    },
  },
  plugins: [],
}