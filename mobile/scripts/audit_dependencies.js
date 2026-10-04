const fs = require('fs');
const path = require('path');

function getFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx']) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, exts));
    } else {
      if (exts.some(ext => file.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const appFiles = getFiles('mobile/app');
const srcFiles = getFiles('mobile/src');
const moduleFiles = getFiles('mobile/modules');
const allFiles = [...appFiles, ...srcFiles, ...moduleFiles];

const pkgJson = JSON.parse(fs.readFileSync('mobile/package.json', 'utf8'));
const deps = Object.keys(pkgJson.dependencies || {});

const usage = {};
deps.forEach(d => usage[d] = []);

// Regex to capture ES import and CommonJS require
const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"])|(?:require\(['"]([^'"]+)['"]\))/g;

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1] || match[2];
    deps.forEach(dep => {
      if (specifier === dep || specifier.startsWith(dep + '/')) {
        usage[dep].push(file.replace(/\\/g, '/'));
      }
    });
  }
});

console.log('=== DIRECT DEPENDENCY USAGE IN SOURCE CODE ===');
deps.forEach(dep => {
  const count = usage[dep].length;
  console.log(`${dep.padEnd(35)} : ${count} occurrences`);
});

console.log('\n=== UNUSED IN JS/TS SOURCE (0 OCCURRENCES) ===');
deps.forEach(dep => {
  if (usage[dep].length === 0) {
    console.log(`- ${dep}`);
  }
});

console.log('\n=== DETAILED USAGE (TOP IMPORT SITES) ===');
deps.forEach(dep => {
  if (usage[dep].length > 0) {
    console.log(`\n[${dep}] (${usage[dep].length} files):`);
    usage[dep].slice(0, 5).forEach(f => console.log(`   ${f}`));
    if (usage[dep].length > 5) {
      console.log(`   ... and ${usage[dep].length - 5} more files`);
    }
  }
});
