#!/usr/bin/env python3
"""
Hermetic API verification test for Ailene Open server.
Spawns server with temp port, tests endpoints, exits 0/1.
"""

import json
import os
import sys
import socket
import threading
import time
from http.client import HTTPConnection
from pathlib import Path

# Add server directory to path
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent
SERVER_DIR = PROJECT_DIR / 'server'
sys.path.insert(0, str(SERVER_DIR))


def find_free_port():
    """Find a free ephemeral port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def import_server_module():
    """Import the server module."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("server", SERVER_DIR / "server.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_tests():
    all_passed = True
    
    # Find free port
    port = find_free_port()
    print(f"Using port: {port}")
    
    # Import server module
    try:
        server_module = import_server_module()
        print("OK - Server module loaded")
    except Exception as e:
        print(f"FAIL - Cannot load server module: {e}")
        return 1
    
    # Start server in background thread
    server = None
    def run_server():
        nonlocal server
        server = server_module.HTTPServer(('127.0.0.1', port), server_module.AileneHandler)
        server.serve_forever()
    
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(0.5)  # Give server time to start
    
    # Test helper
    def get(path):
        conn = HTTPConnection('127.0.0.1', port, timeout=5)
        try:
            conn.request('GET', path)
            resp = conn.getresponse()
            body = resp.read().decode('utf-8')
            return resp.status, resp.getheaders(), body
        finally:
            conn.close()
    
    # Test 1: Health endpoint
    print("\n=== /api/health ===")
    try:
        status, headers, body = get('/api/health')
        if status == 200:
            data = json.loads(body)
            if data.get('status') == 'ok' and data.get('app') == 'ailene-open':
                print("ok - health endpoint returns correct JSON")
            else:
                print(f"FAIL - health endpoint wrong data: {data}")
                all_passed = False
        else:
            print(f"FAIL - health endpoint status {status}")
            all_passed = False
    except Exception as e:
        print(f"FAIL - health endpoint error: {e}")
        all_passed = False
    
    # Test 2: Curriculum endpoint
    print("\n=== /api/curriculum ===")
    try:
        status, headers, body = get('/api/curriculum')
        if status == 200:
            data = json.loads(body)
            if 'levels' in data and 'strings' in data:
                print("ok - curriculum endpoint returns full curriculum")
            else:
                print(f"FAIL - curriculum missing expected keys")
                all_passed = False
        else:
            print(f"FAIL - curriculum endpoint status {status}")
            all_passed = False
    except Exception as e:
        print(f"FAIL - curriculum endpoint error: {e}")
        all_passed = False
    
    # Test 3: Quiz endpoint
    print("\n=== /api/quiz ===")
    try:
        status, headers, body = get('/api/quiz')
        if status == 200:
            data = json.loads(body)
            if 'questions' in data and 'results' in data:
                print("ok - quiz endpoint returns questions and results")
            else:
                print(f"FAIL - quiz endpoint missing expected keys")
                all_passed = False
        else:
            print(f"FAIL - quiz endpoint status {status}")
            all_passed = False
    except Exception as e:
        print(f"FAIL - quiz endpoint error: {e}")
        all_passed = False
    
    # Test 4: Lesson endpoint (valid)
    print("\n=== /api/lessons/les-01-what-are-tokens ===")
    try:
        status, headers, body = get('/api/lessons/les-01-what-are-tokens')
        if status == 200:
            data = json.loads(body)
            if data.get('id') == 'les-01-what-are-tokens':
                print("ok - lesson endpoint returns correct lesson")
            else:
                print(f"FAIL - lesson endpoint wrong lesson")
                all_passed = False
        else:
            print(f"FAIL - lesson endpoint status {status}")
            all_passed = False
    except Exception as e:
        print(f"FAIL - lesson endpoint error: {e}")
        all_passed = False
    
    # Test 5: Lesson endpoint (not found)
    print("\n=== /api/lessons/nonexistent ===")
    try:
        status, headers, body = get('/api/lessons/nonexistent')
        if status == 404:
            print("ok - nonexistent lesson returns 404")
        else:
            print(f"FAIL - nonexistent lesson status {status}, expected 404")
            all_passed = False
    except Exception as e:
        print(f"FAIL - lesson endpoint error: {e}")
        all_passed = False
    
    # Test 6: Static file (index.html)
    print("\n=== GET / (index.html) ===")
    try:
        status, headers, body = get('/')
        if status == 200 and 'Ailene Open' in body and 'curriculum-data' in body:
            print("ok - root serves index.html with curriculum data")
        else:
            print(f"FAIL - root status {status} or missing expected content")
            all_passed = False
    except Exception as e:
        print(f"FAIL - root endpoint error: {e}")
        all_passed = False
    
    # Test 7: Mobile HTML
    print("\n=== GET /mobile.html ===")
    try:
        status, headers, body = get('/mobile.html')
        if status == 200 and 'Ailene Open' in body and 'ailene_open_v1' in body:
            print("ok - mobile.html served correctly")
        else:
            print(f"FAIL - mobile.html status {status} or missing expected content")
            all_passed = False
    except Exception as e:
        print(f"FAIL - mobile.html endpoint error: {e}")
        all_passed = False
    
    # Test 8: 404 for unknown route
    print("\n=== GET /unknown ===")
    try:
        status, headers, body = get('/unknown')
        if status == 404:
            print("ok - unknown route returns 404")
        else:
            print(f"FAIL - unknown route status {status}, expected 404")
            all_passed = False
    except Exception as e:
        print(f"FAIL - unknown route error: {e}")
        all_passed = False
    
    # Test 9: CORS headers
    print("\n=== CORS headers ===")
    try:
        status, headers, body = get('/api/health')
        header_dict = {h[0].lower(): h[1] for h in headers}
        if 'access-control-allow-origin' in header_dict:
            print("ok - CORS headers present")
        else:
            print(f"FAIL - CORS headers missing")
            all_passed = False
    except Exception as e:
        print(f"FAIL - CORS check error: {e}")
        all_passed = False
    
    # Cleanup
    if server:
        server.shutdown()
    
    # Summary
    print("\n" + "=" * 50)
    if all_passed:
        print("SUMMARY: ALL TESTS PASSED")
        return 0
    else:
        print("SUMMARY: SOME TESTS FAILED")
        return 1


if __name__ == '__main__':
    sys.exit(run_tests())
