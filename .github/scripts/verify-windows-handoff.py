"""Validate the standard-user acceptance attachment before activating an EXE handoff."""
import json
import re
import sys
from pathlib import Path


def package_version(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+){2,3}", value):
        raise ValueError("Invalid package version")
    parts = [int(part) for part in value.split(".")]
    return tuple((parts + [0])[:4])


def validate(report, candidate_hash, candidate_version, store_version):
    if report.get("installerSha256") != candidate_hash or not re.fullmatch("[0-9a-f]{64}", candidate_hash):
        raise ValueError("Acceptance report refers to a different EXE")
    if report.get("version") != candidate_version or package_version(report.get("storeVersion")) != package_version(store_version):
        raise ValueError("Acceptance report refers to a different release")
    family = "BinApp.547813EA77836_hex6nfb75njyr"
    cases = report.get("cases")
    if not isinstance(cases, list) or len(cases) != 3:
        raise ValueError("Three Windows acceptance cases required")
    expected = {"website-to-store", "website-exe-fallback", "store-retry"}
    for case in cases:
        name = case["scenario"]
        if name not in expected:
            raise ValueError("Missing or duplicate acceptance case")
        expected.remove(name)
        if case.get("standardUser") is not True or case.get("unattended") is not True:
            raise ValueError("Run as a standard user without an elevation or installer prompt")
        if not isinstance(case.get("evidence"), str) or not case["evidence"].strip():
            raise ValueError("Missing reference to the observed run")
        if name == "website-to-store":
            if (case.get("events") != ["store-acquired", "store-launched"] or
                    case.get("packageFamily") != family or package_version(case.get("installedVersion")) != package_version(store_version)):
                raise ValueError("Store installation and subsequent launch not confirmed")
        elif name == "website-exe-fallback":
            if (case.get("events") != ["store-failed", "exe-updated"] or
                    case.get("sameInstallPath") is not True or case.get("installedVersion") != candidate_version):
                raise ValueError("EXE in-place fallback not confirmed")
        elif case.get("events") != ["store-failed", "store-retried"] or case.get("packageFamily") != family:
            raise ValueError("Store-only retry not confirmed")
        if type(case.get("exeRequests")) is not int or case["exeRequests"] != (1 if name == "website-exe-fallback" else 0):
            # Count installation attempts, grouping resumed HTTP range requests by package.
            raise ValueError("Unexpected EXE transfer")


if __name__ == "__main__":
    directory, approved, store_version = sys.argv[1:]
    root = Path(directory)
    candidate = json.loads((root / "candidate-report.json").read_bytes())
    package = candidate["updater"]["windows-x86_64"]["package"]
    if candidate["expected_sha256"][package] != approved:
        raise SystemExit("Unapproved candidate")
    evidence = json.loads((root / "windows-handoff-acceptance.json").read_bytes())
    validate(evidence, approved, candidate["version"], store_version)
