"""Offline translation on this PC (no data leaves the laptop).

Uses the free Argos Translate language packs (OpenNMT models, MIT/CC licences)
run with CTranslate2 + SentencePiece. Packs are downloaded once per language
pair into ``%LOCALAPPDATA%\\lingua\\models`` and reused. Pairs without a direct
pack go through English (e.g. 日本語 -> English -> 繁體中文).

Text read from pictures is often mixed (an English line, a Chinese line, an
Indonesian line), so each line is detected and translated on its own; lines
already in the target language are kept as they are.

``ctranslate2`` / ``sentencepiece`` are imported lazily, so the rest of Lingua
(and its tests) work without them.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import threading
import time
import zipfile
from typing import Callable

INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
INDEX_MAX_AGE_S = 7 * 24 * 3600

#: Lingua language names -> Argos language codes ("zt" = Traditional Chinese).
CODE_BY_NAME = {
    "English": "en",
    "繁體中文": "zt",
    "简体中文": "zh",
    "Bahasa Indonesia": "id",
    "日本語": "ja",
    "한국어": "ko",
    "Tiếng Việt": "vi",
    "ไทย": "th",
    "Bahasa Melayu": "ms",
    "Español": "es",
    "Français": "fr",
    "Deutsch": "de",
    "Português": "pt",
    "Русский": "ru",
    "العربية": "ar",
    "हिन्दी": "hi",
}
NAME_BY_CODE = {code: name for name, code in CODE_BY_NAME.items()}


class OfflineError(Exception):
    """Offline translation is not possible (engine or language pack missing)."""


# -- language codes & detection ------------------------------------------------

def code_for(language: str | None) -> str | None:
    """Map a Lingua name ("繁體中文") or prompt phrase ("Traditional Chinese (繁體中文)") to a code."""
    if not language:
        return None
    language = language.strip()
    if language in CODE_BY_NAME:
        return CODE_BY_NAME[language]
    if language in NAME_BY_CODE:
        return language
    for name, code in CODE_BY_NAME.items():
        if name in language:
            return code
    lowered = language.lower()
    for word, code in (("traditional", "zt"), ("simplified", "zh"), ("english", "en"), ("japanese", "ja"),
                       ("korean", "ko"), ("indonesian", "id"), ("vietnamese", "vi"), ("thai", "th"),
                       ("malay", "ms"), ("spanish", "es"), ("french", "fr"), ("german", "de"),
                       ("portuguese", "pt"), ("russian", "ru"), ("arabic", "ar"), ("hindi", "hi"),
                       ("chinese", "zt")):
        if word in lowered:
            return code
    return None


_TRAD = set("這們個來說時會對開關門體點電話國學寫讀聽請續應該與從現將據為後裡麼還樣邊間與無經過產業務")
_SIMP = set("这们个来说时会对开关门体点电话国学写读听请续应该与从现将据为后里么还样边间与无经过产业务")
_STOPWORDS = {
    "en": {"the", "and", "is", "are", "to", "of", "please", "keep", "you", "for", "this", "with", "in", "on", "not"},
    "id": {"dan", "yang", "di", "ke", "dari", "harap", "tidak", "untuk", "ini", "itu", "dengan", "pintu", "silakan", "tutup", "ditutup"},
    "ms": {"dan", "yang", "di", "ke", "dari", "sila", "tidak", "untuk", "ini", "itu", "dengan", "pintu", "tutup"},
    "es": {"el", "la", "los", "las", "de", "que", "y", "por", "favor", "puerta", "es", "no", "para", "con"},
    "fr": {"le", "la", "les", "de", "des", "et", "est", "pas", "pour", "vous", "merci", "porte", "une", "un"},
    "de": {"der", "die", "das", "und", "ist", "nicht", "bitte", "tür", "sie", "mit", "für", "zu", "ein"},
    "pt": {"o", "a", "os", "as", "de", "que", "e", "não", "por", "favor", "porta", "para", "com", "um"},
}
_VI_MARKS = set("ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ")


def detect(text: str) -> str:
    """Best-effort language code for one line of text (defaults to English)."""
    counts = {"kana": 0, "hangul": 0, "han": 0, "thai": 0, "arabic": 0, "deva": 0, "cyr": 0, "latin": 0}
    for ch in text:
        o = ord(ch)
        if 0x3040 <= o <= 0x30FF:
            counts["kana"] += 1
        elif 0xAC00 <= o <= 0xD7AF or 0x1100 <= o <= 0x11FF:
            counts["hangul"] += 1
        elif 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF:
            counts["han"] += 1
        elif 0x0E00 <= o <= 0x0E7F:
            counts["thai"] += 1
        elif 0x0600 <= o <= 0x06FF:
            counts["arabic"] += 1
        elif 0x0900 <= o <= 0x097F:
            counts["deva"] += 1
        elif 0x0400 <= o <= 0x04FF:
            counts["cyr"] += 1
        elif ch.isalpha():
            counts["latin"] += 1
    if counts["kana"]:
        return "ja"
    if counts["hangul"]:
        return "ko"
    script = max(counts, key=counts.get)
    if counts[script] == 0:
        return "en"
    if script == "han":
        trad = sum(ch in _TRAD for ch in text)
        simp = sum(ch in _SIMP for ch in text)
        return "zh" if simp > trad else "zt"
    simple = {"thai": "th", "arabic": "ar", "deva": "hi", "cyr": "ru"}
    if script in simple:
        return simple[script]
    lowered = text.lower()
    if sum(ch in _VI_MARKS for ch in lowered) >= 2:
        return "vi"
    words = re.findall(r"[^\W\d_]+", lowered)
    best, best_score = "en", 0
    for code, stop in _STOPWORDS.items():
        score = sum(w in stop for w in words)
        if score > best_score:
            best, best_score = code, score
    return best


# -- language packs ------------------------------------------------------------

def models_dir() -> str:
    base = os.environ.get("LINGUA_MODELS_DIR") or os.path.join(
        os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "lingua", "models")
    os.makedirs(base, exist_ok=True)
    return base


def engine_available() -> bool:
    try:
        import ctranslate2  # noqa: F401
        import sentencepiece  # noqa: F401
    except Exception:
        return False
    return True


class _SentencePieceTokenizer:
    def __init__(self, path: str) -> None:
        import sentencepiece

        self.sp = sentencepiece.SentencePieceProcessor(model_file=path)

    def encode(self, text: str) -> list[str]:
        return self.sp.encode(text, out_type=str)

    def decode(self, tokens: list[str]) -> str:
        # Argos packs use their own shared vocabulary; join pieces and turn the
        # SentencePiece word marker back into spaces (same as Argos itself).
        return "".join(tokens).replace("\u2581", " ").strip()


class _BPETokenizer:
    """Moses tokenisation + subword-nmt BPE, as used by some Argos packs."""

    def __init__(self, path: str, src: str, tgt: str) -> None:
        from sacremoses import MosesDetokenizer, MosesPunctNormalizer, MosesTokenizer
        from subword_nmt.apply_bpe import BPE

        self.normalizer = MosesPunctNormalizer(src)
        self.tokenizer = MosesTokenizer(src)
        self.detokenizer = MosesDetokenizer(tgt)
        with open(path, encoding="utf-8") as fh:
            self.bpe = BPE(fh)

    def encode(self, text: str) -> list[str]:
        normalized = self.normalizer.normalize(text)
        tokens = self.tokenizer.tokenize(normalized, escape=False)
        return self.bpe.segment_tokens(tokens)

    def decode(self, tokens: list[str]) -> str:
        text = " ".join(tokens).replace("@@ ", "").replace(" @@", "")
        if text.endswith("@@"):
            text = text[:-2]
        return self.detokenizer.detokenize(text.split(" "))


def pair_dir(src: str, tgt: str) -> str:
    return os.path.join(models_dir(), "{}_{}".format(src, tgt))


TOKENIZER_FILES = ("sentencepiece.model", "bpe.model")


def is_installed(src: str, tgt: str) -> bool:
    folder = pair_dir(src, tgt)
    return os.path.isdir(os.path.join(folder, "model")) and any(
        os.path.isfile(os.path.join(folder, name)) for name in TOKENIZER_FILES)


def installed_pairs() -> list[tuple[str, str]]:
    pairs = []
    for name in sorted(os.listdir(models_dir())):
        if "_" in name and len(name) <= 7:
            src, tgt = name.split("_", 1)
            if is_installed(src, tgt):
                pairs.append((src, tgt))
    return pairs


def load_index(session=None, refresh: bool = False) -> list[dict]:
    path = os.path.join(models_dir(), "index.json")
    fresh = os.path.exists(path) and time.time() - os.path.getmtime(path) < INDEX_MAX_AGE_S
    if fresh and not refresh:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    if session is None:
        from engine import net

        session = net.session()
    try:
        resp = session.get(INDEX_URL, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as err:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)
        raise OfflineError("could not load the language-pack list: " + str(err)) from err
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    return data


def route(src: str, tgt: str, index: list[dict] | None = None) -> list[tuple[str, str]]:
    """Pack pairs needed to go from ``src`` to ``tgt`` (direct or via English)."""
    if src == tgt:
        return []
    direct = (src, tgt)
    if is_installed(*direct):
        return [direct]
    available = {(p.get("from_code"), p.get("to_code")) for p in (index or [])}
    if index is not None and direct in available:
        return [direct]
    if src == "en" or tgt == "en":
        return [direct]
    return [(src, "en"), ("en", tgt)]


def missing_packs(src: str, tgt: str, index: list[dict] | None = None) -> list[tuple[str, str]]:
    return [pair for pair in route(src, tgt, index) if not is_installed(*pair)]


def install_pack(src: str, tgt: str, progress: Callable[[int, int], None] | None = None,
                 session=None, index: list[dict] | None = None) -> str:
    """Download and unpack one language pack; returns its folder."""
    if is_installed(src, tgt):
        return pair_dir(src, tgt)
    if session is None:
        from engine import net

        session = net.session()
    index = index if index is not None else load_index(session)
    entry = next((p for p in index if p.get("from_code") == src and p.get("to_code") == tgt), None)
    if entry is None or not entry.get("links"):
        raise OfflineError("no offline pack for {} -> {}".format(NAME_BY_CODE.get(src, src), NAME_BY_CODE.get(tgt, tgt)))
    url = entry["links"][0]
    work = tempfile.mkdtemp(prefix="lingua-pack-")
    archive = os.path.join(work, "pack.zip")
    try:
        with session.get(url, stream=True, timeout=(10, 60)) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("Content-Length") or 0)
            done = 0
            with open(archive, "wb") as out:
                for chunk in resp.iter_content(256 * 1024):
                    out.write(chunk)
                    done += len(chunk)
                    if progress:
                        progress(done, total)
        with zipfile.ZipFile(archive) as zf:
            for member in zf.namelist():
                if ".." in member.replace("\\", "/").split("/"):
                    raise OfflineError("unsafe path in language pack")
            zf.extractall(work)
        root = None
        for folder, _dirs, files in os.walk(work):
            if any(name in files for name in TOKENIZER_FILES) and os.path.isdir(os.path.join(folder, "model")):
                root = folder
                break
        if root is None:
            raise OfflineError("language pack has an unexpected layout")
        dest = pair_dir(src, tgt)
        if os.path.exists(dest):
            shutil.rmtree(dest, ignore_errors=True)
        shutil.move(root, dest)
        return dest
    except OfflineError:
        raise
    except Exception as err:
        raise OfflineError("language pack download failed: " + str(err)) from err
    finally:
        shutil.rmtree(work, ignore_errors=True)


# -- translation ------------------------------------------------------------------

_cache: dict[tuple[str, str], tuple] = {}
_cache_lock = threading.Lock()
_SENTENCE_RE = re.compile(r"(?<=[.!?。！？])\s+|(?<=[。！？])")


def _load(src: str, tgt: str):
    with _cache_lock:
        if (src, tgt) in _cache:
            return _cache[(src, tgt)]
        if not is_installed(src, tgt):
            raise OfflineError("offline pack {}->{} is not installed".format(src, tgt))
        import ctranslate2

        folder = pair_dir(src, tgt)
        spm_path = os.path.join(folder, "sentencepiece.model")
        try:
            if os.path.isfile(spm_path):
                tokenizer = _SentencePieceTokenizer(spm_path)
            else:
                tokenizer = _BPETokenizer(os.path.join(folder, "bpe.model"), src, tgt)
        except ImportError as err:
            raise OfflineError("offline engine is missing a tokenizer library: " + str(err)) from err
        translator = ctranslate2.Translator(os.path.join(folder, "model"), device="cpu",
                                            compute_type="int8", inter_threads=1,
                                            intra_threads=max(1, (os.cpu_count() or 2) // 2))
        _cache[(src, tgt)] = (translator, tokenizer)
        return translator, tokenizer


def _translate_pair(text: str, src: str, tgt: str) -> str:
    translator, tokenizer = _load(src, tgt)
    sentences = [s for s in _SENTENCE_RE.split(text.strip()) if s.strip()] or [text]
    batch = [tokenizer.encode(s.strip()) for s in sentences]
    results = translator.translate_batch(batch, beam_size=2, max_decoding_length=256)
    pieces = [tokenizer.decode(r.hypotheses[0]) for r in results]
    joiner = "" if tgt in ("zh", "zt", "ja", "th") else " "
    out = joiner.join(p.strip() for p in pieces).strip()
    if tgt in ("zh", "zt", "ja"):
        out = re.sub(r"(?<=[\u3000-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u9fff\uff00-\uffef])", "，" if tgt != "ja" else "、", out)
    return out


def _translate_line(line: str, src: str | None, tgt: str) -> str:
    if not line.strip():
        return line
    if not re.search(r"[^\W\d_]", line):  # numbers / symbols only
        return line
    lang = src or detect(line)
    if lang == tgt:
        return line
    out = line
    letters = [ch for ch in line if ch.isalpha()]
    if letters and all(ch.isascii() for ch in letters) and line.upper() == line and len(letters) > 3:
        out = _soften_caps(line)  # "MEETING ROOM 3B" -> "Meeting room 3B" translates much better
    # Small packs garble short labels that carry a room/gate code ("Meeting room 3B" -> "3B室"),
    # so translate the words and put leading/trailing codes back untouched.
    head, body, tail = _split_codes(out)
    if not re.search(r"[^\W\d_]", body):
        return line
    for a, b in route(lang, tgt):
        body = _translate_pair(body, a, b)
    cjk_target = tgt in ("zh", "zt", "ja", "th")
    joiner = "" if cjk_target else " "
    out = joiner.join(part for part in (head, body, tail) if part)
    return _TIME_GAP_RE.sub(r"\1:\2", out)  # "14: 00" -> "14:00"


_TIME_GAP_RE = re.compile(r"(\d) ?: (\d)")


_CODE_TOKEN = re.compile(r"^[#(\[]?[A-Za-z]{0,3}[-/]?\d[\w\-/.]*[)\]:]?$")
_ORDINAL = re.compile(r"^\d+(st|nd|rd|th)$", re.IGNORECASE)


def _is_code(word: str) -> bool:
    return bool(_CODE_TOKEN.match(word)) and not _ORDINAL.match(word)


def _split_codes(line: str) -> tuple[str, str, str]:
    """Peel leading/trailing tokens with digits (3B, B2, #12, 4F) off a line."""
    words = line.strip().split()
    head: list[str] = []
    tail: list[str] = []
    while len(words) > 1 and _is_code(words[0]):
        head.append(words.pop(0))
    while len(words) > 1 and _is_code(words[-1]):
        tail.insert(0, words.pop())
    return " ".join(head), " ".join(words), " ".join(tail)


def can_translate(src: str | None, tgt: str, sample: str = "") -> bool:
    """True when the engine and every needed pack for ``sample`` are on this PC."""
    if not engine_available() or not tgt:
        return False
    sources = {src} if src else {detect(line) for line in sample.splitlines() if line.strip()} or {"en"}
    return all(not missing_packs(s, tgt) for s in sources if s != tgt)


def needed_for(text: str, src: str | None, tgt: str, index: list[dict] | None = None) -> list[tuple[str, str]]:
    """Packs still missing to translate ``text`` into ``tgt``."""
    sources = {src} if src else {detect(line) for line in text.splitlines() if line.strip()}
    missing: list[tuple[str, str]] = []
    for s in sorted(sources):
        if s and s != tgt:
            for pair in missing_packs(s, tgt, index):
                if pair not in missing:
                    missing.append(pair)
    return missing


def translate(text: str, target: str, source: str | None = None) -> str:
    """Translate ``text`` (line by line) into ``target`` using installed packs.

    ``target`` / ``source`` accept Lingua names, prompt phrases or codes.
    Raises :class:`OfflineError` when the engine or a needed pack is missing.
    """
    tgt = code_for(target)
    src = code_for(source) if source else None
    if not tgt:
        raise OfflineError("offline translation does not support " + str(target))
    if not engine_available():
        raise OfflineError("offline engine is not installed")
    missing = needed_for(text, src, tgt)
    if missing:
        raise OfflineError("offline language pack needed: " + ", ".join(
            "{} → {}".format(NAME_BY_CODE.get(a, a), NAME_BY_CODE.get(b, b)) for a, b in missing))
    out = "\n".join(_translate_line(line, src, tgt) for line in text.splitlines())
    return _to_traditional(out) if tgt == "zt" else out


def _soften_caps(line: str) -> str:
    """Lower-case ALL-CAPS words (keep codes like 3B / HDMI-2), capitalise the first word."""
    words = line.split(" ")
    softened = []
    for word in words:
        if word.isalpha() and len(word) > 1:
            word = word.lower()
        softened.append(word)
    text = " ".join(softened)
    return text[:1].upper() + text[1:]


_opencc = None


def _to_traditional(text: str) -> str:
    """Some packs mix Simplified characters into Traditional output; normalise to
    Taiwan Traditional (with Taiwan wording) when OpenCC is available."""
    global _opencc
    try:
        if _opencc is None:
            from opencc import OpenCC

            _opencc = OpenCC("s2twp")
        return _opencc.convert(text)
    except Exception:
        return text
