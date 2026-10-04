import zipfile
import sys
import os
from collections import defaultdict

def analyze_apk(apk_path):
    if not os.path.exists(apk_path):
        print(f"File not found: {apk_path}")
        return

    apk_size = os.path.getsize(apk_path)
    print("=" * 80)
    print(f"APK ANALYSIS: {os.path.basename(apk_path)}")
    print(f"Full Path: {apk_path}")
    print(f"Total APK File Size: {apk_size:,} bytes ({apk_size / (1024*1024):.2f} MB)")
    print("=" * 80)

    categories = defaultdict(int)
    compressed_categories = defaultdict(int)
    so_by_abi = defaultdict(lambda: defaultdict(int))
    dex_files = []
    assets_files = []

    with zipfile.ZipFile(apk_path, 'r') as z:
        for info in z.infolist():
            name = info.filename
            size = info.file_size
            comp_size = info.compress_size

            if name.startswith('lib/'):
                parts = name.split('/')
                if len(parts) >= 3:
                    abi = parts[1]
                    so_name = parts[2]
                    so_by_abi[abi][so_name] = (size, comp_size)
                categories['Native Libraries (lib/)'] += size
                compressed_categories['Native Libraries (lib/)'] += comp_size
            elif name.startswith('classes') and name.endswith('.dex'):
                dex_files.append((name, size, comp_size))
                categories['DEX Code (classes*.dex)'] += size
                compressed_categories['DEX Code (classes*.dex)'] += comp_size
            elif name.startswith('assets/'):
                assets_files.append((name, size, comp_size))
                categories['Assets (assets/)'] += size
                compressed_categories['Assets (assets/)'] += comp_size
            elif name.startswith('res/'):
                categories['Resources (res/)'] += size
                compressed_categories['Resources (res/)'] += comp_size
            elif name == 'resources.arsc':
                categories['Resource Table (resources.arsc)'] += size
                compressed_categories['Resource Table (resources.arsc)'] += comp_size
            else:
                categories['Other (Manifest, META-INF, etc.)'] += size
                compressed_categories['Other (Manifest, META-INF, etc.)'] += comp_size

    print("\n--- HIGH-LEVEL SIZE BREAKDOWN ---")
    print(f"{'Category':<40} {'Uncompressed':<18} {'Compressed in APK':<18}")
    print("-" * 76)
    for cat in sorted(categories.keys(), key=lambda x: compressed_categories[x], reverse=True):
        u_sz = categories[cat]
        c_sz = compressed_categories[cat]
        print(f"{cat:<40} {u_sz:>10,} B ({u_sz/(1024*1024):>5.2f}MB)   {c_sz:>10,} B ({c_sz/(1024*1024):>5.2f}MB)")

    print("\n--- DEX BREAKDOWN ---")
    for name, u_sz, c_sz in dex_files:
        print(f"{name:<30} {u_sz:>10,} B ({u_sz/(1024*1024):>5.2f}MB)   compressed: {c_sz:>10,} B ({c_sz/(1024*1024):>5.2f}MB)")

    print("\n--- ASSETS BREAKDOWN (Top items) ---")
    assets_files.sort(key=lambda x: x[1], reverse=True)
    for name, u_sz, c_sz in assets_files[:15]:
        print(f"{name:<45} {u_sz:>10,} B ({u_sz/(1024*1024):>5.2f}MB)   compressed: {c_sz:>10,} B ({c_sz/(1024*1024):>5.2f}MB)")

    print("\n--- NATIVE LIBRARIES (.so) BY ABI ---")
    for abi, so_dict in so_by_abi.items():
        total_abi_uncomp = sum(x[0] for x in so_dict.values())
        total_abi_comp = sum(x[1] for x in so_dict.values())
        print(f"\n[ABI: {abi}] Total: {total_abi_uncomp:,} B uncompressed, {total_abi_comp:,} B compressed ({len(so_dict)} .so files)")
        sorted_sos = sorted(so_dict.items(), key=lambda x: x[1][0], reverse=True)
        print(f"   {'Shared Object (.so)':<45} {'Uncompressed':<18} {'Compressed':<18}")
        print("   " + "-" * 75)
        for so_name, (u_sz, c_sz) in sorted_sos:
            print(f"   {so_name:<45} {u_sz:>10,} B ({u_sz/(1024*1024):>5.2f}MB)   {c_sz:>10,} B ({c_sz/(1024*1024):>5.2f}MB)")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        analyze_apk(sys.argv[1])
    else:
        print("Usage: python analyze_apk.py <path_to_apk>")
