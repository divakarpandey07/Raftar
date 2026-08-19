import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://github.com/divakarpandey07/Raftar/releases/tag/v1.0.4"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
        html = response.read().decode('utf-8')
        apk_matches = re.findall(r'href="([^"]*\.apk)"', html)
        print("Found APK download links:", apk_matches)
except Exception as e:
    print("Error:", e)
