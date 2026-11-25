"""Install a verified immutable Windows release and atomically update its public link."""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import sys
import tempfile

staged, root = map(pathlib.Path, sys.argv[1:])
exe = "CaiyunNotes-x64-Setup.exe"
metadata = json.loads((staged / "release.json").read_bytes())
version, expected = metadata["version"], metadata["sha256"]
if not re.fullmatch(r"\d+\.\d+\.\d+", version) or not re.fullmatch(r"[a-f0-9]{64}", expected):
    raise SystemExit("Invalid Windows release metadata")

def verify(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"SHA-256 mismatch: {path.name}")

verify(staged / exe)
root.mkdir(mode=0o755, parents=True, exist_ok=True)
with (root.parent / ".windows-exe-publish.lock").open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    latest = root / "latest.exe"
    if latest.is_symlink():
        current = re.fullmatch(r"releases/(\d+\.\d+\.\d+)/" + re.escape(exe), os.readlink(latest))
        if not current:
            raise SystemExit("Unexpected Windows release pointer")
        if tuple(map(int, current[1].split("."))) > tuple(map(int, version.split("."))):
            print(f"Keeping newer Windows release {current[1]}")
            sys.exit(0)
    elif latest.exists():
        raise SystemExit("Windows release pointer is not a symlink")

    target = root / "releases" / version / exe
    target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as work:
        temporary = pathlib.Path(work)
        if not target.exists():
            shutil.copyfile(staged / exe, temporary / exe)
            (temporary / exe).chmod(0o644)
            verify(temporary / exe)
            os.replace(temporary / exe, target)
        verify(target)
        link = temporary / "latest.exe"
        link.symlink_to(target.relative_to(root))
        os.replace(link, latest)
    print(f"Windows EXE {version} {expected}")
