"""Local AI translation through Ollama on this PC.

Only ever talks to ``http://127.0.0.1:11434`` and ignores proxy settings, so
text never leaves the laptop. Cloud-tagged models are refused. Nothing here
saves source text, translations, context or glossaries.

Used by:

* :func:`engine.maas.MaasClient.translate_with_fallback` as the first fallback
  when the company gateway models fail (better quality than offline packs).
* :mod:`engine.text_desk` / ``ui/text_translate.py`` for the Translate-text
  desk (tone, context, glossary, alternatives and word-choice notes).
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get("LINGUA_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_MODEL = os.environ.get("LINGUA_LOCAL_AI_MODEL", "qwen3:8b")
PREFERRED_MODELS = ("qwen3:8b", "qwen3-32k:latest", "qwen3:14b", "qwen2.5:7b")
HEALTH_SECONDS = 30.0
REQUEST_TIMEOUT = float(os.environ.get("LINGUA_LOCAL_AI_TIMEOUT", "120"))

_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_health_lock = threading.Lock()
_health: dict = {"checked": 0.0, "models": []}


class Cancelled(Exception):
    """The user pressed Stop while the local model was answering."""


class LocalAIError(Exception):
    """Ollama is not running, the model is missing, or it answered badly."""


def is_cloud_model(name: str) -> bool:
    return "cloud" in (name or "").casefold()


def list_models(refresh: bool = False) -> list[str]:
    """Installed local (non-cloud) models; ``[]`` when Ollama is not running.

    The answer is cached for :data:`HEALTH_SECONDS` so translation fallbacks do
    not probe Ollama on every caption line.
    """
    with _health_lock:
        if not refresh and time.time() - _health["checked"] < HEALTH_SECONDS:
            return list(_health["models"])
    models: list[str] = []
    try:
        with _opener.open(BASE_URL + "/api/tags", timeout=2.5) as response:
            data = json.load(response)
        models = [
            item["name"] for item in data.get("models", [])
            if item.get("name") and not is_cloud_model(item["name"]) and not item.get("remote_model")
        ]
    except (OSError, ValueError, urllib.error.URLError):
        models = []
    with _health_lock:
        _health["checked"] = time.time()
        _health["models"] = models
    return list(models)


def available() -> bool:
    return bool(list_models())


def pick_model(preferred: str | None = None) -> str | None:
    """The model to use: the preferred one if installed, else a known good one."""
    models = list_models()
    if not models:
        return None
    for name in [preferred, DEFAULT_MODEL, *PREFERRED_MODELS]:
        if name and name in models:
            return name
    return models[0]


def chat(payload: dict, cancel: threading.Event | None = None, on_chunk=None,
         timeout: float | None = None) -> tuple[str, dict]:
    """POST /api/chat. Streams when ``payload['stream']``; returns (text, last message)."""
    cancel = cancel or threading.Event()
    if cancel.is_set():
        raise Cancelled()
    if is_cloud_model(payload.get("model", "")):
        raise LocalAIError("cloud models are not used by Lingua's local AI")
    request = urllib.request.Request(
        BASE_URL + "/api/chat",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    output: list[str] = []
    last: dict = {}
    try:
        with _opener.open(request, timeout=timeout or REQUEST_TIMEOUT) as response:
            if not payload.get("stream"):
                last = json.load(response)
                if cancel.is_set():
                    raise Cancelled()
                if last.get("error"):
                    raise LocalAIError(str(last["error"]))
                return (last.get("message") or {}).get("content", "").strip(), last
            for line in response:
                if cancel.is_set():
                    raise Cancelled()
                if not line.strip():
                    continue
                last = json.loads(line)
                if last.get("error"):
                    raise LocalAIError(str(last["error"]))
                chunk = (last.get("message") or {}).get("content", "")
                if chunk:
                    output.append(chunk)
                    if on_chunk is not None:
                        on_chunk("".join(output))
                if last.get("done"):
                    break
    except urllib.error.HTTPError as err:
        if err.code == 404:
            raise LocalAIError("the local model is not installed (ollama pull " + str(payload.get("model")) + ")") from err
        raise LocalAIError("Ollama returned HTTP {}".format(err.code)) from err
    except (urllib.error.URLError, OSError) as err:
        _forget_health()
        raise LocalAIError("local AI (Ollama) is not running") from err
    if cancel.is_set():
        raise Cancelled()
    if not last.get("done"):
        raise LocalAIError("the local model stopped before finishing; please retry")
    return "".join(output).strip(), last


def _forget_health() -> None:
    with _health_lock:
        _health["checked"] = 0.0
        _health["models"] = []


def quick_translate(text: str, target: str, source: str | None = None, *,
                    purpose: str = "meeting", model: str | None = None,
                    timeout: float | None = None) -> tuple[str, str]:
    """Plain translation used by the engine fallback chain; returns (text, model)."""
    name = pick_model(model)
    if not name:
        raise LocalAIError("local AI (Ollama) is not running")
    from engine import text_desk

    job = text_desk.TextJob(text=text, source=source, target=target,
                            keep_lines=(purpose == "document"))
    out, _meta = chat({
        "model": name,
        "messages": text_desk.make_messages(job),
        "stream": False,
        "think": False,
        "keep_alive": "10m",
        "options": {"temperature": 0.15, "num_ctx": 8192, "num_predict": 2048},
    }, timeout=timeout)
    out = text_desk.finish(out, target)
    if not out:
        raise LocalAIError("the local model returned an empty translation")
    return out, name
