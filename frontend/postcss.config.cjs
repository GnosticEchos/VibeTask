module.exports = {
  plugins: {
    '@tailwindcss/postcss': { from: './src/styles/tailwind.css' },
    autoprefixer: {},
  },
}
console.log('postcss.config.cjs is being loaded');