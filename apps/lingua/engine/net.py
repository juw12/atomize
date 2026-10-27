"""Internet access for downloads and optional online services, behind company proxies.

Internal gateway calls never come through here. For *external* URLs (language
packs, GitHub, online translation) Lingua tries, in order:

1. the ``HTTPS_PROXY`` / ``HTTP_PROXY`` environment proxy,
2. the Windows (Internet Options) proxy from the registry,
3. a direct connection,

and remembers the first one that works for the rest of the session. This
matters on laptops where the environment points at a local proxy helper that
is not running (e.g. ``localhost:3128``) while Windows itself uses the
company proxy.
"""

from __future__ import annotations

import os
import threading

import requests

_lock = threading.Lock()
_chosen: dict | None = None
PROBE_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/README.md"


def _windows_proxy() -> str | None:
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        ) as key:
            enabled = winreg.QueryValueEx(key, "ProxyEnable")[0]
            server = winreg.QueryValueEx(key, "ProxyServer")[0]
    except OSError:
        return None
    if not enabled or not server:
        return None
    server = str(server)
    if "=" in server:  # "http=host:port;https=host:port"
        parts = dict(p.split("=", 1) for p in server.split(";") if "=" in p)
        server = parts.get("https") or parts.get("http") or ""
    if not server:
        return None
    return server if "://" in server else "http://" + server


def candidates() -> list[dict]:
    """Proxy settings to try, most specific first (``{}`` = direct)."""
    options: list[dict] = []
    env = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or os.environ.get("HTTP_PROXY")
    if env:
        options.append({"http": env, "https": env})
    win = _windows_proxy()
    if win and all(o.get("https") != win for o in options):
        options.append({"http": win, "https": win})
    options.append({})
    return options


def proxies(force_probe: bool = False) -> dict:
    """The proxy mapping that reaches the internet (cached after the first probe)."""
    global _chosen
    with _lock:
        if _chosen is not None and not force_probe:
            return _chosen
        for option in candidates():
            try:
                session = requests.Session()
                session.trust_env = False
                session.get(PROBE_URL, proxies=option, timeout=(4, 8)).raise_for_status()
                _chosen = option
                return option
            except requests.RequestException:
                continue
        _chosen = {}
        return _chosen


def session() -> requests.Session:
    """A requests session wired to the working proxy (env proxies ignored)."""
    s = requests.Session()
    s.trust_env = False
    s.proxies.update(proxies())
    s.headers["User-Agent"] = "Lingua"
    return s


def reset() -> None:
    """Forget the chosen proxy (e.g. after the network changed)."""
    global _chosen
    with _lock:
        _chosen = None
