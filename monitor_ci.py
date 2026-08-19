import urllib.request
import time
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://github.com/divakarpandey07/Raftar/releases/tag/v1.0.4"
print(f"Monitoring release URL: {url}")

for i in range(1, 15):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            html = response.read().decode('utf-8')
            if ".apk" in html or "RAFTAR" in html:
                print(f"[{i}] SUCCESS: Release tag v1.0.4 found!")
                if ".apk" in html:
                    print("--> APK file asset is AVAILABLE for download!")
                break
    except urllib.error.HTTPError as e:
        print(f"[{i}] Build in progress... (HTTP {e.code})")
    except Exception as e:
        print(f"[{i}] Waiting for runner... ({e})")
    time.sleep(10)
