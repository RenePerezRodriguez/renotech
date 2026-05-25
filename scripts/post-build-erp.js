const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const erpDir = path.join(rootDir, 'apps', 'erp');
const standaloneDir = path.join(erpDir, '.next', 'standalone');
const nestedAppDir = path.join(standaloneDir, 'apps', 'erp');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

console.log('Running post-build script for ERP...');
console.log('Root Directory:', rootDir);
console.log('ERP Directory:', erpDir);
console.log('Standalone Directory:', standaloneDir);
console.log('Nested App Directory:', nestedAppDir);

// 1. Copy static folder to nestedAppDir/.next/static
const staticSrc = path.join(erpDir, '.next', 'static');
const staticDest = path.join(nestedAppDir, '.next', 'static');
if (fs.existsSync(staticSrc)) {
  copyFolderSync(staticSrc, staticDest);
  console.log('Copied static assets');
} else {
  console.log('Static assets not found');
}

// 2. Copy public folder to nestedAppDir/public
const publicSrc = path.join(erpDir, 'public');
const publicDest = path.join(nestedAppDir, 'public');
if (fs.existsSync(publicSrc)) {
  copyFolderSync(publicSrc, publicDest);
  console.log('Copied public assets');
} else {
  console.log('Public assets not found');
}

console.log('ERP post-build completed successfully!');
