"""Shared client for the PEGATRON MaaS gateway (OpenAI-compatible).

Stdlib only. Used by eval_models.py, process_docs.py, gen_synth.py.

Credential resolution (first hit wins) - nothing hardcoded:
  1. env var PEGA_API_KEY
  2. .env file in scripts/ or CWD (PEGA_API_KEY=...)
  3. ~/.config/opencode/opencode.json -> provider.pegaai.options.{apiKey,baseURL}

Never prints the key.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "https://aicc-gateway.pegatroncorp.com/pegaai/v1"
HERE = Path(__file__).resolve().parent


def load_dotenv_key() -> str:
    for d in (HERE, Path.cwd()):
        f = d / ".env"
        if f.exists():
            for line in f.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("PEGA_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def resolve_credential() -> tuple[str, str]:
    """Return (api_key, base_url). Exits with a clear error if no key found."""
    key = os.environ.get("PEGA_API_KEY", "") or load_dotenv_key()
    base = DEFAULT_BASE_URL
    if not key:
        cfg_path = Path.home() / ".config" / "opencode" / "opencode.json"
        if cfg_path.exists():
            try:
                opts = json.loads(cfg_path.read_text(encoding="utf-8"))["provider"]["pegaai"]["options"]
                key = opts.get("apiKey", "")
                if opts.get("baseURL"):
                    base = opts["baseURL"].rstrip("/")
            except (json.JSONDecodeError, KeyError, TypeError):
                pass
    if not key:
        raise SystemExit("[error] no API key. Set PEGA_API_KEY env var or create scripts/.env")
    return key, base.rstrip("/")


def _post(base_url: str, api_key: str, payload: dict, timeout: float):
    url = base_url + "/chat/completions"
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")[:200]
        except OSError:
            body = ""
        return e.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return -1, f"{type(e).__name__}: {str(e)[:160]}"


def chat(api_key: str, base_url: str, model: str, messages: list[dict],
         max_tokens: int = 2048, temperature: float = 0.3,
         timeout: float = 180.0, retries: int = 3) -> dict:
    """One chat completion. Returns:
    {ok: bool, content: str, usage: {prompt_tokens, completion_tokens, total_tokens},
     latency_ms: float, error: str, model_used: str, estimated: bool}
    Retries 429/5xx with backoff; on 404 retries once with 'pegaai/' prefix (or strips it).
    """
    last_err = ""
    for attempt in range(retries):
        used = model
        if attempt == 1:
            used = model if "/" in model else f"pegaai/{model}"
        elif attempt == 2 and used.startswith("pegaai/"):
            used = model
        t0 = time.monotonic()
        status, data = _post(base_url, api_key,
                             {"model": used, "messages": messages,
                              "max_tokens": max_tokens, "temperature": temperature},
                             timeout)
        latency = (time.monotonic() - t0) * 1000
        if status == 404:
            last_err = "404 model not found"
            continue
        if status in (429, 500, 502, 503, 504) or status < 0:
            last_err = f"HTTP {status}" if status > 0 else str(data)
            time.sleep(5 * (attempt + 1))
            continue
        if status != 200:
            return {"ok": False, "error": f"HTTP {status}: {str(data)[:200]}",
                    "latency_ms": latency}
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage") or {}
        if not content and not usage:
            return {"ok": False, "error": "empty response body", "latency_ms": latency}
        est = 0
        if not usage.get("total_tokens"):
            est = sum(len(m.get("content", "")) for m in messages) // 4 + len(content) // 4
            usage = {"prompt_tokens": usage.get("prompt_tokens"),
                     "completion_tokens": usage.get("completion_tokens"),
                     "total_tokens": est}
        return {"ok": True, "content": content, "usage": usage,
                "latency_ms": latency, "error": "", "model_used": used,
                "estimated": bool(est)}
    return {"ok": False, "error": last_err, "latency_ms": 0.0}


def list_models(api_key: str, base_url: str, timeout: float = 30.0) -> list[str]:
    """Return enabled model ids from GET /models ([] on failure)."""
    req = urllib.request.Request(base_url + "/models",
                                 headers={"Authorization": f"Bearer {api_key}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
        return [m["id"] for m in data.get("data", []) if m.get("enabled", True)]
    except (urllib.error.URLError, OSError, json.JSONDecodeError, KeyError):
        return []
