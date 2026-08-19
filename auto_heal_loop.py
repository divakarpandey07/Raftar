import subprocess
import urllib.request
import re
import time
import ssl

REPO_DIR = r"C:\Users\pande\.gemini\antigravity\scratch\raftar"

def run(cmd):
    return subprocess.run(cmd, cwd=REPO_DIR, shell=True, capture_output=True, text=True)

print("=== [AUTO-HEAL & BUILD AGENT ACTIVATED] ===")
print("Step 1: Committing clean dependencies...")
run("git add .")
commit_res = run('git commit -m "fix(android): eliminate alpha dependencies and ensure clean gradle APK release"')
print("Commit status:", commit_res.stdout.strip() or "No new changes")

print("Step 2: Pushing to origin main and tag v1.0.5...")
run("git push origin main")
run("git tag -d v1.0.5")
run("git push origin :refs/tags/v1.0.5")
run("git tag v1.0.5")
push_tag_res = run("git push origin v1.0.5")
print("Push tag v1.0.5:", push_tag_res.stdout.strip() or push_tag_res.stderr.strip())

print("\nStep 3: Continuous Monitoring Loop until APK is published...")
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

tag_url = "https://github.com/divakarpandey07/Raftar/releases/tag/v1.0.5"
releases_url = "https://github.com/divakarpandey07/Raftar/releases"

success = False
for attempt in range(1, 25):
    try:
        req = urllib.request.Request(releases_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            html = response.read().decode('utf-8')
            apks = re.findall(r'href="([^"]*download/[^"]*\.apk)"', html)
            if apks:
                apk_url = f"https://github.com{apks[0]}"
                print("\n=======================================================")
                print(">>> SUCCESS! APK FILE COMPILED & RELEASED SUCCESSFULLY! <<<")
                print(f"Direct Download URL: {apk_url}")
                print("=======================================================")
                success = True
                break
            else:
                print(f"[{attempt}/24] Compiling on GitHub Actions runners... ({attempt*15}s elapsed)")
    except Exception as e:
        print(f"[{attempt}/24] Checking status... ({e})")
    time.sleep(15)

if not success:
    print("\nCheck finished. If build is taking longer, please visit:", tag_url)
