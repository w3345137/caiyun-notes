"""Download and verify a released Windows direct installer."""
import base64
import hashlib
import json
import pathlib
import re
import subprocess

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
for asset in (name, name + ".sig", "candidate-report.json"):
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
key = json.loads(pathlib.Path("src-tauri/tauri.conf.json").read_bytes())["plugins"]["updater"]["pubkey"]
(out / "updater.pub").write_bytes(base64.b64decode(key, validate=True))
(out / "installer.minisig").write_bytes(base64.b64decode((out / (name + ".sig")).read_text().strip(), validate=True))
subprocess.run(["minisign", "-Vm", str(out / name), "-p", str(out / "updater.pub"),
                "-x", str(out / "installer.minisig")], check=True)

(out / name).rename(out / "CaiyunNotes-x64-Setup.exe")
(out / "release.json").write_text(json.dumps({"version": version, "sha256": sha}) + "\n")
print(f"Verified {release['tag_name']} Windows {version}, SHA-256 {sha}")
