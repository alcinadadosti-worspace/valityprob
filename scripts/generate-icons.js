/**
 * Script para gerar ícones PWA a partir do logo.png
 *
 * Uso: npm run generate-icons
 *
 * Requer: npm install sharp --save-dev
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputPath = path.join(__dirname, '..', 'src', 'public', 'logo.png');
const outputDir = path.join(__dirname, '..', 'src', 'public', 'icons');

// Garante que o diretório de saída existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  console.log('Gerando ícones PWA...');

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

    try {
      await sharp(inputPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 10, g: 10, b: 10, alpha: 1 } // #0a0a0a
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ Gerado: icon-${size}x${size}.png`);
    } catch (err) {
      console.error(`✗ Erro ao gerar icon-${size}x${size}.png:`, err.message);
    }
  }

  console.log('\nÍcones gerados com sucesso em src/public/icons/');
}

generateIcons().catch(console.error);
