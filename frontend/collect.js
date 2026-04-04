const fs = require('fs');
const path = require('path');

// Конфигурация
const outputFileName = 'all_project_files.txt';
const includeDirs = ['src']; // Какие папки сканировать
const extensions = ['.ts', '.tsx', '.css', '.js', '.jsx']; // Какие расширения брать
const ignoreFiles = ['index.css', 'vite-env.d.ts']; // Что игнорировать

let combinedContent = '';

function readDir(dirPath) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      readDir(fullPath); // Рекурсия
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext) && !ignoreFiles.includes(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        combinedContent += `\n\n// === FILE: ${fullPath} ===\n\n`;
        combinedContent += content;
        console.log(`✅ Добавлен: ${fullPath}`);
      }
    }
  });
}

console.log('🚀 Начинаю сборку файлов...');
includeDirs.forEach(dir => readDir(path.join(__dirname, dir)));

fs.writeFileSync(outputFileName, combinedContent);
console.log(`\n✨ Готово! Все файлы собраны в: ${outputFileName}`);