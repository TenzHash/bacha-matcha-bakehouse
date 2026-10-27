REBUILDING css/tailwind.css  (only needed if you add NEW Tailwind classes to index.html or js/*.js)
  1. Install Node.js once.
  2. In this folder's parent (the bacha/ folder):  npx tailwindcss@3.4.17 -c build/tailwind.config.js -i build/input.css -o css/tailwind.css --minify
Day-to-day use (changing text, prices, settings in the admin app) never needs this.
