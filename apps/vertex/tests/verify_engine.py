#!/usr/bin/env python3
"""Vertex engine test runner (stdlib only).

Locates a Node runtime and runs ``tests/engine.test.mjs`` (cwd = this dir),
then independently verifies the exported 3MF by unzipping it with ``zipfile``.
Exit codes:
  0  -> the engine tests passed, OR no Node was available (SKIP)
  1  -> one or more checks failed

Node resolution order:
  1. env var ``VERTEX_NODE`` (explicit path to a node executable)
  2. the bundled portable Node (PEGAAi skills directory)
  3. ``node`` on PATH

No third-party dependencies. The 3MF temp file is created by the .mjs and
removed here after the unzip check.
"""
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_FILE = os.path.join(HERE, "engine.test.mjs")
TMP_3MF = os.path.join(HERE, "vertex-3mf.tmp")
PORTABLE_NODE = os.path.join(
    os.path.expanduser("~"),
    r".config\opencode\skills\portable-nodejs\bin\node-v24.14.1-win-x64\node.exe",
)


def find_node():
    """Return a path to a node executable, or None if none can be found."""
    env_node = os.environ.get("VERTEX_NODE")
    if env_node and os.path.isfile(env_node):
        return env_node
    if os.path.isfile(PORTABLE_NODE):
        return PORTABLE_NODE
    return shutil.which("node")


def check_3mf():
    """Unzip the 3MF emitted by the .mjs and assert the model XML exists."""
    if not os.path.isfile(TMP_3MF):
        print("[FAIL] 3MF temp file not produced: " + TMP_3MF)
        return 1
    try:
        with zipfile.ZipFile(TMP_3MF) as zf:
            bad = zf.testzip()
            if bad is not None:
                print("[FAIL] 3MF zip CRC error in " + bad)
                return 1
            names = zf.namelist()
            for required in ("[Content_Types].xml", "_rels/.rels",
                             "3D/3dmodel.model"):
                if required not in names:
                    print("[FAIL] 3MF missing entry: " + required)
                    return 1
            model = zf.read("3D/3dmodel.model").decode("utf-8")
            if "<mesh>" not in model or "<vertex" not in model \
                    or "<triangle" not in model:
                print("[FAIL] 3MF model XML lacks mesh data")
                return 1
        print("[ok] 3MF unzips with a valid mesh model")
        return 0
    except Exception as exc:  # noqa: BLE001 - report any unzip failure
        print("[FAIL] 3MF unzip failed: " + str(exc))
        return 1
    finally:
        try:
            os.remove(TMP_3MF)
        except OSError:
            pass


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
    if proc.returncode != 0:
        return proc.returncode

    return check_3mf()


if __name__ == "__main__":
    sys.exit(main())
