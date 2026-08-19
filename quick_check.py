import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://github.com/divakarpandey07/Raftar/releases"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
        html = response.read().decode('utf-8')
        apks = re.findall(r'href="([^"]*download/[^"]*\.apk)"', html)
        releases = re.findall(r'href="([^"]*/releases/tag/[^"]*)"', html)
        print("Releases found:", list(set(releases)))
        print("APK links found:", apks)
except Exception as e:
    print("Error:", e)
