const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pdfMjsPath = path.join(rootDir, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const pdfWorkerMjsPath = path.join(rootDir, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');

let patchedAny = false;

if (fs.existsSync(pdfMjsPath)) {
  let content = fs.readFileSync(pdfMjsPath, 'utf8');
  if (content.includes('const worker = await import(')) {
    content = content.replace(
      /const worker = await import\([\s\S]*?this\.workerSrc\);/,
      'const worker = await Promise.reject(new Error("Hermes AOT: dynamic import not supported")).catch(() => null);'
    );
    fs.writeFileSync(pdfMjsPath, content, 'utf8');
    console.log('[Patch] Successfully patched pdf.mjs for Hermes AOT compilation');
    patchedAny = true;
  } else {
    console.log('[Patch] pdf.mjs already patched or dynamic import not found');
  }
} else {
  console.warn('[Patch] pdf.mjs not found at:', pdfMjsPath);
}

if (fs.existsSync(pdfWorkerMjsPath)) {
  let content = fs.readFileSync(pdfWorkerMjsPath, 'utf8');
  if (content.includes('const mod = await import(')) {
    content = content.replace(
      /const mod = await import\([\s\S]*?path\);/,
      'const mod = await Promise.reject(new Error("Hermes AOT: dynamic import not supported")).catch(() => null);'
    );
    fs.writeFileSync(pdfWorkerMjsPath, content, 'utf8');
    console.log('[Patch] Successfully patched pdf.worker.mjs for Hermes AOT compilation');
    patchedAny = true;
  } else {
    console.log('[Patch] pdf.worker.mjs already patched or dynamic import not found');
  }
} else {
  console.warn('[Patch] pdf.worker.mjs not found at:', pdfWorkerMjsPath);
}

console.log('[Patch] PDF.js Hermes compatibility check completed.');
