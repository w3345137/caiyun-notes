"""Publish the Windows update feed and a redirect to the verified versioned EXE."""
import fcntl
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

staged, root, nginx_file = map(pathlib.Path, sys.argv[1:])
metadata = json.loads((staged / "release.json").read_bytes())
version = metadata["version"]
if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version):
    raise SystemExit("Invalid Windows release version")
public_path = f"/updates/{version}/windows-x86_64/_{version}_x64-setup.exe"
if metadata["publicPath"] != public_path or not metadata["signature"] or not metadata["published"]:
    raise SystemExit("Invalid Windows release metadata")

manifest = {"version": version, "pub_date": metadata["published"], "platforms": {
    "windows-x86_64": {"url": f"https://notes.binapp.top{public_path}", "signature": metadata["signature"]}}}
for flag in ("windowsQuietUpdate", "windowsStoreHandoff"):
    if metadata.get(flag) == 1:
        manifest[flag] = 1
redirect = (
    'location = /updates/windows/latest.exe {\n'
    '    add_header Cache-Control "no-store" always;\n'
    f'    return 307 {public_path};\n'
    '}\n'
)

def replace_text(destination, contents):
    with tempfile.NamedTemporaryFile(dir=destination.parent, mode="w", encoding="utf-8", delete=False) as output:
        temporary = pathlib.Path(output.name)
        try:
            output.write(contents)
            output.flush()
            os.fchmod(output.fileno(), 0o644)
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)

root.mkdir(mode=0o755, parents=True, exist_ok=True)
feed = root / "latest.json"
with (root.parent / ".windows-exe-publish.lock").open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    if feed.exists():
        current = json.loads(feed.read_text())
        if tuple(map(int, current["version"].split("."))) > tuple(map(int, version.split("."))):
            raise SystemExit("Refusing to replace a newer Windows release")
        if current["version"] == version and current["platforms"]["windows-x86_64"] != manifest["platforms"]["windows-x86_64"]:
            raise SystemExit("Conflicting metadata for the same Windows version")

    previous = nginx_file.read_text() if nginx_file.exists() else None
    replace_text(nginx_file, redirect)
    try:
        subprocess.run(["nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
        replace_text(feed, json.dumps(manifest) + "\n")
    except BaseException:
        if previous is None:
            nginx_file.unlink(missing_ok=True)
        else:
            replace_text(nginx_file, previous)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
        raise
    print(f"Published Windows {version} through object storage")
