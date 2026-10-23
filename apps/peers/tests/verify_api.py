#!/usr/bin/env python3
"""Hermetic API verification tests for the Peers server.

This test suite:
1. Spawns the server on a free port with a temp database
2. Runs API tests (health, state, reset, auth, CORS, OPTIONS, 404, 400)
3. Verifies HTML injection (shim present, precedes original script)
4. Cleans up and exits 0 on success, 1 on failure
"""

import http.client
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SERVER_SCRIPT = BASE_DIR / "server" / "server.py"
WEB_DIR = BASE_DIR / "web"

REQUIRED_STATE_KEYS = [
    "meId", "me", "language", "country", "currency", "currencySymbol",
    "timezone", "users", "places", "reviews", "collections", "sellers",
    "products", "productReviews", "orders", "complaints", "reports",
    "cart", "following", "visited", "votes", "translations", "feedFilter",
    "notifications", "threads", "subscriptions", "verdicts", "auth",
    "placeTab", "mapFilter", "marketSort", "mode"
]


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(host, port, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            conn = http.client.HTTPConnection(host, port, timeout=1)
            conn.request("GET", "/api/health")
            resp = conn.getresponse()
            if resp.status == 200:
                conn.close()
                return True
            conn.close()
        except Exception:
            pass
        time.sleep(0.2)
    return False


def run_tests():
    all_passed = True
    
    port = find_free_port()
    host = "127.0.0.1"
    
    temp_db_dir = tempfile.mkdtemp()
    temp_db = os.path.join(temp_db_dir, "test_peers.db")
    
    env = os.environ.copy()
    env["PEERS_DB"] = temp_db
    
    print(f"Starting server on {host}:{port} with temp DB {temp_db}")
    
    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT), "--port", str(port), "--host", host, "--no-browser"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    
    try:
        if not wait_for_server(host, port):
            print("FAIL - server did not start in time")
            return 1
        
        print("Server started successfully\n")
        
        def get(path):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("GET", path)
            return conn.getresponse()
        
        def put(path, body):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("PUT", path, body=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            return conn.getresponse()
        
        def post(path, body):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("POST", path, body=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            return conn.getresponse()
        
        def options(path):
            conn = http.client.HTTPConnection(host, port, timeout=5)
            conn.request("OPTIONS", path)
            return conn.getresponse()
        
        # Test 1: Health endpoint
        print("Test 1: GET /api/health")
        resp = get("/api/health")
        if resp.status == 200:
            data = json.loads(resp.read())
            if data.get("status") == "ok" and data.get("app") == "peers" and data.get("version") == "1.0":
                print("  ok - health endpoint returns correct response")
            else:
                print(f"  FAIL - unexpected health response: {data}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 2: GET /api/state has all required keys
        print("\nTest 2: GET /api/state")
        resp = get("/api/state")
        if resp.status == 200:
            data = json.loads(resp.read())
            missing = [k for k in REQUIRED_STATE_KEYS if k not in data]
            if not missing:
                print(f"  ok - state has all {len(REQUIRED_STATE_KEYS)} required top-level keys")
            else:
                print(f"  FAIL - missing keys: {missing}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 3: PUT /api/state round-trip
        print("\nTest 3: PUT /api/state")
        test_state = {"testKey": "testValue", "meId": "test_123"}
        resp = put("/api/state", test_state)
        if resp.status == 200:
            resp2 = get("/api/state")
            data = json.loads(resp2.read())
            if data.get("testKey") == "testValue" and data.get("meId") == "test_123":
                print("  ok - PUT /api/state round-trip works")
            else:
                print(f"  FAIL - state not updated correctly: {data}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 4: POST /api/reset reseeds
        print("\nTest 4: POST /api/reset")
        resp = post("/api/reset", {})
        if resp.status == 200:
            resp2 = get("/api/state")
            data = json.loads(resp2.read())
            if "meId" in data and "users" in data:
                print("  ok - reset reseeds the database")
            else:
                print(f"  FAIL - state after reset missing keys: {list(data.keys())}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 5: Auth signup
        print("\nTest 5: POST /api/auth/signup")
        resp = post("/api/auth", {"action": "signup", "email": "test@example.com", "password": "password123", "name": "Test User"})
        if resp.status == 200:
            data = json.loads(resp.read())
            if data.get("ok") and data.get("user"):
                print("  ok - signup returns user object")
            else:
                print(f"  FAIL - signup response: {data}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 6: Auth signin
        print("\nTest 6: POST /api/auth/signin")
        resp = post("/api/auth", {"action": "signin", "email": "test@example.com", "password": "password123"})
        if resp.status == 200:
            data = json.loads(resp.read())
            if data.get("ok") and data.get("user"):
                print("  ok - signin returns user object")
            else:
                print(f"  FAIL - signin response: {data}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 7: Auth logout
        print("\nTest 7: POST /api/auth/logout")
        resp = post("/api/auth", {"action": "logout"})
        if resp.status == 200:
            data = json.loads(resp.read())
            if data.get("ok"):
                print("  ok - logout returns ok")
            else:
                print(f"  FAIL - logout response: {data}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 8: CORS headers
        print("\nTest 8: CORS headers")
        resp = get("/api/health")
        cors = resp.getheader("Access-Control-Allow-Origin")
        if cors == "*":
            print("  ok - Access-Control-Allow-Origin: * present")
        else:
            print(f"  FAIL - CORS header: {cors}")
            all_passed = False
        
        # Test 9: OPTIONS /api/*
        print("\nTest 9: OPTIONS /api/state")
        resp = options("/api/state")
        if resp.status == 204:
            methods = resp.getheader("Access-Control-Allow-Methods")
            headers = resp.getheader("Access-Control-Allow-Headers")
            if methods and "PUT" in methods and "POST" in methods and "GET" in methods:
                if headers and "Content-Type" in headers:
                    print("  ok - OPTIONS returns 204 with correct headers")
                else:
                    print(f"  FAIL - missing Content-Type in Access-Control-Allow-Headers: {headers}")
                    all_passed = False
            else:
                print(f"  FAIL - missing methods: {methods}")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 10: Unknown route 404
        print("\nTest 10: GET /api/unknown")
        resp = get("/api/unknown")
        if resp.status == 404:
            print("  ok - unknown route returns 404")
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 11: Malformed JSON 400
        print("\nTest 11: PUT /api/state with malformed JSON")
        conn = http.client.HTTPConnection(host, port, timeout=5)
        conn.request("PUT", "/api/state", body="not valid json{", headers={"Content-Type": "application/json"})
        resp = conn.getresponse()
        if resp.status == 400:
            print("  ok - malformed JSON returns 400")
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 12: GET /index.html has injected shim
        print("\nTest 12: GET /index.html injection")
        resp = get("/index.html")
        if resp.status == 200:
            html = resp.read().decode("utf-8")
            if '<script>' in html and 'var KEY="peers_demo_v3"' in html:
                print("  ok - index.html contains injected shim with correct LS key")
            else:
                print("  FAIL - index.html missing shim or wrong LS key")
                all_passed = False
            
            if html.count('<script>') >= 2:
                first_script = html.find('<script>')
                shim_check = html.find('var KEY="peers_demo_v3"')
                if shim_check != -1 and shim_check < first_script + 500:
                    print("  ok - shim appears before original app script")
                else:
                    print("  FAIL - shim position incorrect")
                    all_passed = False
            else:
                print("  FAIL - expected multiple script tags")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 13: GET /mobile.html has injected shim
        print("\nTest 13: GET /mobile.html injection")
        resp = get("/mobile.html")
        if resp.status == 200:
            html = resp.read().decode("utf-8")
            if '<script>' in html and 'var KEY="peers_mobile_v1"' in html:
                print("  ok - mobile.html contains injected shim with correct LS key")
            else:
                print("  FAIL - mobile.html missing shim or wrong LS key")
                all_passed = False
            
            if html.count('<script>') >= 2:
                first_script = html.find('<script>')
                shim_check = html.find('var KEY="peers_mobile_v1"')
                if shim_check != -1 and shim_check < first_script + 500:
                    print("  ok - shim appears before original app script")
                else:
                    print("  FAIL - shim position incorrect")
                    all_passed = False
            else:
                print("  FAIL - expected multiple script tags")
                all_passed = False
        else:
            print(f"  FAIL - status {resp.status}")
            all_passed = False
        
        # Test 14: Verify shim precedes first <script of original
        print("\nTest 14: Shim precedes original <script tag")
        with open(WEB_DIR / "index.html", "r", encoding="utf-8") as f:
            original_html = f.read()
        original_first_script = original_html.find("<script")
        original_before_script = original_html[:original_first_script]
        
        resp = get("/index.html")
        served_html = resp.read().decode("utf-8")
        served_first_script = served_html.find("<script")
        served_second_script = served_html.find("<script", served_first_script + 1)
        
        # The shim is injected before the first <script>, so served should have the shim content
        # before where the original first script tag content begins
        shim_marker = 'var KEY="peers_demo_v3"'
        shim_pos = served_html.find(shim_marker)
        
        if shim_pos != -1 and shim_pos < served_second_script:
            print("  ok - shim injected before original app script")
        else:
            print(f"  FAIL - shim not found or in wrong position (shim_pos:{shim_pos}, second_script:{served_second_script})")
            all_passed = False
        
        print("\n" + "=" * 50)
        if all_passed:
            print("SUMMARY: ALL TESTS PASSED")
            return 0
        else:
            print("SUMMARY: SOME TESTS FAILED")
            return 1
    
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        
        if os.path.exists(temp_db):
            os.remove(temp_db)
        os.rmdir(temp_db_dir)
        print(f"\nCleaned up temp DB: {temp_db}")


if __name__ == "__main__":
    sys.exit(run_tests())
