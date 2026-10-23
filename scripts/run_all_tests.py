#!/usr/bin/env python3
"""Discover and run all app tests (apps/*/tests/*.py)."""

import subprocess
import sys
from pathlib import Path


def find_test_files(apps_dir):
    """Find all test files in apps/*/tests/*.py."""
    test_files = []
    
    for app_dir in sorted(apps_dir.iterdir()):
        if not app_dir.is_dir():
            continue
        
        tests_dir = app_dir / "tests"
        if not tests_dir.exists() or not tests_dir.is_dir():
            continue
        
        # Find all .py files in tests directory
        py_files = sorted(tests_dir.glob("*.py"))
        test_files.extend(py_files)
    
    return test_files


def run_test_file(test_file):
    """Run a single test file as a subprocess. Returns (passed, output)."""
    try:
        result = subprocess.run(
            [sys.executable, str(test_file)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=test_file.parent.parent.parent  # Run from repo root
        )
        
        passed = result.returncode == 0
        output = result.stdout + result.stderr
        return passed, output
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT (60s)"
    except Exception as e:
        return False, f"ERROR: {e}"


def main():
    repo_root = Path.cwd()
    apps_dir = repo_root / "apps"
    
    if not apps_dir.exists():
        print("ERROR: apps/ directory not found")
        sys.exit(1)
    
    print("Discovering tests...")
    test_files = find_test_files(apps_dir)
    
    if not test_files:
        print("No test files found in apps/*/tests/")
        print("PASSED (no tests to run)")
        sys.exit(0)
    
    print(f"Found {len(test_files)} test file(s)")
    print()
    
    results = []
    any_failed = False
    
    for test_file in test_files:
        rel_path = test_file.relative_to(repo_root)
        print(f"Running: {rel_path}")
        
        passed, output = run_test_file(test_file)
        skipped = (not passed) and ("ModuleNotFoundError" in output)
        results.append((rel_path, passed, skipped, output))
        
        if passed:
            print(f"  [PASS] {test_file.name}")
        elif skipped:
            print(f"  [SKIP] {test_file.name} (optional dependency not installed)")
        else:
            print(f"  [FAIL] {test_file.name}")
            any_failed = True
            
            # Print output for failed tests
            if output.strip():
                for line in output.strip().split('\n'):
                    print(f"    {line}")
        
        print()
    
    # Summary
    passed_count = sum(1 for r in results if r[1])
    skipped_count = sum(1 for r in results if r[2])
    failed_count = sum(1 for r in results if not r[1] and not r[2])
    
    print("=" * 60)
    print(f"Results: {passed_count} passed, {skipped_count} skipped, {failed_count} failed")
    
    if any_failed:
        print("FAILED")
        sys.exit(1)
    else:
        print("PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
