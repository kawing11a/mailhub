const fs = require('fs');
const path = require('path');

const generatedImagePath = 'C:\\Users\\chank\\.gemini\\antigravity-ide\\brain\\b8ee0223-ab48-4d38-bb4b-b750f134417f\\pwa_icon_1784875279846.png';
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

if (fs.existsSync(generatedImagePath)) {
  fs.copyFileSync(generatedImagePath, path.join(iconsDir, 'icon-192.png'));
  fs.copyFileSync(generatedImagePath, path.join(iconsDir, 'icon-512.png'));
  fs.copyFileSync(generatedImagePath, path.join(iconsDir, 'maskable-512.png'));
  fs.copyFileSync(generatedImagePath, path.join(iconsDir, 'apple-touch-icon.png'));
  console.log('Successfully updated PWA icons from generated image!');
} else {
  console.error('Generated image file not found at:', generatedImagePath);
}
