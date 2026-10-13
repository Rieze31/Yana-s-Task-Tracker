/** Palette sampled from the PLM Student Commission on Audit seal. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#061a10',     // deepest green, page background
        surface: '#0a2917', // cards
        raised: '#103a22',  // inputs, hover, raised areas
        line: '#1d5334',    // borders (seal green)
        accent: '#ece4b3',  // cream (seal lettering), primary buttons and highlights
        gold: '#c9b458',    // antique gold (seal rim)
        cream: '#f4efd2',   // main text
        silver: '#c4c8c0',  // silver (scales and book), secondary text
        mute: '#8da596',    // muted green-grey, hints and inactive
        danger: '#e0806f',  // only for high priority, overdue, and delete
      },
    },
  },
  plugins: [],
}