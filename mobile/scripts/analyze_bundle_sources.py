import json
import os
from collections import defaultdict

smap_path = 'mobile/android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map'
bundle_path = 'mobile/android/app/build/generated/assets/react/release/index.android.bundle'

if not os.path.exists(smap_path):
    print("Sourcemap not found!")
    exit(1)

with open(smap_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

sources = data.get('sources', [])
sources_content = data.get('sourcesContent', [])

print(f"Total source files in sourcemap: {len(sources)}")

# Measure size per source
package_sizes = defaultdict(int)
file_sizes = []

for idx, src in enumerate(sources):
    size = len(sources_content[idx].encode('utf-8')) if idx < len(sources_content) and sources_content[idx] else 0
    file_sizes.append((src, size))
    
    # Categorize by top-level package or app code
    if '/node_modules/' in src:
        parts = src.split('/node_modules/')[1].split('/')
        if parts[0].startswith('@'):
            pkg = parts[0] + '/' + parts[1]
        else:
            pkg = parts[0]
    elif src.startswith('/modules/'):
        pkg = 'local:' + src.split('/modules/')[1].split('/')[0]
    elif src.startswith('/src/') or src.startswith('/app/'):
        pkg = 'app-code'
    else:
        pkg = 'other'
    package_sizes[pkg] += size

print("\n=== TOP 25 PACKAGES BY SOURCE SIZE IN RELEASE BUNDLE ===")
sorted_pkgs = sorted(package_sizes.items(), key=lambda x: x[1], reverse=True)
for pkg, sz in sorted_pkgs[:25]:
    print(f"{pkg:<35} : {sz:>10,} bytes ({sz/(1024*1024):>5.2f} MB)")

print("\n=== TOP 20 INDIVIDUAL SOURCE FILES BY SIZE ===")
sorted_files = sorted(file_sizes, key=lambda x: x[1], reverse=True)
for fpath, sz in sorted_files[:20]:
    print(f"{fpath:<70} : {sz:>10,} bytes ({sz/(1024*1024):>5.2f} MB)")
