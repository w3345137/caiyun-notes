import copy
import runpy
import unittest
from pathlib import Path

validate = runpy.run_path(str(Path(__file__).resolve().parents[1] / ".github/scripts/verify-windows-handoff.py"))["validate"]
family = "BinApp.547813EA77836_hex6nfb75njyr"
sha = "a" * 64


class HandoffAcceptance(unittest.TestCase):
    def setUp(self):
        common = dict(standardUser=True, unattended=True, evidence="synthetic fixture", exeRequests=0)
        self.report = dict(version="10.2.19", storeVersion="10.2.18.0", installerSha256=sha, cases=[
            dict(common, scenario="website-to-store", events=["store-acquired", "store-launched"],
                 installedVersion="10.2.18.0", packageFamily=family),
            dict(common, scenario="website-exe-fallback", events=["store-failed", "exe-updated"],
                 installedVersion="10.2.19", exeRequests=1, sameInstallPath=True),
            dict(common, scenario="store-retry", events=["store-failed", "store-retried"], packageFamily=family),
        ])

    def test_matching_candidate(self):
        validate(self.report, sha, "10.2.19", "10.2.18")

    def test_reject_incomplete_or_wrong_routes(self):
        for index, key, value in [(0,"installedVersion","10.2.17.0"), (0,"standardUser",False),
                                  (1,"sameInstallPath",False), (1,"events",["exe-updated"]),
                                  (2,"exeRequests",1), (2,"scenario","website-to-store")]:
            with self.subTest(key=key):
                report = copy.deepcopy(self.report)
                report["cases"][index][key] = value
                with self.assertRaises(ValueError):
                    validate(report, sha, "10.2.19", "10.2.18")

    def test_reject_different_binary(self):
        with self.assertRaises(ValueError):
            validate(self.report, "b" * 64, "10.2.19", "10.2.18")
