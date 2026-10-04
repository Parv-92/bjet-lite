const fs = require('fs');
const cp = require('child_process');

try {
  console.log('Querying Gradle releaseRuntimeClasspath...');
  const res = cp.execSync('.\\gradlew.bat :app:dependencies --configuration releaseRuntimeClasspath', {
    cwd: 'mobile/android',
    maxBuffer: 20 * 1024 * 1024
  }).toString();

  const lines = res.split('\n');
  console.log(`Total dependency lines: ${lines.length}`);
  
  const keywords = ['barcode', 'camera', 'vision', 'text-recognition', 'mlkit', 'play-services'];
  const found = lines.filter(l => keywords.some(k => l.toLowerCase().includes(k)));
  console.log('\n=== MATCHING DEPENDENCIES ===');
  console.log(found.slice(0, 50).join('\n'));
} catch (e) {
  console.error('Error running gradlew:', e.message);
}
