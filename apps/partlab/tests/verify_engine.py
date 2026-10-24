#!/usr/bin/env python3
"""Run the Part Lab engine tests (tests/engine.test.mjs) through Node.

Hermetic, stdlib-only. Locates Node in this order:
  1. $PARTLAB_NODE
  2. the portable Node shipped with the OpenCode skills
  3. "node" on PATH

If no Node is found it prints "[SKIP] node not available" and exits 0 (the
suite is optional at the gate). Otherwise it runs the .mjs from this tests
directory and propagates Node's exit status (0 = pass, 1 = fail).
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
TEST_FILE = TESTS_DIR / "engine.test.mjs"
PORTABLE_NODE = Path(
    r"~\.config\opencode\skills\portable-nodejs"
    r"\bin\node-v24.14.1-win-x64\node.exe"
)


def find_node():
    """Return a path to a Node executable, or None if none is available."""
    env_node = os.environ.get("PARTLAB_NODE")
    if env_node and Path(env_node).exists():
        return env_node
    if PORTABLE_NODE.exists():
        return str(PORTABLE_NODE)
    which_node = shutil.which("node")
    if which_node:
        return which_node
    return None


def main():
    if not TEST_FILE.exists():
        print("[FAIL] missing test file: %s" % TEST_FILE)
        return 1

    node = find_node()
    if not node:
        print("[SKIP] node not available")
        return 0

    print("Using Node: %s" % node)
    print("Running: %s" % TEST_FILE.name)
    try:
        proc = subprocess.run(
            [node, str(TEST_FILE)],
            cwd=str(TESTS_DIR),
        )
    except OSError as exc:
        print("[FAIL] could not launch Node: %s" % exc)
        return 1

    if proc.returncode == 0:
        print("[PASS] engine tests passed")
    else:
        print("[FAIL] engine tests failed (exit %d)" % proc.returncode)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
