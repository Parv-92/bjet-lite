import os
import sys
import zipfile
import subprocess

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SOURCE_APK = os.path.join(BASE_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
BUNDLE_HBC = os.path.join(BASE_DIR, 'index.android.bundle.hbc')
UPDATED_APK = os.path.join(BASE_DIR, 'bjet-lite-updated.apk')
ALIGNED_APK = os.path.join(BASE_DIR, 'bjet-lite-aligned.apk')
KEYSTORE = os.path.join(BASE_DIR, 'android', 'app', 'debug.keystore')

BUILD_TOOLS = r'C:\Users\parvc\AppData\Local\Android\Sdk\build-tools\35.0.0'
ZIPALIGN = os.path.join(BUILD_TOOLS, 'zipalign.exe')
APKSIGNER = os.path.join(BUILD_TOOLS, 'apksigner.bat')

print(f"Reading source APK: {SOURCE_APK}")
print(f"Injecting bundle: {BUNDLE_HBC}")

with open(BUNDLE_HBC, 'rb') as f:
    bundle_data = f.read()

# Create updated APK
with zipfile.ZipFile(SOURCE_APK, 'r') as zin, zipfile.ZipFile(UPDATED_APK, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        # Skip old signatures and old bundle
        if item.filename.startswith('META-INF/') and (item.filename.endswith('.SF') or item.filename.endswith('.RSA') or item.filename.endswith('.MF')):
            continue
        if item.filename == 'assets/index.android.bundle':
            continue
        zout.writestr(item, zin.read(item.filename))
    
    # Write new bundle
    zout.writestr('assets/index.android.bundle', bundle_data)

print(f"Created unaligned APK: {UPDATED_APK}")

# Run zipalign
print(f"Running zipalign...")
res = subprocess.run([ZIPALIGN, '-p', '-f', '4', UPDATED_APK, ALIGNED_APK], capture_output=True, text=True)
if res.returncode != 0:
    print(f"Zipalign failed: {res.stderr}")
    sys.exit(1)
print(f"Created aligned APK: {ALIGNED_APK}")

# Run apksigner
print(f"Signing APK...")
sign_cmd = [
    APKSIGNER, 'sign',
    '--ks', KEYSTORE,
    '--ks-pass', 'pass:android',
    '--ks-key-alias', 'androiddebugkey',
    '--key-pass', 'pass:android',
    ALIGNED_APK
]
res = subprocess.run(sign_cmd, capture_output=True, text=True)
if res.returncode != 0:
    print(f"Apksigner failed: {res.stderr}")
    sys.exit(1)
print(f"Signed APK successfully!")

# Verify APK
print(f"Verifying APK...")
res = subprocess.run([APKSIGNER, 'verify', '--verbose', ALIGNED_APK], capture_output=True, text=True)
if res.returncode != 0:
    print(f"Verification failed: {res.stderr}")
    sys.exit(1)
print(res.stdout)
print("SUCCESS: APK repackaged, aligned, signed, and verified!")
