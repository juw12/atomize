"""MaaS client: API-key discovery plus OCR and translation calls.

Two-stage pipeline as mandated by ``CONTRACT.md``:

1. ``ocr()``  - DeepSeek-OCR-2 turns a caption image into raw text.
2. ``translate()`` - the configured chat model turns that text into the target
   language.

The API key is discovered once and is **never** printed, logged or persisted.
All HTTP/parse failures surface as :class:`MaasError`; callers decide how to
degrade.
"""

from __future__ import annotations

import base64
import json
import os

import requests

#: Gateway endpoints and models are configured locally via environment variables.
#: The defaults are placeholders so the public repository carries no internal
#: hostnames or model catalogue.
OCR_BASE = os.environ.get("LINGUA_OCR_BASE_URL", "https://gateway.example.com/ocr/v1")
LLM_BASE = os.environ.get("LINGUA_LLM_BASE_URL", "https://gateway.example.com/llm/v1")
LLM_MODEL = os.environ.get("LINGUA_LLM_MODEL", "translate-default")
OCR_MODEL = "deepseek-ai/DeepSeek-OCR-2"

#: Translation-capable models offered in the UI model picker.
MODELS = [
    m.strip()
    for m in os.environ.get(
        "LINGUA_LLM_MODELS", "translate-default,translate-fast,translate-quality"
    ).split(",")
    if m.strip()
]

#: Model-name prefix identifying the gateway provider in the OpenCode config.
GATEWAY_MODEL_PREFIX = os.environ.get("LINGUA_GATEWAY_MODEL_PREFIX", "translate-")

#: Path to the OpenCode config used as the last-resort key source.
OPENCODE_JSON = os.path.join(
    os.path.expanduser("~"), ".config", "opencode", "opencode.json"
)

#: UI-facing language picker. Keys are what the UI shows; values are the exact
#: phrase handed to the model (``None`` = no source hint, i.e. auto-detect).
LANGUAGES = {
    "Auto (detect)": None,
    "English": "English",
    "繁體中文": "Traditional Chinese (繁體中文)",
    "Bahasa Indonesia": "Indonesian (Bahasa Indonesia)",
}

#: Pairs recognised when stripping cosmetic wrapping quotes off model output.
_QUOTE_PAIRS = {'"': '"', "'": "'", "\u201c": "\u201d", "\u2018": "\u2019"}


class MaasError(Exception):
    """Raised for any HTTP or response-parsing failure."""


def _looks_like_gateway_provider(provider: dict) -> bool:
    models = (provider or {}).get("models") or {}
    return any(str(name).startswith(GATEWAY_MODEL_PREFIX) for name in models)


def discover_api_key() -> str | None:
    """Find the MaaS API key in the contract's exact 3-step order.

    1. ``MAAS_API_KEY`` env var.
    2. ``GATEWAY_API_KEY`` env var.
    3. ``~/.config/opencode/opencode.json`` -> the ``provider.*`` entry whose
       ``models`` keys include a name starting with the gateway prefix ->
       ``options.apiKey``.

    Returns the key string or ``None``. Never logs the value.
    """
    for var in ("MAAS_API_KEY", "GATEWAY_API_KEY"):
        value = os.environ.get(var)
        if value:
            return value.strip()

    try:
        with open(OPENCODE_JSON, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return None

    providers = (data or {}).get("provider") or {}
    for provider in providers.values():
        if _looks_like_gateway_provider(provider):
            key = (provider.get("options") or {}).get("apiKey")
            if key:
                return str(key).strip()
    return None


def _clean(text: str) -> str:
    """Strip leading blank lines and cosmetic wrapping quotes from model output."""
    if not isinstance(text, str):
        return ""
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    out = "\n".join(lines).strip()
    if len(out) >= 2 and out[0] in _QUOTE_PAIRS and out[-1] == _QUOTE_PAIRS[out[0]]:
        out = out[1:-1].strip()
    return out


class MaasClient:
    """Thin OpenAI-compatible client for the gateway."""

    def __init__(
        self,
        api_key=None,
        *,
        ocr_base=OCR_BASE,
        llm_base=LLM_BASE,
        ocr_model=OCR_MODEL,
        llm_model=LLM_MODEL,
        timeout=30,
    ):
        # Store privately; nothing in this class ever logs the key.
        self._api_key = api_key if api_key is not None else discover_api_key()
        self.ocr_base = ocr_base.rstrip("/")
        self.llm_base = llm_base.rstrip("/")
        self.ocr_model = ocr_model
        self.llm_model = llm_model
        self.timeout = timeout

    def _headers(self) -> dict:
        if not self._api_key:
            raise MaasError("no API key available (set MAAS_API_KEY or run the app once)")
        return {
            "Authorization": "Bearer " + self._api_key,
            "Content-Type": "application/json",
        }

    def _post(self, url: str, payload: dict) -> dict:
        headers = self._headers()
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
        except requests.RequestException as exc:  # pragma: no cover - network path
            raise MaasError("request failed: " + str(exc)) from exc

        if getattr(resp, "status_code", 0) != 200:
            body = getattr(resp, "text", "") or ""
            raise MaasError("HTTP {}: {}".format(resp.status_code, body[:200]))

        try:
            return resp.json()
        except ValueError as exc:
            raise MaasError("invalid JSON response: " + str(exc)) from exc

    @staticmethod
    def _content(data: dict) -> str:
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise MaasError("unexpected response shape") from exc
        return _clean(text)

    def ocr(self, image_bytes: bytes, mime: str = "image/png") -> str:
        """OCR a caption image. Returns clean text (may be empty)."""
        b64 = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": self.ocr_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "<image>\nFree OCR."},
                        {
                            "type": "image_url",
                            "image_url": {"url": "data:{};base64,{}".format(mime, b64)},
                        },
                    ],
                }
            ],
        }
        return self._content(self._post(self.ocr_base + "/chat/completions", payload))

    def translate(self, text: str, target_lang: str, source_lang: str | None = None,
                  on_chunk=None) -> str:
        """Translate ``text`` into ``target_lang``; returns a clean single string.

        When ``on_chunk`` is given the response is streamed and ``on_chunk`` is
        called with the growing translation as it arrives, so the caller can
        show partial text before the sentence finishes.
        """
        system = (
            "Real-time meeting interpreter. Translate into {}. "
            "Output ONLY the translation.".format(target_lang)
        )
        user = text.strip()
        if source_lang:
            user = "(source language: {}) {}".format(source_lang, user)
        payload = {
            "model": self.llm_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
        }
        url = self.llm_base + "/chat/completions"
        if on_chunk is None:
            return self._content(self._post(url, payload))
        return self._stream(url, payload, on_chunk)

    def _stream(self, url: str, payload: dict, on_chunk) -> str:
        try:
            resp = requests.post(
                url,
                headers=self._headers(),
                json=dict(payload, stream=True),
                stream=True,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise MaasError("request failed: " + str(exc)) from exc

        if getattr(resp, "status_code", 0) != 200:
            body = getattr(resp, "text", "") or ""
            resp.close()
            raise MaasError("HTTP {}: {}".format(resp.status_code, body[:200]))

        out = ""
        try:
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content") or ""
                except (ValueError, KeyError, IndexError, TypeError):
                    continue
                if delta:
                    out += delta
                    on_chunk(out)
        finally:
            resp.close()
        return _clean(out)
