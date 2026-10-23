"""Hermetic test runner for the Lingua engine.

Runs each ``test_*.py`` in a fresh interpreter and exits 0 (all pass) or 1.

    python tests\\run_all.py
"""

import os
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

TEST_FILES = ["test_pipeline.py", "test_maas.py", "test_capture.py"]


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    failed = 0
    for name in TEST_FILES:
        print("=== " + name + " ===")
        proc = subprocess.run([sys.executable, os.path.join(here, name)])
        if proc.returncode != 0:
            failed += 1
            print("--- {} FAILED (exit {}) ---".format(name, proc.returncode))
        else:
            print("--- {} passed ---".format(name))

    if failed:
        print("\n{} test file(s) failed".format(failed))
        return 1
    print("\nALL TEST FILES PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
