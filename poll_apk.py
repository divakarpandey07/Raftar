import urllib.request
import re
import time
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://github.com/divakarpandey07/Raftar/releases/tag/v1.0.4"
print("Polling GitHub Actions build for tag v1.0.4 APK...")

for attempt in range(1, 15):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            html = response.read().decode('utf-8')
            apks = re.findall(r'href="([^"]*download/[^"]*\.apk)"', html)
            if apks:
                print(f"\n🎉 SUCCESS! APK is compiled & published: https://github.com{apks[0]}")
                break
            else:
                print(f"[{attempt}/15] Build still compiling on GitHub Actions runners... ({attempt*15}s elapsed)")
    except Exception as e:
        print(f"[{attempt}/15] Waiting... ({e})")
    time.sleep(15)
