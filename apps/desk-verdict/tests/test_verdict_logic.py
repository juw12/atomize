#!/usr/bin/env python3
"""
Unit tests for compute_verdict() — imports the function from server.py via
importlib.util so we don't have to make server.py a package.

Exit 0 if all pass, 1 if any fail.
"""

import importlib.util
import sys
from pathlib import Path


def load_server_module():
    server_py = Path(__file__).parent.parent / "server" / "server.py"
    spec = importlib.util.spec_from_file_location("desk_verdict_server", str(server_py))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load spec from {server_py}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    server = load_server_module()
    compute_verdict = server.compute_verdict

    all_pass = True

    def check(cond, label):
        nonlocal all_pass
        if cond:
            print(f"OK: {label}")
        else:
            print(f"FAIL: {label}")
            all_pass = False

    # perfect 5s -> USE (avg 5.0)
    verdict, avg = compute_verdict(
        {
            "time_saved": 5,
            "output_quality": 5,
            "ease_of_use": 5,
            "cost_value": 5,
            "work_safety": 5,
        }
    )
    check(verdict == "USE", "perfect 5s -> USE")
    check(avg == 5.0, "perfect 5s -> avg == 5.0")

    # all 4s -> USE (avg 4.0)
    verdict, avg = compute_verdict(
        {
            "time_saved": 4,
            "output_quality": 4,
            "ease_of_use": 4,
            "cost_value": 4,
            "work_safety": 4,
        }
    )
    check(verdict == "USE", "all 4s -> USE")
    check(avg == 4.0, "all 4s -> avg == 4.0")

    # avg exactly 4.0 boundary -> USE
    # (4,4,4,4,4) is 4.0; also try a mix that hits exactly 4.0
    verdict, avg = compute_verdict(
        {
            "time_saved": 5,
            "output_quality": 4,
            "ease_of_use": 4,
            "cost_value": 4,
            "work_safety": 3,
        }
    )
    # mean = (5+4+4+4+3)/5 = 20/5 = 4.0 -> USE
    check(avg == 4.0, "mixed to avg=4.0 -> avg == 4.0")
    check(verdict == "USE", "avg exactly 4.0 boundary -> USE")

    # (4,4,3,3,3) avg 3.4 -> WAIT
    verdict, avg = compute_verdict(
        {
            "time_saved": 4,
            "output_quality": 4,
            "ease_of_use": 3,
            "cost_value": 3,
            "work_safety": 3,
        }
    )
    check(avg == 3.4, "(4,4,3,3,3) -> avg == 3.4")
    check(verdict == "WAIT", "(4,4,3,3,3) avg 3.4 -> WAIT")

    # avg exactly 3.0 -> WAIT
    verdict, avg = compute_verdict(
        {
            "time_saved": 3,
            "output_quality": 3,
            "ease_of_use": 3,
            "cost_value": 3,
            "work_safety": 3,
        }
    )
    check(avg == 3.0, "all 3s -> avg == 3.0")
    check(verdict == "WAIT", "avg exactly 3.0 boundary -> WAIT")

    # (3,3,2,2,2) avg 2.4 -> SKIP
    verdict, avg = compute_verdict(
        {
            "time_saved": 3,
            "output_quality": 3,
            "ease_of_use": 2,
            "cost_value": 2,
            "work_safety": 2,
        }
    )
    check(avg == 2.4, "(3,3,2,2,2) -> avg == 2.4")
    check(verdict == "SKIP", "(3,3,2,2,2) avg 2.4 -> SKIP")

    # work_safety=2 with otherwise high scores -> SKIP (gate)
    verdict, avg = compute_verdict(
        {
            "time_saved": 5,
            "output_quality": 5,
            "ease_of_use": 5,
            "cost_value": 5,
            "work_safety": 2,
        }
    )
    check(avg == 4.4, "high scores with work_safety=2 -> avg == 4.4")
    check(
        verdict == "SKIP",
        "work_safety=2 gate with otherwise high scores -> SKIP",
    )

    # work_safety=1 -> SKIP
    verdict, avg = compute_verdict(
        {
            "time_saved": 5,
            "output_quality": 5,
            "ease_of_use": 5,
            "cost_value": 5,
            "work_safety": 1,
        }
    )
    check(avg == 4.2, "high scores with work_safety=1 -> avg == 4.2")
    check(verdict == "SKIP", "work_safety=1 -> SKIP")

    print()
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
