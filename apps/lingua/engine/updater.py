"""Lingua self-update: check GitHub Releases, download, swap files, restart.

Flow (Windows build only):

1. ``check_for_update()`` reads the GitHub releases list and picks the newest
   non-draft, non-prerelease ``lingua-vX.Y.Z`` release that is newer than the
   running version and has a ``Lingua-windows*.zip`` asset.
2. ``download_update()`` streams the zip to a temp folder (with progress) and,
   when the release notes carry ``sha256: <hex>``, verifies the checksum.
3. ``stage_update()`` unpacks it and finds the folder that holds ``Lingua.exe``.
4. ``launch_apply()`` writes a small ``apply-update.cmd`` that waits for this
   process to exit, copies the new files over the install folder (keeping the
   user's ``lingua.env``) and starts Lingua again. The app then quits.

No third-party packages and no network at import time. The release list URL
can be overridden with ``LINGUA_UPDATE_URL`` (used by tests).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from typing import Callable

from engine.version import (
    RELEASE_ASSET_PREFIX,
    RELEASE_REPO,
    RELEASE_TAG_PREFIX,
    __version__,
)

DEFAULT_RELEASES_URL = "https://api.github.com/repos/" + RELEASE_REPO + "/releases?per_page=30"
EXE_NAME = "Lingua.exe"
KEEP_FILES = ("lingua.env",)

_SHA_RE = re.compile(r"sha256[:=\s]+([0-9a-fA-F]{64})")


class UpdateError(Exception):
    """Raised when checking, downloading or staging an update fails."""


@dataclass
class UpdateInfo:
    version: str
    tag: str
    notes: str
    url: str
    size: int
    page: str
    sha256: str | None = None


def parse_version(text: str) -> tuple[int, ...] | None:
    """``"lingua-v2.1.0"`` / ``"v2.1"`` / ``"2.1.0"`` -> ``(2, 1, 0)``; None if not a version."""
    match = re.search(r"(\d+(?:\.\d+){0,3})", text or "")
    if not match:
        return None
    parts = [int(p) for p in match.group(1).split(".")]
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def is_newer(candidate: str, current: str) -> bool:
    new = parse_version(candidate)
    old = parse_version(current)
    return bool(new and old and new > old)


def pick_update(releases: list[dict], current: str = __version__) -> UpdateInfo | None:
    """Choose the best newer release from a GitHub releases API list."""
    best: UpdateInfo | None = None
    for rel in releases or []:
        tag = str(rel.get("tag_name") or "")
        if not tag.startswith(RELEASE_TAG_PREFIX):
            continue
        if rel.get("draft") or rel.get("prerelease"):
            continue
        version = tag[len(RELEASE_TAG_PREFIX):]
        if not is_newer(version, current):
            continue
        asset = None
        for item in rel.get("assets") or []:
            name = str(item.get("name") or "")
            if name.startswith(RELEASE_ASSET_PREFIX) and name.lower().endswith(".zip"):
                asset = item
                break
        if asset is None:
            continue
        notes = str(rel.get("body") or "")
        sha = _SHA_RE.search(notes)
        info = UpdateInfo(
            version=version,
            tag=tag,
            notes=notes,
            url=str(asset.get("browser_download_url") or ""),
            size=int(asset.get("size") or 0),
            page=str(rel.get("html_url") or ""),
            sha256=sha.group(1).lower() if sha else None,
        )
        if best is None or parse_version(info.version) > parse_version(best.version):
            best = info
    return best


def _open(url: str, timeout: float):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Lingua/" + __version__,
            "Accept": "application/vnd.github+json, application/octet-stream, */*",
        },
    )
    return urllib.request.urlopen(request, timeout=timeout)  # noqa: S310 - fixed https/local URL


def fetch_releases(url: str | None = None, timeout: float = 8.0) -> list[dict]:
    url = url or os.environ.get("LINGUA_UPDATE_URL") or DEFAULT_RELEASES_URL
    try:
        with _open(url, timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as err:  # network, HTTP or JSON problems
        raise UpdateError("could not check for updates: " + str(err)) from err
    if isinstance(data, dict):  # single-release endpoint
        data = [data]
    if not isinstance(data, list):
        raise UpdateError("unexpected reply from the update server")
    return data


def check_for_update(current: str = __version__, url: str | None = None) -> UpdateInfo | None:
    """Return the newest available update, or None when Lingua is up to date."""
    return pick_update(fetch_releases(url), current)


def download_update(
    info: UpdateInfo,
    dest_dir: str | None = None,
    progress: Callable[[int, int], None] | None = None,
    timeout: float = 30.0,
) -> str:
    """Download the release zip; returns its path. Verifies sha256 when published."""
    if not info.url:
        raise UpdateError("release has no download link")
    dest_dir = dest_dir or tempfile.mkdtemp(prefix="lingua-update-")
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(dest_dir, "Lingua-" + info.version + ".zip")
    digest = hashlib.sha256()
    done = 0
    try:
        with _open(info.url, timeout) as resp, open(path, "wb") as out:
            total = int(resp.headers.get("Content-Length") or info.size or 0)
            while True:
                chunk = resp.read(256 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if progress is not None:
                    progress(done, total)
    except Exception as err:
        raise UpdateError("download failed: " + str(err)) from err
    if info.sha256 and digest.hexdigest() != info.sha256:
        os.remove(path)
        raise UpdateError("download is damaged (checksum mismatch); please try again")
    if not zipfile.is_zipfile(path):
        raise UpdateError("download is not a valid zip file")
    return path


def stage_update(zip_path: str, staging_dir: str | None = None) -> str:
    """Unpack the zip and return the folder that contains ``Lingua.exe``."""
    staging_dir = staging_dir or os.path.join(os.path.dirname(zip_path), "staged")
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.namelist():
            target = os.path.realpath(os.path.join(staging_dir, member))
            if not target.startswith(os.path.realpath(staging_dir)):
                raise UpdateError("unsafe path in update zip: " + member)
        archive.extractall(staging_dir)
    for root, _dirs, files in os.walk(staging_dir):
        if EXE_NAME in files:
            return root
    raise UpdateError("update zip does not contain " + EXE_NAME)


def build_apply_script(staged_dir: str, install_dir: str, pid: int, log_path: str) -> str:
    """Batch script: wait for ``pid`` to exit, mirror files, relaunch."""
    excludes = " ".join('"' + name + '"' for name in KEEP_FILES)
    exe = os.path.join(install_dir, EXE_NAME)
    return "\r\n".join([
        "@echo off",
        "setlocal",
        "set /a tries=0",
        ":wait",
        'tasklist /FI "PID eq {pid}" /NH 2>nul | find "{pid}" >nul'.format(pid=pid),
        "if not errorlevel 1 (",
        "  set /a tries+=1",
        "  if %tries% GEQ 60 goto copy",
        "  timeout /t 1 /nobreak >nul",
        "  goto wait",
        ")",
        ":copy",
        'robocopy "{src}" "{dst}" /E /XF {ex} /R:5 /W:1 /NP /NFL /NDL > "{log}"'.format(
            src=staged_dir, dst=install_dir, ex=excludes, log=log_path),
        "if %ERRORLEVEL% GEQ 8 (",
        '  echo update copy failed with code %ERRORLEVEL% >> "{log}"'.format(log=log_path),
        ")",
        'start "" "{exe}" --updated'.format(exe=exe),
        "endlocal",
        "",
    ])


def launch_apply(staged_dir: str, install_dir: str | None = None, pid: int | None = None) -> str:
    """Write and start the apply script detached; caller should then exit the app."""
    install_dir = install_dir or current_install_dir()
    pid = pid or os.getpid()
    work = os.path.dirname(staged_dir.rstrip("\\/")) or tempfile.gettempdir()
    log_path = os.path.join(tempfile.gettempdir(), "lingua-update.log")
    script = os.path.join(work, "apply-update.cmd")
    with open(script, "w", encoding="mbcs" if os.name == "nt" else "utf-8", newline="") as fh:
        fh.write(build_apply_script(staged_dir, install_dir, pid, log_path))
    flags = 0
    if os.name == "nt":
        # Hidden console (not DETACHED_PROCESS): console tools in the script such as
        # tasklist | find hang without a console. The child outlives Lingua either way.
        flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(  # noqa: S603 - our own script
        ["cmd.exe", "/c", script],
        creationflags=flags,
        close_fds=True,
        cwd=tempfile.gettempdir(),
    )
    return script


def is_frozen() -> bool:
    """True when running as the packaged Lingua.exe (self-update possible)."""
    return bool(getattr(sys, "frozen", False))


def current_install_dir() -> str:
    if is_frozen():
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def short_notes(notes: str, limit: int = 600) -> str:
    """Release notes without checksum lines, trimmed for a dialog."""
    lines = [ln for ln in (notes or "").splitlines() if not _SHA_RE.search(ln)]
    text = "\n".join(lines).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
