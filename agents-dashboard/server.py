#!/usr/bin/env python3
"""agents-dashboard bridge — connects the local dashboard to an OpenCode server.

Python 3 standard library only (hard project rule: no pip installs, no third
party packages). Serves the dashboard + static files and proxies a running
`opencode serve` instance, normalizing its SSE stream into the fixed event
shape defined in CONTRACT.md.

Usage:
    python server.py                # http://127.0.0.1:8790/
    python server.py --port 9000    # custom bridge port

Modes:
    live  - `opencode serve` is reachable at http://127.0.0.1:4096 and is proxied.
    sim   - upstream unreachable; a scripted simulated event stream is emitted so
            the dashboard stays fully usable/demoable.

The bridge NEVER crashes if OpenCode is missing or slow: it degrades to `sim`.

Auth notes:
    `opencode serve` requires HTTP Basic auth. Credentials are read only from the
    environment (`OPENCODE_SERVER_USERNAME`, `OPENCODE_SERVER_PASSWORD`) and are
    never hardcoded and never printed.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import platform
import queue
import shutil
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = 8790

DEFAULT_UPSTREAM_PORT = 4096
UPSTREAM_URL = f"http://127.0.0.1:{DEFAULT_UPSTREAM_PORT}"
PREFERRED_UPSTREAM_PORTS = (9181, 4096)

# Known install location of the PEGAAi OpenCode binary.
KNOWN_OPENCODE_PATHS = [
    r"~\AppData\Local\PEGAAi Opencode\opencode.exe",
    r"~\AppData\Local\Programs\opencode\opencode.exe",
]

EXTERNAL_BOTS = [
    {
        "name": "vscode-dev-helper",
        "description": "VS Code Dev Helper (A) - in-editor coding agent; run in VS Code.",
        "mode": "external",
    },
    {
        "name": "hermes",
        "description": "Hermes Agent (C) - standalone terminal/messaging agent; run `hermes`.",
        "mode": "external",
    },
    {
        "name": "scout",
        "description": "Scout (B) - web research assistant; run B-km-agent\\scout.py.",
        "mode": "external",
    },
    {
        "name": "langgraph-agent",
        "description": "LangGraph agent (D) - Python ReAct agent w/ tools; run D-langgraph-agent\\agent.py.",
        "mode": "external",
    },
]
EXTERNAL_BOTS_NAMES = {bot["name"] for bot in EXTERNAL_BOTS}

NEW_CONSOLE = 0x00000010 if platform.system() == "Windows" else 0


def launch_external_bot(agent: str, goal: str) -> dict:
    """Start the app/script behind an external bot; returns {ok, detail}."""
    workspace = BASE_DIR.parent / "agents-lab"
    local = os.environ.get("LOCALAPPDATA", "")
    try:
        if agent == "vscode-dev-helper":
            exe = Path(local) / "Programs" / "Microsoft VS Code" / "Code.exe"
            if not exe.exists():
                return {"ok": False, "detail": "VS Code (Code.exe) not found"}
            subprocess.Popen([str(exe), str(workspace / "A-vscode-agent")], close_fds=True)
            return {"ok": True, "detail": "Opened VS Code on A-vscode-agent"}
        if agent == "hermes":
            exe = Path(local) / "hermes" / "bin" / "hermes.exe"
            if not exe.exists():
                return {"ok": False, "detail": "hermes.exe not found"}
            subprocess.Popen([str(exe)], close_fds=True)
            return {"ok": True, "detail": "Started Hermes in a new window"}
        py = workspace / "D-langgraph-agent" / ".venv" / "Scripts" / "python.exe"
        scripts = {
            "scout": workspace / "B-km-agent" / "scout.py",
            "langgraph-agent": workspace / "D-langgraph-agent" / "agent.py",
        }
        script = scripts.get(agent)
        if script is None:
            return {"ok": False, "detail": "no launcher configured"}
        if not py.exists() or not script.exists():
            return {"ok": False, "detail": "venv python or script not found"}
        args = [str(py), str(script)] + ([goal] if goal else [])
        subprocess.Popen(args, cwd=str(script.parent), creationflags=NEW_CONSOLE, close_fds=True)
        return {"ok": True, "detail": f"Started {agent} in a new console"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}

# How long to wait for a freshly spawned `opencode serve` to answer /config.
STARTUP_TIMEOUT = 40.0
PROBE_TIMEOUT = 1.5
# Short timeout used while sweeping many candidate ports during discovery.
DISCOVERY_PROBE_TIMEOUT = 0.4
DISCOVERY_MAX_PORTS = 200

# Background re-discovery / liveness daemon cadence.
REDISCOVER_INTERVAL = 15.0   # seconds between re-discovery attempts while down
LIVENESS_INTERVAL = 30.0     # seconds between cheap liveness probes while live
LIVENESS_TIMEOUT = 2.0       # short timeout for the liveness probe

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8",
}

# CORS applied to every API response so the dashboard also works from file://.
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
}

SSE_HEARTBEAT = 15.0

# Real, todo-derived progress (contract v2).
TODO_POLL_INTERVAL = 2.0     # seconds between todo polls for active sessions
SESSION_IDLE_TTL = 600.0     # drop sessions with no events for ~10 minutes
TODO_POLL_TIMEOUT = 3.0      # per-session upstream todo-fetch timeout

# ---------------------------------------------------------------------------
# Auth (env only — never hardcoded, never logged)
# ---------------------------------------------------------------------------


def auth_header() -> str | None:
    """Build the HTTP Basic Authorization header value, or None when unset."""
    user = os.environ.get("OPENCODE_SERVER_USERNAME") or "opencode"
    password = os.environ.get("OPENCODE_SERVER_PASSWORD")
    if not password:
        return None
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


# ---------------------------------------------------------------------------
# Upstream client (stdlib urllib)
# ---------------------------------------------------------------------------


def _http_get_raw(base_url, path, timeout):
    url = base_url.rstrip("/") + path
    headers = {"Accept": "application/json"}
    auth = auth_header()
    if auth:
        headers["Authorization"] = auth
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return getattr(resp, "status", resp.getcode()), resp.read()
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, exc.read()
        except Exception:
            return exc.code, b""
    except Exception:
        return None, b""


def upstream_request(method, path, body=None, timeout=10.0):
    """Perform an upstream HTTP request. Returns (status, parsed_json_or_None).

    Never raises: on any failure returns (None, None).
    """
    url = UPSTREAM_URL.rstrip("/") + path
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    auth = auth_header()
    if auth:
        headers["Authorization"] = auth
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            status = getattr(resp, "status", resp.getcode())
    except urllib.error.HTTPError as exc:  # server answered with an error status
        try:
            raw = exc.read()
        except Exception:
            raw = b""
        status = exc.code
    except Exception:
        return None, None
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw.decode("utf-8", "replace"))
        except Exception:
            parsed = None
    return status, parsed


def has_opencode_signature(text: str) -> bool:
    if not text:
        return False
    low = text.lower()
    if "$schema" in text and "opencode" in low:
        return True
    return '"openapi"' in low or '"openapi":' in low


def probe_upstream_url(base_url, timeout=DISCOVERY_PROBE_TIMEOUT) -> bool:
    status, raw = _http_get_raw(base_url, "/config", timeout)
    if status != 200:
        return False
    try:
        return has_opencode_signature(raw.decode("utf-8", "replace"))
    except Exception:
        return False


def _url_answers(base_url, timeout=PROBE_TIMEOUT) -> bool:
    status, _ = _http_get_raw(base_url, "/config", timeout)
    if status == 200:
        return True
    status, _ = _http_get_raw(base_url, "/agent", timeout)
    return status == 200


def upstream_ready(timeout=PROBE_TIMEOUT) -> bool:
    """True when the upstream answers an authenticated control endpoint."""
    status, _ = upstream_request("GET", "/config", timeout=timeout)
    if status == 200:
        return True
    # /config may 404 on some builds; fall back to /agent.
    status, _ = upstream_request("GET", "/agent", timeout=timeout)
    return status == 200


def _listening_localhost_ports() -> set:
    ports: set[int] = set()
    if platform.system() == "Windows":
        cmd = ["netstat", "-ano", "-p", "tcp"]
    else:
        cmd = ["netstat", "-tln"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=15).stdout
    except Exception:
        return ports
    for line in out.splitlines():
        parts = line.split()
        if not parts or parts[0].upper() not in ("TCP", "TCP6"):
            continue
        if "LISTEN" not in line.upper():
            continue
        local = None
        for tok in parts[1:5]:
            if ":" in tok:
                local = tok
                break
        if not local:
            continue
        if local.startswith("["):
            host, _, port = local.rpartition("]:")
            host = host.lstrip("[")
        else:
            host, _, port = local.rpartition(":")
        if not port.isdigit():
            continue
        ports.add(int(port))
    return ports


def discover_upstream():
    """Sweep listening localhost ports for a live OpenCode server.

    Returns (base_url, port) or (None, None). Preferred ports are probed first
    even if netstat did not report them (bindings can be missed by parsing).
    """
    ports = _listening_localhost_ports()
    ordered = list(PREFERRED_UPSTREAM_PORTS)
    for p in sorted(ports):
        if p not in ordered:
            ordered.append(p)
    for port in ordered[:DISCOVERY_MAX_PORTS]:
        base = f"http://127.0.0.1:{port}"
        if probe_upstream_url(base, DISCOVERY_PROBE_TIMEOUT):
            return base, port
    return None, None


def find_opencode_executable():
    """Locate the opencode binary via PATH or a known install path."""
    for name in ("opencode", "opencode.exe", "opencode.cmd", "opencode.bat"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in KNOWN_OPENCODE_PATHS:
        if os.path.exists(candidate):
            return candidate
    return None


# ---------------------------------------------------------------------------
# Event broker (fan-out to N concurrent SSE dashboard clients)
# ---------------------------------------------------------------------------


class Broker:
    """Thread-safe publish/subscribe fan-out using per-client queues."""

    def __init__(self):
        self._subs: set[queue.Queue] = set()
        self._lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=2000)
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subs.discard(q)

    def publish(self, event: dict) -> None:
        with self._lock:
            targets = list(self._subs)
        for q in targets:
            try:
                q.put_nowait(event)
            except queue.Full:
                # Slow client: drop rather than block the producer.
                pass

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)


BROKER = Broker()

# ---------------------------------------------------------------------------
# State-change logging (exactly ONE line per live/sim transition — no spam)
# ---------------------------------------------------------------------------

_LOG_LOCK = threading.Lock()
_last_state_log: "tuple[str, str] | None" = None


def _log_state_once(mode: str, url: str = "", detail: str = "") -> None:
    """Print a single concise line, but only when (mode, url) changes."""
    global _last_state_log
    key = (mode, url if mode == "live" else "")
    with _LOG_LOCK:
        if key == _last_state_log:
            return
        _last_state_log = key
    if mode == "live":
        print(f"[bridge] upstream LIVE: {url}", flush=True)
    else:
        extra = f" ({detail})" if detail else ""
        print(f"[bridge] upstream unavailable -> SIM{extra}", flush=True)


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------


class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.mode = "live"                 # "live" | "sim"
        self.connected = False             # upstream reachable right now
        self.spawned_child: subprocess.Popen | None = None
        self.stop_event = threading.Event()
        self.sim_started = False
        self.reader_started = False
        self.reader_thread: threading.Thread | None = None
        # Re-discovery daemon configuration (populated from CLI in main()).
        self.explicit_upstream: str | None = None
        self.rediscover_enabled = True
        self.rediscover_interval = REDISCOVER_INTERVAL
        # Serializes discovery so the daemon and a command-triggered re-discovery
        # never spawn/connect at the same time.
        self.discovery_lock = threading.Lock()
        # Best-effort attribution maps populated by /api/command.
        self.session_agent: dict[str, str] = {}
        self.session_goal: dict[str, str] = {}
        self._busy_sessions: set[str] = set()
        # Active-session tracking for real, todo-derived progress (contract v2):
        # session_id -> last-seen monotonic timestamp. Bounded by idle eviction.
        self.active_sessions: dict[str, float] = {}
        # Poller-owned caches: latest todo summary/list and last-emitted signature.
        self.todo_cache: dict[str, dict] = {}
        self.todo_sig: dict[str, tuple] = {}

    def note_session(self, session_id: str, agent: str, goal_id: str) -> None:
        if not session_id:
            return
        with self.lock:
            self.active_sessions[session_id] = time.monotonic()
            if agent:
                self.session_agent[session_id] = agent
            if goal_id:
                self.session_goal[session_id] = goal_id

    def touch_session(self, session_id: str) -> None:
        if not session_id:
            return
        with self.lock:
            self.active_sessions[session_id] = time.monotonic()

    def evict_idle_sessions(self, ttl: float) -> None:
        now = time.monotonic()
        with self.lock:
            stale = [sid for sid, seen in self.active_sessions.items()
                     if now - seen > ttl]
            for sid in stale:
                self.active_sessions.pop(sid, None)
                self.todo_cache.pop(sid, None)
                self.todo_sig.pop(sid, None)


STATE = State()


# ---------------------------------------------------------------------------
# Event normalization (upstream envelope -> CONTRACT.md event shape)
# ---------------------------------------------------------------------------


def _extract_agent(props: dict, part: dict, session_id: str) -> str:
    for src in (props, part):
        if not isinstance(src, dict):
            continue
        val = src.get("agent")
        if isinstance(val, str) and val:
            return val
        info = src.get("info")
        if isinstance(info, dict) and isinstance(info.get("agent"), str):
            return info["agent"]
    with STATE.lock:
        mapped = STATE.session_agent.get(session_id)
    return mapped or "agent"


def _extract_session_id(props: dict, part: dict) -> str:
    for src in (props, part):
        if isinstance(src, dict):
            for key in ("sessionID", "session_id", "sessionId"):
                val = src.get(key)
                if isinstance(val, str) and val:
                    return val
    return ""


def _base_event(session_id: str, agent: str, phase: str, tool=None, detail=None):
    with STATE.lock:
        goal_id = STATE.session_goal.get(session_id)
    return {
        "ts": int(time.time() * 1000),
        "session_id": session_id or "",
        "agent": agent,
        "phase": phase,
        "tool": tool,
        "detail": detail,
        "goal_id": goal_id or "",
        "raw": None,
    }


def normalize_event(env: dict):
    """Map an upstream `{id, type, properties}` SSE envelope to the contract
    event shape, or return None when the event should not be surfaced."""
    if not isinstance(env, dict):
        return None
    etype = env.get("type") or ""
    props = env.get("properties") if isinstance(env.get("properties"), dict) else {}
    part = props.get("part") if isinstance(props.get("part"), dict) else {}
    session_id = _extract_session_id(props, part)
    if session_id:
        STATE.touch_session(session_id)
    agent = _extract_agent(props, part, session_id)

    phase = None
    tool = None
    detail = None
    extra = None

    if etype == "message.part.updated":
        ptype = part.get("type")
        if ptype == "tool":
            phase = "tool"
            tool = part.get("tool")
            st = part.get("state") if isinstance(part.get("state"), dict) else {}
            detail = st.get("status") or part.get("status")
        elif ptype in ("text", "reasoning"):
            # Transcript relay (contract v3): surface streaming text/reasoning
            # so the dashboard can render the live conversation + result.
            phase = ptype
            detail = ""
            extra = {
                "part_id": part.get("id"),
                "message_id": part.get("messageID"),
                "text": part.get("text"),
            }
        else:
            # Other part types are noise for the office view.
            return None

    elif etype == "session.idle":
        phase = "end"
        detail = "idle"

    elif etype == "session.status":
        status = props.get("status")
        busy = False
        if isinstance(status, dict):
            busy = status.get("type") == "busy"
        elif isinstance(status, str):
            busy = status == "busy"
        with STATE.lock:
            was_busy = session_id in STATE._busy_sessions
            if busy:
                STATE._busy_sessions.add(session_id)
            else:
                STATE._busy_sessions.discard(session_id)
        if busy and not was_busy:
            phase = "start"
            detail = "busy"
        else:
            return None

    elif etype == "session.error":
        phase = "error"
        err = props.get("error")
        if isinstance(err, dict):
            detail = err.get("message") or err.get("name")
        if not detail:
            detail = "session error"

    elif etype == "permission.asked":
        phase = "permission"
        detail = props.get("permission") or "permission requested"
        # Preserve the permission id at raw.id for the dashboard.
        env = dict(env)
        env["id"] = props.get("id") or env.get("id")

    else:
        # Unknown but non-empty event types are surfaced as info so nothing is
        # silently hidden from the operator.
        if not etype:
            return None
        phase = "info"
        detail = etype

    ev = _base_event(session_id, agent, phase, tool, detail)
    ev.pop("raw", None)
    if extra:
        ev.update(extra)
    ev["raw"] = env
    return ev


# ---------------------------------------------------------------------------
# Real, todo-derived progress (contract v2)
# ---------------------------------------------------------------------------


def _normalize_todos(data):
    """Coerce upstream `GET /session/{id}/todo` payload into a list of dicts."""
    out = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            out.append({
                "content": item.get("content") or "",
                "status": item.get("status") or "",
                "priority": item.get("priority"),
            })
    return out


def _summarize_todos(todos) -> dict:
    completed = total = in_progress = 0
    for item in todos:
        total += 1
        status = item.get("status") if isinstance(item, dict) else None
        if status == "completed":
            completed += 1
        elif status == "in_progress":
            in_progress += 1
    return {"completed": completed, "total": total, "in_progress": in_progress}


def _progress_event(session_id: str, summary: dict) -> dict:
    """Build the contract-v2 `phase:"progress"` normalized event."""
    with STATE.lock:
        agent = STATE.session_agent.get(session_id, "")
        goal_id = STATE.session_goal.get(session_id, "")
    completed = summary.get("completed", 0)
    total = summary.get("total", 0)
    in_progress = summary.get("in_progress", 0)
    return {
        "ts": int(time.time() * 1000),
        "session_id": session_id or "",
        "agent": agent or "",
        "phase": "progress",
        "tool": None,
        "detail": f"{completed}/{total}",
        "goal_id": goal_id or "",
        "progress": {
            "completed": completed,
            "total": total,
            "in_progress": in_progress,
        },
        "raw": None,
    }


def _poll_todos_once() -> None:
    """Poll every active session's todo list once (live mode only)."""
    with STATE.lock:
        mode = STATE.mode
    STATE.evict_idle_sessions(SESSION_IDLE_TTL)
    if mode != "live":
        return
    with STATE.lock:
        sessions = list(STATE.active_sessions.keys())
    for sid in sessions:
        if STATE.stop_event.is_set():
            return
        status, data = upstream_request(
            "GET", f"/session/{sid}/todo", timeout=TODO_POLL_TIMEOUT)
        if status != 200:
            continue  # unknown/sim/expired session: skip (never fabricate)
        todos = _normalize_todos(data)
        summary = _summarize_todos(todos)
        sig = (summary["completed"], summary["total"], summary["in_progress"])
        with STATE.lock:
            changed = STATE.todo_sig.get(sid) != sig
            STATE.todo_cache[sid] = {
                "completed": summary["completed"],
                "total": summary["total"],
                "in_progress": summary["in_progress"],
                "todos": todos,
            }
            STATE.todo_sig[sid] = sig
        if changed:
            BROKER.publish(_progress_event(sid, summary))


def _run_todo_poller() -> None:
    while not STATE.stop_event.is_set():
        try:
            _poll_todos_once()
        except Exception:
            pass
        if STATE.stop_event.wait(TODO_POLL_INTERVAL):
            break


def _start_todo_poller() -> None:
    threading.Thread(target=_run_todo_poller, name="todo-poller", daemon=True).start()


# ---------------------------------------------------------------------------
# Upstream SSE reader (live mode)
# ---------------------------------------------------------------------------


def _run_upstream_reader() -> None:
    attempts = 0
    while not STATE.stop_event.is_set():
        with STATE.lock:
            mode = STATE.mode
            rediscover = STATE.rediscover_enabled
        # While in sim with re-discovery enabled, idle: the health daemon flips
        # us back to live (and the reader reconnects to the new URL) on success.
        if rediscover and mode != "live":
            STATE.stop_event.wait(2.0)
            continue
        try:
            auth = auth_header()
            headers = {"Accept": "text/event-stream"}
            if auth:
                headers["Authorization"] = auth
            req = urllib.request.Request(UPSTREAM_URL + "/event", headers=headers, method="GET")
            resp = urllib.request.urlopen(req, timeout=60)
            attempts = 0
            with STATE.lock:
                STATE.connected = True
            try:
                for raw_line in resp:
                    if STATE.stop_event.is_set():
                        break
                    line = raw_line.decode("utf-8", "replace").strip()
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        env = json.loads(payload)
                    except Exception:
                        continue
                    event = normalize_event(env)
                    if event:
                        BROKER.publish(event)
            finally:
                try:
                    resp.close()
                except Exception:
                    pass
        except Exception:
            with STATE.lock:
                STATE.connected = False
            if STATE.stop_event.is_set():
                break
            attempts += 1
            if not rediscover and attempts >= 3:
                _degrade_to_sim("upstream event stream lost")
                return
            STATE.stop_event.wait(2.0)
            continue
        # Stream ended without an exception (server closed it): mark disconnected
        # and loop so the reader reconnects once the daemon re-establishes live.
        with STATE.lock:
            STATE.connected = False
        if STATE.stop_event.is_set():
            break
        if not rediscover:
            attempts += 1
            if attempts >= 3:
                _degrade_to_sim("upstream event stream lost")
                return
        STATE.stop_event.wait(1.0)


def _degrade_to_sim(reason: str) -> None:
    with STATE.lock:
        if STATE.mode == "sim":
            return
        STATE.mode = "sim"
        STATE.connected = False
    _start_sim_emitter()
    _log_state_once("sim", "", reason)
    BROKER.publish(_sim_event("system", "info", None, f"degraded to sim: {reason}"))


# ---------------------------------------------------------------------------
# Simulated event emitter (sim mode)
# ---------------------------------------------------------------------------


def _sim_event(agent, phase, tool, detail, session_id="sim-0001", goal_id="goal-001"):
    return {
        "ts": int(time.time() * 1000),
        "session_id": session_id,
        "agent": agent,
        "phase": phase,
        "tool": tool,
        "detail": detail,
        "goal_id": goal_id,
        "raw": {"sim": True},
    }


def _external_event(agent, phase, detail, session_id, goal_id):
    return {
        "ts": int(time.time() * 1000),
        "session_id": session_id,
        "agent": agent,
        "phase": phase,
        "tool": None,
        "detail": detail,
        "goal_id": goal_id,
        "raw": {"external": True},
    }


# (delay_seconds, agent, phase, tool, detail, goal_id)
SIM_DEMO_TIMELINE = [
    (1.0, "leader", "start", None, "Initiating sprint planning", "goal-001"),
    (1.5, "coder", "start", None, "Starting feature implementation", "goal-002"),
    (1.2, "coder", "tool", "file_write", "Writing auth module", "goal-002"),
    (1.0, "tester", "start", None, "Preparing test cases", "goal-002"),
    (1.2, "coder", "tool", "git_commit", "Commit: Add auth handlers", "goal-002"),
    (1.2, "checker", "start", None, "Code review started", "goal-002"),
    (1.2, "tester", "tool", "run_tests", "Running unit tests", "goal-002"),
    (1.2, "checker", "tool", "review_diff", "Reviewing auth module", "goal-002"),
    (1.2, "coder", "end", None, "Feature complete", "goal-002"),
    (1.0, "tester", "end", None, "All tests passing", "goal-002"),
    (1.0, "leader", "tool", "sync", "Team sync complete", "goal-001"),
    (1.0, "leader", "end", None, "Sprint planning complete", "goal-001"),
]

_SIM_EXTRAS: "queue.Queue[tuple[float, dict]]" = queue.Queue()


def _start_sim_emitter() -> None:
    with STATE.lock:
        if STATE.sim_started:
            return
        STATE.sim_started = True

    def loop():
        # Scripted demo timeline first, so a fresh dashboard has content.
        for delay, agent, phase, tool, detail, goal_id in SIM_DEMO_TIMELINE:
            if STATE.stop_event.wait(delay):
                return
            with STATE.lock:
                if STATE.mode != "sim":
                    continue
            BROKER.publish(_sim_event(agent, phase, tool, detail, goal_id=goal_id))
        # Then idle: drain command extras, else periodic info heartbeat.
        while not STATE.stop_event.is_set():
            try:
                delay, event = _SIM_EXTRAS.get(timeout=8.0)
            except queue.Empty:
                with STATE.lock:
                    in_sim = STATE.mode == "sim"
                if in_sim:
                    BROKER.publish(_sim_event("system", "info", None, "idle — sim mode"))
                continue
            if STATE.stop_event.wait(delay):
                return
            with STATE.lock:
                if STATE.mode != "sim":
                    continue
            BROKER.publish(event)

    threading.Thread(target=loop, name="sim-emitter", daemon=True).start()


def _sim_command_response(goal: str, agent: str, session_id: str, goal_id: str) -> None:
    """Queue a short scripted reaction to a POST /api/command in sim mode."""
    agent = agent or "build"
    _SIM_EXTRAS.put((0.3, _sim_event(
        agent, "start", None, f"Received goal: {goal[:80]}", session_id, goal_id)))
    _SIM_EXTRAS.put((0.9, _sim_event(
        agent, "tool", "file_write", "Working on goal (sim)", session_id, goal_id)))
    _SIM_EXTRAS.put((0.9, _sim_event(
        agent, "end", None, "Goal acknowledged (sim)", session_id, goal_id)))


# ---------------------------------------------------------------------------
# Upstream bring-up + process management
# ---------------------------------------------------------------------------


def _spawn_opencode() -> subprocess.Popen | None:
    exe = find_opencode_executable()
    if not exe:
        return None
    args = [exe, "serve", "--port", str(DEFAULT_UPSTREAM_PORT), "--hostname", "127.0.0.1"]
    try:
        creationflags = 0
        # Detach the child from the console where supported.
        if hasattr(subprocess, "CREATE_NO_WINDOW"):
            creationflags = subprocess.CREATE_NO_WINDOW
        proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        return proc
    except Exception:
        return None


def _set_live(base_url: str) -> None:
    global UPSTREAM_URL
    UPSTREAM_URL = base_url.rstrip("/")
    with STATE.lock:
        STATE.mode = "live"
        STATE.connected = True
    _log_state_once("live", UPSTREAM_URL)
    _start_upstream_reader()


def _set_sim(reason: str = "") -> None:
    with STATE.lock:
        STATE.mode = "sim"
        STATE.connected = False
    _log_state_once("sim", "", reason)
    _start_sim_emitter()


def bring_up_upstream(explicit_url=None) -> None:
    """Decide live vs sim: prefer an already-running OpenCode server, else spawn.

    Runs in the background so the bridge serves HTTP immediately.
    """
    global UPSTREAM_URL

    if explicit_url:
        base = explicit_url.rstrip("/")
        UPSTREAM_URL = base
        if _url_answers(base):
            _set_live(base)
        else:
            _set_sim()
        return

    base, _port = discover_upstream()
    if base:
        _set_live(base)
        return

    child = _spawn_opencode()
    if child is None:
        _set_sim()
        return

    with STATE.lock:
        STATE.spawned_child = child
    UPSTREAM_URL = f"http://127.0.0.1:{DEFAULT_UPSTREAM_PORT}"

    deadline = time.time() + STARTUP_TIMEOUT
    while time.time() < deadline and not STATE.stop_event.is_set():
        if child.poll() is not None:
            break  # child exited early
        if upstream_ready(timeout=1.0):
            _set_live(UPSTREAM_URL)
            return
        time.sleep(1.0)

    # Never became ready -> clean up OUR child and fall back to sim.
    _terminate_child()
    _set_sim()


def _start_upstream_reader() -> None:
    with STATE.lock:
        if STATE.reader_started:
            return
        STATE.reader_started = True
        thread = threading.Thread(
            target=_run_upstream_reader, name="upstream-sse", daemon=True)
        STATE.reader_thread = thread
    thread.start()


def _terminate_child() -> None:
    child = STATE.spawned_child
    if child is None:
        return
    with STATE.lock:
        STATE.spawned_child = None
    try:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except Exception:
                child.kill()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Re-discovery / liveness daemon
# ---------------------------------------------------------------------------


def _rediscover_once(fast: bool = False) -> None:
    """Run the discovery sequence once, serialized against other callers.

    fast=True (used by /api/command recovery) skips the spawn path so the HTTP
    handler never blocks on a 40s startup wait; it only re-attaches to a moved
    already-running server via CLI/env override or a localhost port scan.
    """
    if not STATE.discovery_lock.acquire(blocking=False):
        return  # another discovery is already in flight
    try:
        if STATE.stop_event.is_set():
            return
        explicit = STATE.explicit_upstream
        if fast and not explicit:
            base, _port = discover_upstream()
            if base:
                _set_live(base)
            return
        bring_up_upstream(explicit)
    finally:
        STATE.discovery_lock.release()


def _run_health_daemon() -> None:
    interval = STATE.rediscover_interval
    while not STATE.stop_event.is_set():
        with STATE.lock:
            mode = STATE.mode
            connected = STATE.connected
            alive = STATE.reader_thread is not None and STATE.reader_thread.is_alive()

        if mode == "live" and connected:
            if not alive:
                # Reader died unexpectedly: clear the guard and restart it.
                with STATE.lock:
                    STATE.reader_started = False
                _start_upstream_reader()
            if STATE.stop_event.wait(LIVENESS_INTERVAL):
                break
            with STATE.lock:
                still_live = STATE.mode == "live"
            if not still_live:
                continue
            if upstream_ready(timeout=LIVENESS_TIMEOUT):
                continue
            with STATE.lock:
                STATE.connected = False
            _rediscover_once()
            continue

        if STATE.stop_event.wait(interval):
            break
        _rediscover_once()


def _start_health_daemon() -> None:
    if not STATE.rediscover_enabled:
        return
    threading.Thread(target=_run_health_daemon, name="health-daemon", daemon=True).start()


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "AgentsDashboardBridge/1.0"

    # -- logging ---------------------------------------------------------
    def log_message(self, fmt, *args):  # keep the console calm
        return

    # -- helpers ---------------------------------------------------------
    def _cors(self):
        for key, value in CORS_HEADERS.items():
            self.send_header(key, value)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            length = 0
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8", "replace"))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    # -- routing ---------------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._api_health()
        if path == "/api/agents":
            return self._api_agents()
        if path == "/api/sessions":
            return self._api_sessions()
        if path == "/api/todos":
            return self._api_todos()
        if path == "/api/messages":
            return self._api_messages()
        if path == "/api/events":
            return self._api_events()
        if path.startswith("/api/"):
            return self._send_json({"ok": False, "error": "not found"}, status=404)
        return self._serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/command":
            return self._api_command()
        if path == "/api/permission":
            return self._api_permission()
        return self._send_json({"ok": False, "error": "not found"}, status=404)

    # -- API: health -----------------------------------------------------
    def _api_health(self):
        with STATE.lock:
            mode = STATE.mode
            connected = STATE.connected
        self._send_json({
            "ok": True,
            "mode": mode,
            "opencode": {"connected": connected, "url": UPSTREAM_URL},
        })

    # -- API: agents -----------------------------------------------------
    def _api_agents(self):
        with STATE.lock:
            mode = STATE.mode
        if mode == "live":
            status, data = upstream_request("GET", "/agent", timeout=5.0)
            agents = self._normalize_agents(data) if status == 200 else None
            if agents is not None:
                return self._send_json({"agents": agents + EXTERNAL_BOTS})
        return self._send_json({"agents": self._sim_agents() + EXTERNAL_BOTS})

    @staticmethod
    def _normalize_agents(data):
        if data is None:
            return None
        items = data if isinstance(data, list) else (
            data.get("agents") if isinstance(data, dict) else None)
        if not isinstance(items, list):
            return None
        out = []
        for item in items:
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("id") or item.get("agent")
            if not name:
                continue
            out.append({
                "name": name,
                "description": item.get("description") or "",
                "mode": item.get("mode") or item.get("type") or "",
            })
        return out

    @staticmethod
    def _sim_agents():
        return [
            {"name": "build", "description": "Primary build agent", "mode": "primary"},
            {"name": "plan", "description": "Planning agent", "mode": "primary"},
            {"name": "coder", "description": "Implementation specialist", "mode": "subagent"},
            {"name": "tester", "description": "Test author and runner", "mode": "subagent"},
            {"name": "checker", "description": "Code reviewer", "mode": "subagent"},
            {"name": "explore", "description": "Codebase explorer", "mode": "subagent"},
            {"name": "media", "description": "Asset generation", "mode": "subagent"},
        ]

    # -- API: sessions ---------------------------------------------------
    def _api_sessions(self):
        with STATE.lock:
            mode = STATE.mode
        if mode == "live":
            status, data = upstream_request("GET", "/session", timeout=5.0)
            sessions = self._normalize_sessions(data) if status == 200 else None
            if sessions is not None:
                return self._send_json({"sessions": sessions})
        return self._send_json({"sessions": []})

    @staticmethod
    def _normalize_sessions(data):
        if data is None:
            return None
        items = data if isinstance(data, list) else (
            data.get("sessions") if isinstance(data, dict) else None)
        if not isinstance(items, list):
            return None
        out = []
        for item in items:
            if not isinstance(item, dict):
                continue
            sid = item.get("id")
            if not sid:
                continue
            out.append({
                "id": sid,
                "title": item.get("title") or "",
                "directory": item.get("directory") or item.get("path") or "",
            })
        return out

    # -- API: todos ------------------------------------------------------
    def _api_todos(self):
        with STATE.lock:
            out = {}
            for sid, entry in STATE.todo_cache.items():
                out[sid] = {
                    "completed": entry.get("completed", 0),
                    "total": entry.get("total", 0),
                    "in_progress": entry.get("in_progress", 0),
                    "todos": list(entry.get("todos") or []),
                }
        self._send_json(out)

    # -- API: messages (raw transcript proxy) ----------------------------
    def _api_messages(self):
        params = parse_qs(urlparse(self.path).query)
        session_id = (params.get("session") or [""])[0].strip()
        if not session_id:
            return self._send_json({"error": "missing session"}, status=400)
        with STATE.lock:
            mode = STATE.mode
        if mode != "live":
            return self._send_json([])
        status, data = upstream_request(
            "GET", f"/session/{session_id}/message", timeout=10.0)
        if status is None:
            return self._send_json({"error": "upstream unavailable"}, status=502)
        if status != 200:
            return self._send_json(
                data if data is not None else {"error": "upstream error"},
                status=status)
        return self._send_json(data if data is not None else [])

    # -- API: SSE events -------------------------------------------------
    def _api_events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.end_headers()

        q = BROKER.subscribe()
        try:
            # Prime the stream so clients connect immediately.
            self._sse_write(f": connected\n\n")
            while not STATE.stop_event.is_set():
                try:
                    event = q.get(timeout=SSE_HEARTBEAT)
                except queue.Empty:
                    self._sse_write(": ping\n\n")
                    continue
                self._sse_write("data: " + json.dumps(event) + "\n\n")
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            BROKER.unsubscribe(q)
            self.close_connection = True

    def _sse_write(self, text: str) -> None:
        data = text.encode("utf-8")
        self.wfile.write(data)
        try:
            self.wfile.flush()
        except Exception:
            pass

    # -- API: command ----------------------------------------------------
    def _api_command(self):
        body = self._read_json_body()
        goal = str(body.get("goal") or "").strip()
        agent = str(body.get("agent") or "build").strip() or "build"
        session_id = body.get("session_id")
        session_id = str(session_id).strip() if session_id else ""

        if agent in EXTERNAL_BOTS_NAMES:
            sid = f"ext-{int(time.time() * 1000)}"
            goal_id = f"goal-{sid[-6:]}"
            STATE.note_session(sid, agent, goal_id)
            BROKER.publish(_external_event(
                agent, "start", f"Received goal: {goal[:80]}", sid, goal_id))
            result = launch_external_bot(agent, goal)
            BROKER.publish(_external_event(
                agent,
                "info" if result.get("ok") else "error",
                result.get("detail", ""),
                sid,
                goal_id,
            ))
            return self._send_json({
                "ok": True,
                "session_id": sid,
                "mode": "external",
                "launched": result.get("ok", False),
                "note": result.get("detail", ""),
            })

        with STATE.lock:
            mode = STATE.mode
            allow_recover = STATE.rediscover_enabled

        if mode == "live":
            sid = self._live_command(goal, agent, session_id)
            if sid:
                return self._send_json({"ok": True, "session_id": sid, "mode": "live"})
            # Upstream write failed against the current upstream: re-discover
            # ONCE, retry ONCE, then degrade this command to sim.
            if allow_recover:
                _rediscover_once(fast=True)
                with STATE.lock:
                    mode = STATE.mode
                if mode == "live":
                    sid = self._live_command(goal, agent, session_id)
                    if sid:
                        return self._send_json(
                            {"ok": True, "session_id": sid, "mode": "live"})
            # Upstream write genuinely failed -> degrade this command to sim.
            sim_sid = self._sim_command(goal, agent)
            return self._send_json({"ok": True, "session_id": sim_sid, "mode": "sim"})

        sim_sid = self._sim_command(goal, agent, session_id)
        return self._send_json({"ok": True, "session_id": sim_sid, "mode": "sim"})

    def _live_command(self, goal, agent, session_id):
        sid = session_id
        if not sid:
            status, data = upstream_request(
                "POST", "/session", {"title": (goal or "dashboard goal")[:80]}, timeout=10.0)
            if status not in (200, 201) or not isinstance(data, dict):
                return None
            sid = data.get("id")
            if not sid:
                session_obj = data.get("session")
                if isinstance(session_obj, dict):
                    sid = session_obj.get("id")
            if not sid:
                return None
        goal_id = f"goal-{sid[-6:]}" if sid else "goal-000"
        STATE.note_session(sid, agent, goal_id)
        payload = {"agent": agent, "parts": [{"type": "text", "text": goal}]}
        # prompt_async is fire-and-forget (204): return without blocking on the turn.
        status, _ = upstream_request(
            "POST", f"/session/{sid}/prompt_async", payload, timeout=15.0)
        if status == 404:
            status, _ = upstream_request(
                "POST", f"/session/{sid}/message", payload, timeout=15.0)
        if status not in (200, 201, 202, 204):
            return None
        return sid

    @staticmethod
    def _sim_command(goal, agent, session_id=""):
        sid = session_id or f"sim-{int(time.time() * 1000)}"
        goal_id = f"goal-{sid[-6:]}"
        STATE.note_session(sid, agent, goal_id)
        _sim_command_response(goal, agent, sid, goal_id)
        return sid

    # -- API: permission -------------------------------------------------
    def _api_permission(self):
        body = self._read_json_body()
        perm_id = str(body.get("id") or "").strip()
        reply = str(body.get("reply") or "").strip()
        if not perm_id or reply not in ("once", "always", "reject"):
            return self._send_json({"ok": False, "error": "invalid id or reply"}, status=400)
        with STATE.lock:
            mode = STATE.mode
        if mode == "live":
            status, _ = upstream_request(
                "POST", f"/permission/{perm_id}/reply", {"reply": reply}, timeout=10.0)
            return self._send_json({"ok": status in (200, 201, 202, 204)})
        return self._send_json({"ok": True})

    # -- static files ----------------------------------------------------
    def _serve_static(self, path):
        if path in ("/", ""):
            rel = "index.html"
        else:
            rel = unquote(path.lstrip("/"))
        candidate = (BASE_DIR / rel).resolve()
        try:
            candidate.relative_to(BASE_DIR)
        except ValueError:
            return self._send_json({"ok": False, "error": "forbidden"}, status=403)

        if not candidate.is_file():
            # Serve the front-end preview as the root fallback if index.html
            # has not been produced yet; otherwise 404.
            if rel == "index.html":
                fallback = BASE_DIR / "preview.html"
                if fallback.is_file():
                    return self._send_file(fallback)
            return self._send_json({"ok": False, "error": "not found"}, status=404)
        return self._send_file(candidate)

    def _send_file(self, path: Path):
        try:
            data = path.read_bytes()
        except OSError:
            return self._send_json({"ok": False, "error": "read error"}, status=500)
        ctype = CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="agents-dashboard bridge")
    parser.add_argument("--port", type=int, default=int(os.environ.get("BRIDGE_PORT") or BRIDGE_PORT),
                        help="bridge HTTP port (default 8790)")
    parser.add_argument("--host", default=BRIDGE_HOST, help="bridge bind host (default 127.0.0.1)")
    parser.add_argument("--upstream", default=None,
                        help="explicit upstream OpenCode server base URL (overrides discovery)")
    parser.add_argument("--rediscover-interval", type=float, default=REDISCOVER_INTERVAL,
                        help="seconds between upstream re-discovery attempts (default 15)")
    parser.add_argument("--no-rediscover", action="store_true",
                        help="disable the background re-discovery/liveness daemon")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    httpd = ThreadingHTTPServer((args.host, args.port), BridgeHandler)
    httpd.daemon_threads = True

    # Graceful shutdown: SIGINT (Ctrl-C), SIGTERM, and on Windows SIGBREAK all
    # stop the loop and, via the finally block, terminate the child we spawned.
    def _handle_stop(signum, frame):
        STATE.stop_event.set()
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    for signame in ("SIGINT", "SIGTERM", "SIGBREAK"):
        sig = getattr(signal, signame, None)
        if sig is not None:
            try:
                signal.signal(sig, _handle_stop)
            except (ValueError, OSError):
                pass

    explicit_upstream = args.upstream or os.environ.get("OPENCODE_SERVER_URL") or None

    STATE.explicit_upstream = explicit_upstream
    STATE.rediscover_enabled = not args.no_rediscover
    try:
        STATE.rediscover_interval = max(2.0, float(args.rediscover_interval))
    except (TypeError, ValueError):
        STATE.rediscover_interval = REDISCOVER_INTERVAL

    # Bring up upstream (and decide live vs sim) without blocking HTTP serving.
    # Goes through the serialized re-discovery path so it can never race the
    # health daemon into spawning two servers.
    threading.Thread(target=_rediscover_once, name="upstream-bringup",
                     daemon=True).start()

    # Background daemon: re-discovers a server that appears/restarts AFTER us,
    # and health-checks the current upstream, logging only on state change.
    _start_health_daemon()

    # Background daemon: polls active sessions' todo lists for real progress.
    _start_todo_poller()

    print(f"agents-dashboard bridge listening on http://{args.host}:{args.port}/")
    target = explicit_upstream or f"discovering on 127.0.0.1 (prefer {PREFERRED_UPSTREAM_PORTS[0]}/{PREFERRED_UPSTREAM_PORTS[1]})"
    print(f"upstream: {target}  (auth: {'env' if os.environ.get('OPENCODE_SERVER_PASSWORD') else 'none'})", flush=True)
    if STATE.rediscover_enabled:
        print(f"rediscovery: on (re-check every {STATE.rediscover_interval:g}s, live probe every {LIVENESS_INTERVAL:g}s)", flush=True)
    else:
        print("rediscovery: off", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        print("shutting down...", flush=True)
        STATE.stop_event.set()
        try:
            httpd.shutdown()
        except Exception:
            pass
        httpd.server_close()
        _terminate_child()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
