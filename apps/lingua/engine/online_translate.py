"""Optional online translation through free public services (opt-in only).

Used only when the user switches on "Allow online translation" — the text then
leaves the company network. Tries Google's free endpoint first, then MyMemory.
Goes through the company proxy via :mod:`engine.net`.
"""

from __future__ import annotations

import urllib.parse

from engine import net
from engine.offline_translate import code_for, detect

#: Argos-style codes -> public service codes.
SERVICE_CODES = {
    "en": "en", "zt": "zh-TW", "zh": "zh-CN", "id": "id", "ja": "ja", "ko": "ko", "vi": "vi",
    "th": "th", "ms": "ms", "es": "es", "fr": "fr", "de": "de", "pt": "pt", "ru": "ru",
    "ar": "ar", "hi": "hi",
}


class OnlineError(Exception):
    pass


def _google(text: str, src: str | None, tgt: str, session) -> str:
    url = ("https://translate.googleapis.com/translate_a/single?client=gtx&dt=t"
           "&sl=" + (src or "auto") + "&tl=" + tgt + "&q=" + urllib.parse.quote(text))
    resp = session.get(url, timeout=(5, 12))
    if resp.status_code != 200:
        raise OnlineError("Google HTTP {}".format(resp.status_code))
    data = resp.json()
    return "".join(part[0] for part in data[0] if part and part[0])


def _mymemory(text: str, src: str | None, tgt: str, session) -> str:
    out_lines = []
    for line in text.splitlines():
        if not line.strip():
            out_lines.append(line)
            continue
        source = src or SERVICE_CODES.get(detect(line), "en")
        if source == tgt:
            out_lines.append(line)
            continue
        url = ("https://api.mymemory.translated.net/get?q=" + urllib.parse.quote(line[:480])
               + "&langpair=" + source + "|" + tgt)
        resp = session.get(url, timeout=(5, 15))
        data = resp.json() if resp.status_code == 200 else {}
        if int(data.get("responseStatus") or 0) != 200:
            raise OnlineError("MyMemory: " + str(data.get("responseDetails") or resp.status_code))
        out_lines.append(data["responseData"]["translatedText"])
    return "\n".join(out_lines)


def translate(text: str, target: str, source: str | None = None) -> tuple[str, str]:
    """Returns ``(translation, service_name)``; raises :class:`OnlineError`."""
    tgt_code = code_for(target)
    if not tgt_code or tgt_code not in SERVICE_CODES:
        raise OnlineError("online translation does not support " + str(target))
    tgt = SERVICE_CODES[tgt_code]
    src_code = code_for(source) if source else None
    src = SERVICE_CODES.get(src_code) if src_code else None
    session = net.session()
    errors = []
    for name, fn in (("Google", _google), ("MyMemory", _mymemory)):
        try:
            out = fn(text, src, tgt, session).strip()
            if out:
                return out, name
        except Exception as err:  # network / quota / format problems
            errors.append("{}: {}".format(name, err))
    raise OnlineError("online translation failed (" + "; ".join(errors) + ")")
