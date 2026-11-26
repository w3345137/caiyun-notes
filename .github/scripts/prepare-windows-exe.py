"""Download and verify a released Windows direct installer."""
import base64
import hashlib
import json
import os
import pathlib
import re
import subprocess
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, build_opener

out = pathlib.Path("windows-exe-stage")
out.mkdir()
match = re.compile(r"_(\d+\.\d+\.\d+)_x64-setup\.exe")
repo = "w3345137/caiyun-notes"
releases = subprocess.check_output([
    "gh", "api", "--paginate", "--slurp", f"repos/{repo}/releases?per_page=100",
])

candidates = []
for page in json.loads(releases):
    for release in page:
        if release["draft"] or release["prerelease"]:
            continue
        assets = {item["name"]: item for item in release["assets"]}
        for name in assets:
            version = match.fullmatch(name)
            if version and name + ".sig" in assets and "candidate-report.json" in assets:
                candidates.append((tuple(map(int, version[1].split("."))), release, name, assets))
if not candidates:
    raise SystemExit("No official signed Windows EXE releases found")

_, release, name, assets = max(candidates, key=lambda item: item[0])
version = match.fullmatch(name)[1]
if "windows-certification.json" not in assets:
    raise SystemExit("Latest Windows candidate lacks Authenticode qualification. Keeping the current mirror.")
for asset in (name, name + ".sig", "candidate-report.json", "windows-certification.json"):
    path = out / asset
    asset_id = assets[asset]["id"]
    with path.open("wb") as stream:
        subprocess.run(["gh", "api", "-H", "Accept: application/octet-stream",
                        f"repos/{repo}/releases/assets/{asset_id}"], stdout=stream, check=True)
    digest = assets[asset].get("digest")
    if digest and digest != "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest():
        raise SystemExit(f"GitHub asset digest mismatch: {asset}")

report = json.loads((out / "candidate-report.json").read_bytes())
item = report["updater"]["windows-x86_64"]
sha = hashlib.sha256((out / name).read_bytes()).hexdigest()
if (report["version"], item["package"], item["publishName"], item["signatureFile"],
        report["expected_sha256"][name]) != (version, name, name, name + ".sig", sha):
    raise SystemExit("Signed release report and Windows package disagree")
cert = json.loads((out / "windows-certification.json").read_bytes())
signer = os.environ.get("SIGNER", "").lower()
if not signer or (cert["version"], cert["installerSha256"].lower(), cert["publisherThumbprint"].lower()) != (version, sha, signer):
    raise SystemExit("Windows signing evidence does not identify this installer")
key = json.loads(pathlib.Path("src-tauri/tauri.conf.json").read_bytes())["plugins"]["updater"]["pubkey"]
(out / "updater.pub").write_bytes(base64.b64decode(key, validate=True))
(out / "installer.minisig").write_bytes(base64.b64decode((out / (name + ".sig")).read_text().strip(), validate=True))
subprocess.run(["minisign", "-Vm", str(out / name), "-p", str(out / "updater.pub"),
                "-x", str(out / "installer.minisig")], check=True)

public_path = f"/updates/{version}/windows-x86_64/{name}"
public_url = f"https://notes.binapp.top{public_path}"

class InstallerRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if req.full_url != public_url or target.scheme != "https" or target.netloc != "caiyun-app-updates.oss-cn-shanghai.aliyuncs.com":
            raise ValueError("Unexpected Windows installer redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

with build_opener(InstallerRedirect()).open(public_url, timeout=30) as response:
    if response.geturl() == public_url:
        raise SystemExit("Versioned Windows installer must be served by object storage")
    actual = hashlib.file_digest(response, "sha256").hexdigest()
if actual != sha:
    raise SystemExit("Object storage installer does not match the verified GitHub asset")

handoff = {}
if "latest-server.json" in assets:
    asset = assets["latest-server.json"]["id"]
    promoted = json.loads(subprocess.check_output(["gh", "api", "-H", "Accept: application/octet-stream",
        f"repos/{repo}/releases/assets/{asset}"]))
    for flag in ("windowsQuietUpdate", "windowsStoreHandoff"):
        if promoted.get(flag) != 1:
            continue
        if (promoted.get("version") != version or promoted["platforms"]["windows-x86_64"]["signature"] != (out / (name + ".sig")).read_text().strip()
                or cert.get("quietUpgradeScenarios") != ["10.2.8", "10.2.13"]):
            raise SystemExit("Quiet update qualification does not match the mirrored installer")
        handoff[flag] = 1
(out / "release.json").write_text(json.dumps({**handoff, "version": version, "sha256": sha, "published": release["published_at"], "publicPath": public_path,
                                             "signature": (out / (name + ".sig")).read_text().strip()}) + "\n")
print(f"Verified {release['tag_name']} Windows {version}, SHA-256 {sha}")
