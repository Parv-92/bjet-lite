const { execSync } = require('child_process');

try {
  execSync('adb shell uiautomator dump /sdcard/window_dump.xml', { stdio: 'inherit' });
  const xml = execSync('adb shell cat /sdcard/window_dump.xml').toString();
  const regex = /<node[^>]+text="([^"]*)"[^>]+content-desc="([^"]*)"[^>]+bounds="(\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\])"[^>]*>/g;
  let match;
  console.log('--- SCREEN ELEMENTS ---');
  while ((match = regex.exec(xml)) !== null) {
    const text = match[1];
    const desc = match[2];
    const bounds = match[3];
    if (text || desc) {
      console.log(`[Text: "${text}"] [Desc: "${desc}"] Bounds: ${bounds}`);
    }
  }
} catch (e) {
  console.error('Error:', e.message);
}
