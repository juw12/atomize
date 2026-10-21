#!/usr/bin/env python3
"""
Hermetic API verification test for House of Articles server.
Exit 0 if all pass, 1 if any fail.
"""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def wait_for_server(host, port, timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect((host, port))
                return True
        except ConnectionRefusedError:
            time.sleep(0.5)
    return False


def make_request(url, method="GET", headers=None, timeout=10, binary=False):
    req = urllib.request.Request(url, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if binary:
                return resp.status, dict(resp.headers), resp.read()
            else:
                body = resp.read().decode("utf-8")
                return resp.status, dict(resp.headers), body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        return e.code, dict(e.headers), body
    except Exception as e:
        return None, {}, str(e)


def main():
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    server_script = project_dir / "server" / "server.py"

    if not server_script.exists():
        print("FAIL: server.py not found")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_db = Path(tmpdir) / "test.db"
        port = find_free_port()
        host = "127.0.0.1"

        env = os.environ.copy()
        env["HOA_DB"] = str(tmp_db)

        proc = subprocess.Popen(
            [sys.executable, str(server_script), "--port", str(port), "--host", host, "--no-browser"],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        try:
            if not wait_for_server(host, port):
                print("FAIL: Server did not start in time")
                proc.terminate()
                proc.wait()
                sys.exit(1)

            all_pass = True
            base_url = f"http://{host}:{port}"

            # Test 1: Health endpoint
            status, headers, body = make_request(f"{base_url}/api/health")
            if status == 200:
                data = json.loads(body)
                if data.get("status") == "ok" and data.get("app") == "house-of-articles":
                    print("OK: GET /api/health")
                else:
                    print(f"FAIL: GET /api/health - unexpected response: {data}")
                    all_pass = False
            else:
                print(f"FAIL: GET /api/health - status {status}")
                all_pass = False

            # Test 2: Brands endpoint
            status, headers, body = make_request(f"{base_url}/api/brands")
            if status == 200:
                brands = json.loads(body)
                if isinstance(brands, list) and len(brands) > 0:
                    print(f"OK: GET /api/brands - {len(brands)} brands")
                else:
                    print(f"FAIL: GET /api/brands - empty or invalid response")
                    all_pass = False
            else:
                print(f"FAIL: GET /api/brands - status {status}")
                all_pass = False

            # Test 3: Sneakers list endpoint
            status, headers, body = make_request(f"{base_url}/api/sneakers")
            if status == 200:
                sneakers = json.loads(body)
                if isinstance(sneakers, list) and len(sneakers) > 0:
                    print(f"OK: GET /api/sneakers - {len(sneakers)} sneakers")
                else:
                    print(f"FAIL: GET /api/sneakers - empty or invalid response")
                    all_pass = False
            else:
                print(f"FAIL: GET /api/sneakers - status {status}")
                all_pass = False

            # Test 4: Sneaker detail endpoint (with parts)
            status, headers, body = make_request(f"{base_url}/api/sneakers/apex-runner-3")
            if status == 200:
                sneaker = json.loads(body)
                if sneaker.get("id") == "apex-runner-3":
                    has_parts = False
                    if "colorways" in sneaker and len(sneaker["colorways"]) > 0:
                        cw = sneaker["colorways"][0]
                        if "parts" in cw and len(cw["parts"]) > 0:
                            has_parts = True
                    if has_parts:
                        print("OK: GET /api/sneakers/apex-runner-3 - has parts")
                    else:
                        print("FAIL: GET /api/sneakers/apex-runner-3 - no parts found")
                        all_pass = False
                else:
                    print(f"FAIL: GET /api/sneakers/apex-runner-3 - unexpected response")
                    all_pass = False
            else:
                print(f"FAIL: GET /api/sneakers/apex-runner-3 - status {status}")
                all_pass = False

            # Test 5: Prices endpoint for all ranges
            for range_val in ["1m", "6m", "1y", "all"]:
                status, headers, body = make_request(
                    f"{base_url}/api/sneakers/apex-runner-3/prices?range={range_val}"
                )
                if status == 200:
                    data = json.loads(body)
                    prices = data.get("prices", [])
                    if not prices:
                        print(f"FAIL: GET /api/sneakers/apex-runner-3/prices?range={range_val} - empty")
                        all_pass = False
                    else:
                        # Check monotonically increasing timestamps
                        timestamps = [p["t"] for p in prices]
                        is_sorted = timestamps == sorted(timestamps)
                        if is_sorted:
                            print(f"OK: GET /api/sneakers/apex-runner-3/prices?range={range_val} - {len(prices)} points, sorted")
                        else:
                            print(f"FAIL: GET /api/sneakers/apex-runner-3/prices?range={range_val} - timestamps not sorted")
                            all_pass = False
                else:
                    print(f"FAIL: GET /api/sneakers/apex-runner-3/prices?range={range_val} - status {status}")
                    all_pass = False

            # Test 6: Unknown sneaker ID -> 404
            status, headers, body = make_request(f"{base_url}/api/sneakers/unknown-sneaker-xyz")
            if status == 404:
                try:
                    data = json.loads(body)
                    if "error" in data:
                        print("OK: GET /api/sneakers/unknown-sneaker-xyz - 404 with JSON error")
                    else:
                        print(f"FAIL: GET /api/sneakers/unknown-sneaker-xyz - 404 but no error key")
                        all_pass = False
                except:
                    print(f"FAIL: GET /api/sneakers/unknown-sneaker-xyz - 404 but invalid JSON")
                    all_pass = False
            else:
                print(f"FAIL: GET /api/sneakers/unknown-sneaker-xyz - expected 404, got {status}")
                all_pass = False

            # Test 7: CORS header present
            status, headers, body = make_request(f"{base_url}/api/health")
            if "Access-Control-Allow-Origin" in headers:
                print("OK: CORS header present (Access-Control-Allow-Origin: *)")
            else:
                print(f"FAIL: CORS header missing")
                all_pass = False

            # Test 8: OPTIONS -> 204
            status, headers, body = make_request(f"{base_url}/api/health", method="OPTIONS")
            if status == 204:
                print("OK: OPTIONS /api/health - 204")
            else:
                print(f"FAIL: OPTIONS /api/health - expected 204, got {status}")
                all_pass = False

            # Test 9: Static files
            status, headers, body = make_request(f"{base_url}/")
            if status == 200 and "<!DOCTYPE html>" in body or "<html" in body:
                print("OK: GET / - 200 (index.html)")
            else:
                print(f"FAIL: GET / - status {status}")
                all_pass = False

            status, headers, body = make_request(f"{base_url}/index.html")
            if status == 200:
                print("OK: GET /index.html - 200")
            else:
                print(f"FAIL: GET /index.html - status {status}")
                all_pass = False

            status, headers, body = make_request(f"{base_url}/desktop.html")
            if status == 200:
                print("OK: GET /desktop.html - 200")
            else:
                print(f"FAIL: GET /desktop.html - status {status}")
                all_pass = False

            status, headers, body = make_request(f"{base_url}/assets/hero-basketball.jpg", timeout=30, binary=True)
            if status == 200 and isinstance(body, bytes) and len(body) > 0:
                print("OK: GET /assets/hero-basketball.jpg - 200")
            elif status is None:
                print(f"FAIL: GET /assets/hero-basketball.jpg - connection error: {body}")
                all_pass = False
            else:
                print(f"FAIL: GET /assets/hero-basketball.jpg - status {status}")
                all_pass = False

            # Test 10: /data/ should be blocked
            status, headers, body = make_request(f"{base_url}/data/data-spine.json")
            if status == 403 or status == 404:
                print(f"OK: GET /data/data-spine.json - blocked ({status})")
            else:
                print(f"FAIL: GET /data/data-spine.json - should be blocked, got {status}")
                all_pass = False

            print()
            if all_pass:
                print("ALL TESTS PASSED")
                proc.terminate()
                proc.wait()
                sys.exit(0)
            else:
                print("TESTS FAILED")
                proc.terminate()
                proc.wait()
                sys.exit(1)

        except Exception as e:
            print(f"FAIL: Unexpected error: {e}")
            proc.terminate()
            proc.wait()
            sys.exit(1)
        finally:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except:
                proc.kill()


if __name__ == "__main__":
    main()
