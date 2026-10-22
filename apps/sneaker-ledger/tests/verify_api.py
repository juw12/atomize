#!/usr/bin/env python3
"""
Hermetic stdlib server test for Sneaker Ledger API.
Exit 0 if all pass, 1 if any fail.

Tests:
- Server starts on free port
- /api/health returns expected response
- /api/catalog returns catalog data
- /api/sku/{id} returns single colorway
- /api/integrity returns integrity report
"""

import json
import sys
import time
import socket
import threading
import urllib.request
import urllib.error
from pathlib import Path
from http.server import HTTPServer


def find_free_port():
    """Find a free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def make_request(url, method="GET"):
    """Make HTTP request and return (status_code, response_data)."""
    try:
        req = urllib.request.Request(url, method=method)
        with urllib.request.urlopen(req, timeout=5) as response:
            data = response.read().decode("utf-8")
            return response.status, json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return None, str(e)


def main():
    script_dir = Path(__file__).parent.resolve()
    project_dir = script_dir.parent
    server_script = project_dir / "server" / "server.py"
    
    all_pass = True
    
    # Check server script exists
    if not server_script.exists():
        print(f"FAIL: Server script not found at {server_script}")
        sys.exit(1)
    
    print(f"OK: Server script exists at {server_script}")
    
    # Find free port
    port = find_free_port()
    print(f"Using port: {port}")
    
    # Import and start server in background thread
    sys.path.insert(0, str(project_dir / "server"))
    
    # We need to set up the server module properly
    import importlib.util
    spec = importlib.util.spec_from_file_location("server", server_script)
    server_module = importlib.util.module_from_spec(spec)
    
    # Patch sys.argv to prevent argparse from exiting
    original_argv = sys.argv
    sys.argv = ["server.py", "--port", str(port), "--host", "127.0.0.1", "--no-browser"]
    
    try:
        spec.loader.exec_module(server_module)
    except Exception as e:
        print(f"FAIL: Could not load server module: {e}")
        sys.exit(1)
    finally:
        sys.argv = original_argv
    
    # Create server instance
    server_address = ("127.0.0.1", port)
    
    # Use the handler from the module
    httpd = HTTPServer(server_address, server_module.SneakerLedgerHandler)
    
    # Start server in background thread
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    
    # Give server time to start
    time.sleep(0.5)
    
    base_url = f"http://127.0.0.1:{port}"
    
    # Test 1: /api/health
    print("\nTesting /api/health...")
    status, data = make_request(f"{base_url}/api/health")
    if status == 200 and data and data.get("status") == "ok":
        print(f"OK: /api/health returned 200 with status=ok")
    else:
        print(f"FAIL: /api/health returned {status}, expected 200 with status=ok")
        all_pass = False
    
    # Test 2: /api/catalog
    print("\nTesting /api/catalog...")
    status, data = make_request(f"{base_url}/api/catalog")
    if status == 200 and data and "version" in data and "colorways" in data:
        print(f"OK: /api/catalog returned 200 with {len(data.get('colorways', []))} colorways")
    else:
        print(f"FAIL: /api/catalog returned {status}, expected 200 with catalog data")
        all_pass = False
    
    # Test 3: /api/sku/{id} - test with a known SKU
    print("\nTesting /api/sku/{id}...")
    # Get first SKU from catalog
    test_sku = None
    if data and data.get("colorways"):
        test_sku = data["colorways"][0].get("sku")
    
    if test_sku:
        status, sku_data = make_request(f"{base_url}/api/sku/{test_sku}")
        if status == 200 and sku_data and sku_data.get("sku") == test_sku:
            print(f"OK: /api/sku/{test_sku} returned 200 with correct SKU")
        else:
            print(f"FAIL: /api/sku/{test_sku} returned {status}, expected 200 with SKU data")
            all_pass = False
    else:
        print("SKIP: No SKU available to test")
    
    # Test 4: /api/sku/{id} - test non-existent SKU
    print("\nTesting /api/sku/{id} with non-existent SKU...")
    status, sku_data = make_request(f"{base_url}/api/sku/FAKE-SKU-123")
    if status == 404:
        print(f"OK: /api/sku/FAKE-SKU-123 returned 404 as expected")
    else:
        print(f"FAIL: /api/sku/FAKE-SKU-123 returned {status}, expected 404")
        all_pass = False
    
    # Test 5: /api/integrity
    print("\nTesting /api/integrity...")
    status, int_data = make_request(f"{base_url}/api/integrity")
    if status == 200 and int_data and "issues" in int_data:
        print(f"OK: /api/integrity returned 200 with {int_data.get('total_issues', 0)} issues")
    else:
        print(f"FAIL: /api/integrity returned {status}, expected 200 with issues list")
        all_pass = False
    
    # Test 6: OPTIONS preflight
    print("\nTesting OPTIONS preflight...")
    try:
        req = urllib.request.Request(f"{base_url}/api/health", method="OPTIONS")
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 204:
                print("OK: OPTIONS returned 204")
            else:
                print(f"FAIL: OPTIONS returned {response.status}, expected 204")
                all_pass = False
    except Exception as e:
        print(f"FAIL: OPTIONS request failed: {e}")
        all_pass = False
    
    # Shutdown server
    httpd.shutdown()
    
    # Summary
    print()
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
