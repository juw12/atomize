#!/usr/bin/env python3
"""Chase engine test runner (stdlib only).

Locates a Node runtime and runs ``tests/engine.test.mjs`` (cwd = this dir).
Exit codes:
  0  -> the engine tests passed, OR no Node was available (SKIP)
  1  -> one or more checks failed

Node resolution order:
  1. env var ``CHASE_NODE`` (explicit path to a node executable)
  2. the bundled portable Node (PEGAAi skills directory)
  3. ``node`` on PATH

No third-party dependencies; nothing is written.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_FILE = os.path.join(HERE, "engine.test.mjs")
PORTABLE_NODE = (
    r"~\.config\opencode\skills\portable-nodejs"
    r"\bin\node-v24.14.1-win-x64\node.exe"
)


def find_node():
    """Return a path to a node executable, or None if none can be found."""
    env_node = os.environ.get("CHASE_NODE")
    if env_node and os.path.isfile(env_node):
        return env_node
    if os.path.isfile(PORTABLE_NODE):
        return PORTABLE_NODE
    return shutil.which("node")


def main():
    node = find_node()
    if not node:
        print("[SKIP] node not available")
        return 0

    if not os.path.isfile(TEST_FILE):
        print("[FAIL] test file not found: " + TEST_FILE)
        return 1

    print("node: " + node)
    print("test: " + TEST_FILE)
    proc = subprocess.run([node, TEST_FILE], cwd=HERE)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
