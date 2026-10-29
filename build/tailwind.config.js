// Used only to rebuild css/tailwind.css (see build/README.txt)
module.exports = {
  content: ['./shop.html', './index.html', './feedback.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        bacha: {
          matcha: '#4F6E48',
          matchaDark: '#3F5A38',
          matchaLight: '#DDE8D9',
          strawberry: '#FF8A9E',
          berry: '#C2365A',
          berryDark: '#A12D4C',
          pinkLight: '#FFF0F3',
          gingham: '#F9D8DF',
          bg: '#FFF7F9',
          text: '#4A3E3D',
          badge: '#86A77C',
          gcash: '#0066D6'
        }
      },
      fontFamily: {
        cute: ['"Fredoka"', 'cursive', 'sans-serif'],
        body: ['"Quicksand"', 'sans-serif']
      }
    }
  }
};
